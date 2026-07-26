import assert from "node:assert/strict";
import test from "node:test";

import { createCoachingFeatureGate } from "../dist/index.js";

const founder = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";

test("Desktop coaching requires both the provider flag and founder allowlist", () => {
  const checks = [];
  const gate = createCoachingFeatureGate({
    flags: {
      isEnabled: (flag, userId) => {
        checks.push([flag, userId]);
        return true;
      },
    },
    founderUserIds: [founder],
  });

  assert.equal(gate.isEnabled(founder), true);
  assert.equal(gate.isEnabled(other), false);
  assert.deepEqual(checks, [["desktop_coaching_v1", founder]]);
});

test("Desktop coaching fails closed when the provider flag is disabled", () => {
  const gate = createCoachingFeatureGate({
    flags: { isEnabled: () => false },
    founderUserIds: [founder],
  });

  assert.equal(gate.isEnabled(founder), false);
});
