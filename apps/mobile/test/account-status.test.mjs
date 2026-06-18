import assert from "node:assert/strict";
import test from "node:test";

import { deriveConnectionStatus } from "../dist/domains/account/service/account-status.js";

const CASES = [
  [{ controlPlaneBaseUrl: "", runtimeConnectionState: "connected" }, "not_configured"],
  [{ controlPlaneBaseUrl: "   ", runtimeConnectionState: "error" }, "not_configured"],
  [{ controlPlaneBaseUrl: "https://cp.test", runtimeConnectionState: "connected" }, "connected"],
  [{ controlPlaneBaseUrl: "https://cp.test", runtimeConnectionState: "retrying" }, "reconnecting"],
  [{ controlPlaneBaseUrl: "https://cp.test", runtimeConnectionState: "routing" }, "reconnecting"],
  [
    { controlPlaneBaseUrl: "https://cp.test", runtimeConnectionState: "connecting" },
    "reconnecting",
  ],
  [{ controlPlaneBaseUrl: "https://cp.test", runtimeConnectionState: "idle" }, "reconnecting"],
  [{ controlPlaneBaseUrl: "https://cp.test", runtimeConnectionState: "error" }, "connection_issue"],
];

for (const [input, expected] of CASES) {
  test(`${input.runtimeConnectionState} with base=${JSON.stringify(input.controlPlaneBaseUrl)} maps to ${expected}`, () => {
    assert.equal(deriveConnectionStatus(input), expected);
  });
}
