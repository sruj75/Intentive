import assert from "node:assert/strict";
import test from "node:test";

import {
  companionMessageSample,
  runtimeConnectSample,
  runtimeContractSample,
} from "../dist/index.js";

test("agent-runtime scaffold exports runtime routing contract sample", () => {
  assert.deepEqual(runtimeContractSample, {
    agent_instance_id: "agent_stub",
    ws_url: "https://runtime.example.com/ws",
  });
});

test("agent-runtime scaffold exports protocol contract samples", () => {
  assert.equal(runtimeConnectSample.type, "connect");
  assert.equal(runtimeConnectSample.client_kind, "mobile");

  assert.equal(companionMessageSample.type, "companion_message");
  assert.equal(companionMessageSample.via_post_message_back, false);
});
