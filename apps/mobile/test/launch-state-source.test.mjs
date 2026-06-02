import assert from "node:assert/strict";
import test from "node:test";

import { resolveLaunchState } from "../dist/domains/onboarding/service/resolve-launch-state.js";
import { createStubLaunchStateSource } from "../dist/providers/launch-state/source.js";

/**
 * Locks the stub LaunchStateSource ↔ resolver wiring: each named dev scenario
 * must hydrate to a LaunchState that resolves to its intended zone, so a
 * developer can boot directly into any gate. When #23 replaces the stub with
 * the real GET /me source, these destinations are the contract it must honour.
 */

const EXPECTED = {
  "signed-out": "SIGNED_OUT",
  "needs-consent": "MISSING_CONSENT",
  "needs-invite": "SIBLING_INVITATION_PENDING",
  ready: "READY_FOR_CHAT",
};

for (const [scenario, destination] of Object.entries(EXPECTED)) {
  test(`stub scenario '${scenario}' resolves to ${destination}`, async () => {
    const source = createStubLaunchStateSource(scenario);
    const state = await source.read();
    assert.equal(resolveLaunchState(state), destination);
  });
}

test("stub returns a fresh copy each read (no shared mutable state)", async () => {
  const source = createStubLaunchStateSource("needs-consent");
  const first = await source.read();
  first.consent = "completed";
  const second = await source.read();
  assert.equal(second.consent, "pending");
});
