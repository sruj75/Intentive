import assert from "node:assert/strict";
import test from "node:test";

import { controlPlaneContractSample } from "../dist/index.js";

test("control-plane scaffold exports a valid account sample", () => {
  assert.deepEqual(controlPlaneContractSample, {
    user_id: "user_stub",
    next_gate: null,
    has_agent_instance: false,
    has_desktop_client: false,
  });
});
