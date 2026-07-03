/**
 * Locks the AccountState → LaunchState mapping against the resolver: every
 * Control Plane `next_gate` value (and null) must produce a walk-safe LaunchState
 * that resolves to the intended zone. This is the contract the real GET /me
 * source relies on, exercised here without any network.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { resolveLaunchState } from "../dist/domains/onboarding/service/resolve-launch-state.js";
import { mapAccountStateToLaunchState } from "../dist/domains/onboarding/service/account-state-to-launch-state.js";

const account = (nextGate) => ({
  user_id: "u_1",
  next_gate: nextGate,
  has_agent_instance: false,
  has_desktop_client: false,
});

// Exhaustive over PreChatGateKind + null.
const CASES = [
  [null, "READY_FOR_CHAT"],
  ["consent_primer", "MISSING_CONSENT"],
  ["sibling_client_invitation", "SIBLING_INVITATION_PENDING"],
  ["capture_permission_setup", "READY_FOR_CHAT"],
  ["identity", "MISSING_CONSENT"],
];

for (const [nextGate, destination] of CASES) {
  test(`next_gate=${String(nextGate)} maps + resolves to ${destination}`, () => {
    const state = mapAccountStateToLaunchState(account(nextGate));

    assert.equal(resolveLaunchState(state), destination);
    // Walk-safe: a signed-in result never carries a null gate.
    assert.equal(state.signedIn, true);
    assert.notEqual(state.consent, null);
    assert.notEqual(state.onboarding, null);
    assert.notEqual(state.siblingInvitation, null);
    assert.notEqual(state.trial, null);
  });
}

// Scaffold contract: the Control Plane cannot yet report the onboarding funnel
// or the trial entitlement, so a real signed-in user passes straight through
// both — they are marked `completed` in every case. Real users still only see
// the consent and sibling gates; the funnel/trial screens are exercised via dev
// scenarios until packages/api-contract adds the next_gate + entitlement.
for (const nextGate of [null, "consent_primer", "sibling_client_invitation", "identity"]) {
  test(`next_gate=${String(nextGate)} marks onboarding + trial completed (scaffold)`, () => {
    const state = mapAccountStateToLaunchState(account(nextGate));
    assert.equal(state.onboarding, "completed");
    assert.equal(state.trial, "completed");
  });
}
