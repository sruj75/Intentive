import { GetAgentResponse, parseBoundary } from "@intentive/api-contract";

import type { RoutingResult } from "../types/conversation.js";

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export interface FetchLike {
  (url: string, init?: { readonly headers?: Record<string, string> }): Promise<FetchResponseLike>;
}

export interface RoutingClientDeps {
  readonly baseUrl: string;
  readonly getUserJwt: () => Promise<string | null>;
  readonly fetch: FetchLike;
}

export async function getRuntimeRouting(deps: RoutingClientDeps): Promise<RoutingResult> {
  const userJwt = await deps.getUserJwt();
  if (userJwt === null) return { status: "reauth" };

  const res = await deps.fetch(`${deps.baseUrl}/agent`, {
    headers: { authorization: `Bearer ${userJwt}` },
  });

  if (res.status === 503) return { status: "retry", retryAfterMs: parseRetryAfterMs(res) };
  if (res.status === 401) return { status: "reauth" };
  if (res.status === 403) return { status: "gate" };
  if (!res.ok) return { status: "retry" };

  const routing = parseBoundary(GetAgentResponse, await res.json());
  return {
    status: "ok",
    routing: {
      agentInstanceId: routing.agent_instance_id,
      wsUrl: routing.ws_url,
      runtimeJwt: routing.runtime_jwt,
    },
  };
}

function parseRetryAfterMs(res: FetchResponseLike): number | undefined {
  const headers = res as FetchResponseLike & {
    readonly headers?: { get(name: string): string | null };
  };
  const value = headers.headers?.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}
