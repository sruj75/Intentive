import test from "node:test";
import assert from "node:assert/strict";

import * as protocol from "../dist/index.js";

const validConnect = {
  type: "connect",
  auth_token: "jwt",
  client_kind: "desktop",
  client_version: "1.0.0",
};

test("parseClientToRuntimeEvent returns the typed event for valid input", () => {
  const event = protocol.parseClientToRuntimeEvent(validConnect);
  assert.equal(event.type, "connect");
});

test("parseClientToRuntimeEvent throws a leak-free BoundaryParseError on invalid input", () => {
  try {
    protocol.parseClientToRuntimeEvent({ type: "nope" });
    assert.fail("expected BoundaryParseError");
  } catch (err) {
    assert.ok(err instanceof protocol.BoundaryParseError);
    assert.ok(Array.isArray(err.keys));
  }
});

test("parseClientToRuntimeEvent surfaces the offending key path", () => {
  try {
    // A valid connect discriminant but a missing required field.
    protocol.parseClientToRuntimeEvent({ type: "connect", auth_token: "jwt" });
    assert.fail("expected BoundaryParseError");
  } catch (err) {
    assert.ok(err instanceof protocol.BoundaryParseError);
    assert.ok(err.keys.includes("client_kind"));
  }
});

test("safeParseClientToRuntimeEvent reports success/failure without throwing", () => {
  assert.equal(protocol.safeParseClientToRuntimeEvent(validConnect).success, true);
  assert.equal(protocol.safeParseClientToRuntimeEvent({ type: "nope" }).success, false);
});

test("parseClientToRuntimeEvent decodes Coaching Window lifecycle events", () => {
  const event = protocol.parseClientToRuntimeEvent({
    type: "coaching_window_started",
    window_id: "11111111-1111-4111-8111-111111111111",
    started_at: "2026-07-26T08:00:00.000Z",
    reason: "app_launch",
  });

  assert.equal(event.type, "coaching_window_started");
  assert.equal(event.window_id, "11111111-1111-4111-8111-111111111111");
});

test("parseClientToRuntimeEvent rejects unknown Coaching Window keys without leaking values", () => {
  try {
    protocol.parseClientToRuntimeEvent({
      type: "coaching_window_started",
      window_id: "11111111-1111-4111-8111-111111111111",
      started_at: "2026-07-26T08:00:00.000Z",
      reason: "app_launch",
      secret: "must-not-appear",
    });
    assert.fail("expected BoundaryParseError");
  } catch (err) {
    assert.ok(err instanceof protocol.BoundaryParseError);
    assert.ok(err.keys.includes("secret"));
    assert.equal(err.message.includes("must-not-appear"), false);
  }
});

test("parseRuntimeToClientEvent validates the runtime->client union", () => {
  const event = protocol.parseRuntimeToClientEvent({
    type: "runtime_error",
    code: "auth_failed",
    message: "Auth failed",
  });
  assert.equal(event.type, "runtime_error");

  assert.equal(
    protocol.safeParseRuntimeToClientEvent({ type: "companion_message" }).success,
    false,
  );
});
