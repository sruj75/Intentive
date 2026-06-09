import assert from "node:assert/strict";
import test from "node:test";

import {
  accountStateSample,
  nextGateSample,
  consentRequestSample,
  siblingInvitationSkipRequestSample,
  deviceRegisterRequestSample,
  deviceRegisterResponseSample,
  routingSample,
  sessionStartRequestSample,
  notificationsPushRequestSample,
  notificationsPushResponseSample,
} from "../dist/index.js";

test("gates sample matches the AccountState shape", () => {
  assert.deepEqual(Object.keys(accountStateSample).sort(), [
    "has_agent_instance",
    "next_gate",
    "user_id",
  ]);
  assert.equal(accountStateSample.next_gate, nextGateSample);
  assert.deepEqual(consentRequestSample, {});
  assert.deepEqual(siblingInvitationSkipRequestSample, {});
});

test("devices samples round-trip a device_id", () => {
  assert.equal(deviceRegisterRequestSample.client_kind, "mobile");
  assert.equal(typeof deviceRegisterResponseSample.device_id, "string");
});

test("routing sample exposes the three Routing fields", () => {
  assert.deepEqual(Object.keys(routingSample).sort(), [
    "agent_instance_id",
    "runtime_jwt",
    "ws_url",
  ]);
});

test("internal samples are user-scoped", () => {
  assert.equal(typeof sessionStartRequestSample.auth_subject, "string");
  assert.equal(typeof sessionStartRequestSample.user_id, "string");
  assert.equal(notificationsPushRequestSample.user_id, "user_stub");
  assert.equal(notificationsPushResponseSample.delivered, false);
  assert.equal(notificationsPushResponseSample.device_count, 0);
});
