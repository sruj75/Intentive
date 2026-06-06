/**
 * The real LaunchStateSource — hydrates Launch State from Control Plane `GET /me`.
 *
 * Replaces the dev stub (#23). Thin by design: get the User JWT, call `/me` with
 * it, validate the response at the boundary, and hand off to the pure mapper.
 * All collaborators (`getUserJwt`, `fetch`) are injected, so this stays RN-free
 * and unit-testable with fakes — no real network, no auth SDK.
 *
 * Failure policy: a missing session returns the signed-out projection; a failed
 * request *throws*, so the store's hydration `.catch` applies its signed-out
 * fallback. We don't duplicate that fallback here.
 */
import { AccountState, parseBoundary } from "@intentive/api-contract";

import { mapAccountStateToLaunchState } from "../../domains/onboarding/service/account-state-to-launch-state.js";
import type { LaunchStateSource } from "./source.js";
import type { LaunchState } from "./types.js";

/** Minimal fetch surface this source needs — declared locally so the pure-core
 * build depends on no DOM/node lib types. The composition root passes the real
 * global `fetch`; tests pass a fake. */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export interface FetchLike {
  (url: string, init?: { headers?: Record<string, string> }): Promise<FetchResponseLike>;
}

export interface ControlPlaneLaunchStateSourceDeps {
  /** Control Plane base URL, e.g. `https://control-plane.example`. */
  baseUrl: string;
  /** Returns the current Neon Auth User JWT, or null when there is no session. */
  getUserJwt: () => Promise<string | null>;
  fetch: FetchLike;
}

// Walk-safe signed-out projection: the resolver short-circuits on `signedIn:
// false` and never inspects these (concrete, non-null) gate placeholders.
const SIGNED_OUT: LaunchState = {
  signedIn: false,
  consent: "pending",
  siblingInvitation: "pending",
};

export function createControlPlaneLaunchStateSource(
  deps: ControlPlaneLaunchStateSourceDeps,
): LaunchStateSource {
  return {
    async read(): Promise<LaunchState> {
      const jwt = await deps.getUserJwt();
      if (jwt === null) return SIGNED_OUT;

      const res = await deps.fetch(`${deps.baseUrl}/me`, {
        headers: { authorization: `Bearer ${jwt}` },
      });
      if (!res.ok) {
        throw new Error(`GET /me failed with status ${res.status}`);
      }

      const account = parseBoundary(AccountState, await res.json());
      return mapAccountStateToLaunchState(account);
    },
  };
}
