import test from "node:test";
import assert from "node:assert/strict";

import * as protocol from "../dist/index.js";

test("connect accepts canonical fields only", () => {
  const result = protocol.connect.safeParse({
    type: "connect",
    auth_token: "jwt",
    client_kind: "desktop",
    client_version: "1.0.0",
  });

  assert.equal(result.success, true);
});

test("connect rejects legacy negotiation fields and unknown keys", () => {
  const withLegacy = protocol.connect.safeParse({
    type: "connect",
    auth_token: "jwt",
    client_kind: "desktop",
    client_version: "1.0.0",
    min_protocol: 1,
    max_protocol: 1,
  });
  assert.equal(withLegacy.success, false);

  const withUnknown = protocol.connect.safeParse({
    type: "connect",
    auth_token: "jwt",
    client_kind: "desktop",
    client_version: "1.0.0",
    extra: true,
  });
  assert.equal(withUnknown.success, false);
});

test("hello_ok rejects negotiated_protocol", () => {
  const result = protocol.hello_ok.safeParse({
    type: "hello_ok",
    negotiated_protocol: 1,
    session_snapshot: {},
  });

  assert.equal(result.success, false);
});

test("runtime_error validates canonical envelope and codes", () => {
  const valid = protocol.runtimeToClientEvent.safeParse({
    type: "runtime_error",
    code: "auth_failed",
    message: "Auth failed",
  });
  assert.equal(valid.success, true);

  const serviceUnavailable = protocol.runtimeToClientEvent.safeParse({
    type: "runtime_error",
    code: "service_unavailable",
    message: "Try again later",
  });
  assert.equal(serviceUnavailable.success, true);

  const invalidCode = protocol.runtimeToClientEvent.safeParse({
    type: "runtime_error",
    code: "legacy_code",
    message: "bad",
  });
  assert.equal(invalidCode.success, false);

  const unknownField = protocol.runtimeToClientEvent.safeParse({
    type: "runtime_error",
    code: "invalid_connect",
    message: "bad",
    unknown: true,
  });
  assert.equal(unknownField.success, false);
});

test("wire event objects are strict", () => {
  const result = protocol.user_message.safeParse({
    type: "user_message",
    message_id: "m1",
    body: "hello",
    sent_at: new Date().toISOString(),
    shadow: "legacy",
  });

  assert.equal(result.success, false);
});

test("legacy alias exports are removed", () => {
  const removed = [
    "ConnectFrame",
    "HelloOkFrame",
    "UserMessageEvent",
    "PresenceUpdateEvent",
    "DeliveryAckEvent",
    "ContextSnapshotEvent",
    "SessionEndMarkerEvent",
    "CompanionMessageEvent",
    "InboundEvent",
    "OutboundEvent",
  ];

  for (const name of removed) {
    assert.equal(name in protocol, false, `${name} should not be exported`);
  }
});
