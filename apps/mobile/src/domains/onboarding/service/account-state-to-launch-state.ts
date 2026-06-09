/**
 * AccountState → LaunchState — the translation from Control-Plane gate truth
 * (`GET /me`) into the client's in-memory Launch State projection.
 *
 * Pure, RN-free, and the single owner of "which Control Plane `next_gate` means
 * which Mobile gate position". Keeping it next to the resolver (the other half
 * of gate-order knowledge) keeps that knowledge in one domain; the launch-state
 * source just calls this after fetching.
 *
 * Every result is WALK-SAFE: a signed-in user's gate fields are always concrete
 * (`pending`/`completed`), never `null`, so the resolver never strands them on
 * the splash. `null` is reserved for the genuinely-unknown pre-hydration store
 * state, which this function never produces.
 */
import type { AccountState } from "@intentive/api-contract";

import type { LaunchState } from "../../../providers/launch-state/types.js";

export function mapAccountStateToLaunchState(account: AccountState): LaunchState {
  // A `GET /me` only resolves for an authenticated caller, so we are signed in.
  switch (account.next_gate) {
    case null:
      // No gate pending → every shared gate is satisfied; ready for chat.
      return { signedIn: true, consent: "completed", siblingInvitation: "completed" };

    case "consent_primer":
      // Consent is the next blocker; the Sibling Invitation that follows is also
      // not done. Seed it `pending` (concrete, not null) to stay walk-safe.
      return { signedIn: true, consent: "pending", siblingInvitation: "pending" };

    case "sibling_client_invitation":
      // Past consent; the Sibling Invitation is the remaining blocker.
      return { signedIn: true, consent: "completed", siblingInvitation: "pending" };

    case "capture_permission_setup":
      // A Device-Local desktop gate with no Mobile Launch State field. It comes
      // after the shared gates, so those are necessarily done and mobile is ready.
      return { signedIn: true, consent: "completed", siblingInvitation: "completed" };

    case "identity":
      // A signed-in `/me` should never report the Identity Gate. Map defensively
      // to "not yet past consent" rather than asserting it impossible.
      return { signedIn: true, consent: "pending", siblingInvitation: "pending" };
  }
}
