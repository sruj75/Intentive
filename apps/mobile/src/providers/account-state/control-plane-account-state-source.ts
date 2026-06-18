import { AccountState, parseBoundary } from "@intentive/api-contract";

import type { AccountStateSource } from "./source.js";

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export interface FetchLike {
  (url: string, init?: { headers?: Record<string, string> }): Promise<FetchResponseLike>;
}

export interface ControlPlaneAccountStateSourceDeps {
  readonly baseUrl: string;
  readonly getUserJwt: () => Promise<string | null>;
  readonly fetch: FetchLike;
}

export function createControlPlaneAccountStateSource(
  deps: ControlPlaneAccountStateSourceDeps,
): AccountStateSource {
  return {
    async read() {
      const jwt = await deps.getUserJwt();
      if (jwt === null) return null;
      if (deps.baseUrl.trim().length === 0) {
        throw new Error("Control Plane base URL is not configured");
      }

      const res = await deps.fetch(`${deps.baseUrl}/me`, {
        headers: { authorization: `Bearer ${jwt}` },
      });
      if (!res.ok) {
        throw new Error(`GET /me failed with status ${res.status}`);
      }

      return parseBoundary(AccountState, await res.json());
    },
  };
}
