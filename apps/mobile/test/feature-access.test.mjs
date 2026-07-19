import assert from "node:assert/strict";
import test from "node:test";

import { deriveFeatureAccess } from "../dist/domains/account/service/feature-access.js";

function account(overrides = {}) {
  return {
    user_id: "u_1",
    next_gate: null,
    has_agent_instance: true,
    has_desktop_client: false,
    ...overrides,
  };
}

test("a null projection grants access so the offline/local experience is unchanged", () => {
  assert.deepEqual(deriveFeatureAccess(null), { proactiveSuggestions: true });
});

test("a provisioned Companion unlocks proactive suggestions", () => {
  assert.equal(
    deriveFeatureAccess(account({ has_agent_instance: true })).proactiveSuggestions,
    true,
  );
});

test("a signed-in account without an Agent instance gates proactive suggestions off", () => {
  assert.equal(
    deriveFeatureAccess(account({ has_agent_instance: false })).proactiveSuggestions,
    false,
  );
});
