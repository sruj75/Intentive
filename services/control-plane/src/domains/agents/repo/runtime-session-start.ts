/**
 * Session Start client — the only place that knows the Agent Runtime's
 * `POST /internal/sessions/start` wire contract.
 *
 * A deep module behind a one-method `SessionStarter` port: callers ask the
 * Runtime to get-or-create the session for a User and get back the Runtime's
 * identity (`agentInstanceId`, `wsUrl`). Hidden in here: the URL, the
 * Directional Secret (`INTERNAL_SECRET_TO_RUNTIME`) on the `Authorization`
 * header, the request/response wire shapes (validated against the shared
 * `@intentive/api-contract` internal schemas), and the collapse of every way the
 * call can go wrong into one typed error.
 *
 * Any transport failure, non-2xx status, or unparseable body surfaces as
 * `AgentRuntimeUnavailableError` — the single signal Routing maps to a retryable
 * `503` (decision #5). The error's message never carries the Runtime's response
 * body or the secret; it names only the failure mode, because this sits on the
 * `GET /agent` hot path.
 */
import {
  PostInternalSessionsStartRequest,
  PostInternalSessionsStartResponse,
} from "@intentive/api-contract";

import { AgentRuntimeUnavailableError } from "../types/runtime-errors.js";

/** Minimal `fetch` shape this client depends on, so tests can inject a fake. */
export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * The narrow Agent Runtime capability the agents service needs: "start (or
 * resume) the session for this User and tell me where the Runtime is". The
 * Runtime's Session Start is itself idempotent, so a repeat call for the same
 * User returns the same instance.
 */
export interface SessionStarter {
  startSession(input: {
    userId: string;
    authSubject: string;
  }): Promise<{ agentInstanceId: string; wsUrl: string }>;
}

/**
 * Build a `SessionStarter` bound to one Agent Runtime base URL and Directional
 * Secret. `fetch` is injected (defaults to the global) so the unit tier can drive
 * every branch without a network. Construct once at the composition root and
 * reuse.
 */
export function createRuntimeSessionStarter(deps: {
  baseUrl: string;
  secret: string;
  fetch?: FetchLike;
}): SessionStarter {
  const doFetch = deps.fetch ?? (globalThis.fetch as unknown as FetchLike);
  // Trim a trailing slash so `${baseUrl}/internal/...` never doubles up.
  const url = `${deps.baseUrl.replace(/\/$/, "")}/internal/sessions/start`;

  return {
    async startSession({ userId, authSubject }) {
      const body = PostInternalSessionsStartRequest.parse({
        user_id: userId,
        auth_subject: authSubject,
      });

      let res;
      try {
        res = await doFetch(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${deps.secret}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        });
      } catch {
        // Network/DNS/connection-refused — the Runtime can't be reached. Swallow
        // the cause so the secret and target can't leak into a log line.
        throw new AgentRuntimeUnavailableError(
          "transport",
          "Agent Runtime Session Start could not be reached.",
        );
      }

      if (!res.ok) {
        throw new AgentRuntimeUnavailableError(
          "non_2xx",
          `Agent Runtime Session Start returned ${res.status}.`,
        );
      }

      let payload: unknown;
      try {
        payload = await res.json();
      } catch {
        throw new AgentRuntimeUnavailableError(
          "malformed_response",
          "Agent Runtime Session Start returned an unreadable body.",
        );
      }

      const parsed = PostInternalSessionsStartResponse.safeParse(payload);
      if (!parsed.success) {
        // A 2xx with a garbage body is as unusable as no response — same retryable
        // signal, never a leak of the offending payload.
        throw new AgentRuntimeUnavailableError(
          "malformed_response",
          "Agent Runtime Session Start returned a body that did not match the contract.",
        );
      }

      return { agentInstanceId: parsed.data.agent_instance_id, wsUrl: parsed.data.ws_url };
    },
  };
}
