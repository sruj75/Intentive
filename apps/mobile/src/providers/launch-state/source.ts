/**
 * Launch State Source — the seam between the in-memory Launch State store and
 * the durable source of truth. #18 ships only the stub below; issue #23 plugs
 * in the real implementation that calls Control Plane `GET /me` and maps the
 * `AccountState` response into a `LaunchState`.
 *
 * Swapping the real source in must require ZERO changes to the resolver or the
 * root layout — that is the whole point of this interface. The contract the
 * resolver assumes (see resolve-launch-state.ts): `signedIn: false`
 * short-circuits regardless of gate fields; `GateStatus` keeps the `skipped`
 * distinction; a `null` gate the resolver needs yields `RESOLVING`.
 *
 * `read` is async now (even though the stub is synchronous underneath) so the
 * real `GET /me` implementation drops in without changing the signature.
 */
import type { GateStatus, LaunchState } from "./types.js";

export interface LaunchStateSource {
  /** Hydrate the current Launch State from the source of truth. */
  read(): Promise<LaunchState>;
}

/**
 * Named dev scenarios for booting the app directly into any zone while the real
 * `GET /me` does not exist. Each maps deterministically through the resolver to
 * one destination — asserted in the contract tests.
 *
 * Every scenario is WALK-SAFE: its gates are pre-seeded `pending`, never `null`.
 * `null` is reserved for the genuine cold-launch, pre-hydration state the store's
 * `UNKNOWN` owns. If a dev source handed out `null` gates, signing in (an
 * optimistic write that only flips `signedIn`) would leave `consent: null`, and
 * the resolver returns `RESOLVING` — stranding the user on the splash with no
 * re-read to recover. Pre-seeding `pending` guarantees the resolver always has a
 * concrete value as the user walks the gates forward.
 */
export type StubScenario = "signed-out" | "needs-consent" | "needs-invite" | "ready";

const completed: GateStatus = "completed";
const pending: GateStatus = "pending";

const SCENARIOS: Record<StubScenario, LaunchState> = {
  "signed-out": { signedIn: false, consent: pending, siblingInvitation: pending },
  "needs-consent": { signedIn: true, consent: pending, siblingInvitation: pending },
  "needs-invite": { signedIn: true, consent: completed, siblingInvitation: pending },
  ready: { signedIn: true, consent: completed, siblingInvitation: completed },
};

/**
 * A stub `LaunchStateSource` that hydrates to a fixed scenario. Replaced by the
 * real `GET /me`-backed source in #23.
 */
export function createStubLaunchStateSource(scenario: StubScenario): LaunchStateSource {
  const state = SCENARIOS[scenario];
  return {
    read: () => Promise.resolve({ ...state }),
  };
}
