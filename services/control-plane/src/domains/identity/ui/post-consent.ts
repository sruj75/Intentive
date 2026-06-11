/**
 * `POST /consent` handler — the HTTP boundary for recording Consent Primer
 * completion (cross-client).
 *
 * Transport-agnostic like `GET /me`: it takes the `Authorization` header and the
 * parsed JSON body and returns a plain `{ status, body }`. It delegates the
 * "who is this caller" decision to `requireUser` (shared with every other
 * authenticated endpoint), records the gate for that user, and validates the
 * request and response at the boundary. The write is idempotent in the repo, so
 * a re-`POST` is a safe no-op that still returns `{ ok: true }`.
 */
import { PostConsentRequest, parseBoundary } from "@intentive/api-contract";

import { requireUser, type Authenticator } from "../../../http/auth.js";
import { consentAccepted } from "./ack.js";

export interface PostConsentRequestHttp {
  /** Raw `Authorization` header value, or null when absent. */
  authorization: string | null;
  /** Parsed JSON request body (validated here at the boundary). */
  body: unknown;
}

export interface PostConsentResult {
  status: number;
  body: unknown;
}

export interface PostConsentHandler {
  handle(req: PostConsentRequestHttp): Promise<PostConsentResult>;
}

export function createPostConsentHandler(deps: {
  identity: Authenticator;
  gates: { recordConsent(userId: string): Promise<void> };
}): PostConsentHandler {
  return {
    async handle({ authorization, body }) {
      const auth = await requireUser(authorization, deps.identity);
      if (!auth.ok) return auth.response;

      parseBoundary(PostConsentRequest, body ?? {});
      await deps.gates.recordConsent(auth.userId);
      return { status: 200, body: consentAccepted() };
    },
  };
}
