/**
 * The real LaunchStateSource — hydrates Launch State from Control Plane `GET /me`.
 *
 * Replaces the dev stub (#23). Thin by design: read Control Plane account
 * state, then hand off to the pure mapper. All collaborators are injected, so
 * this stays RN-free and unit-testable with fakes — no real network, no auth SDK.
 *
 * Failure policy: a missing session returns the signed-out projection; a failed
 * request *throws*, so the store's hydration `.catch` applies its signed-out
 * fallback. We don't duplicate that fallback here.
 */
import { mapAccountStateToLaunchState } from "../../domains/onboarding/service/account-state-to-launch-state.js";
import { createControlPlaneAccountStateSource } from "../account-state/control-plane-account-state-source.js";
import type { AccountStateSource } from "../account-state/source.js";
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
  /**
   * The shared `GET /me` reader. Injected by the composition root so Launch State
   * and the Account State projection read through one Account State Source instead
   * of constructing the seam twice (ADR-0027). Defaults to a fresh source built
   * from the fetch deps, keeping the standalone/test call sites unchanged.
   */
  accountStateSource?: AccountStateSource;
}

// Walk-safe signed-out projection: the resolver short-circuits on `signedIn:
// false` and never inspects these (concrete, non-null) gate placeholders.
const SIGNED_OUT: LaunchState = {
  signedIn: false,
  consent: "pending",
  onboarding: "pending",
  siblingInvitation: "pending",
  trial: "pending",
};

export function createControlPlaneLaunchStateSource(
  deps: ControlPlaneLaunchStateSourceDeps,
): LaunchStateSource {
  const accountStateSource = deps.accountStateSource ?? createControlPlaneAccountStateSource(deps);

  return {
    async read(): Promise<LaunchState> {
      const account = await accountStateSource.read();
      if (account === null) return SIGNED_OUT;
      return mapAccountStateToLaunchState(account);
    },
  };
}
