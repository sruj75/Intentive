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
    assert.notEqual(state.siblingInvitation, null);
  });
}
