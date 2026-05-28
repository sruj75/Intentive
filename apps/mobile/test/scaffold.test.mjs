import assert from "node:assert/strict";
import test from "node:test";

import { MOBILE_WORKSPACE_READY } from "../dist/index.js";

test("mobile workspace scaffold exports readiness marker", () => {
  assert.equal(MOBILE_WORKSPACE_READY, true);
});
