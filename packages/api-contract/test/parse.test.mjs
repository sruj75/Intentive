import test from "node:test";
import assert from "node:assert/strict";

import * as contract from "../dist/index.js";

const validDeviceRegister = {
  device_fingerprint: "abc",
  client_kind: "desktop",
  expo_push_token: "token",
};

test("parseBoundary returns the typed value for valid input", () => {
  const value = contract.parseBoundary(contract.PostDeviceRegisterRequest, validDeviceRegister);
  assert.equal(value.device_fingerprint, "abc");
});

test("parseBoundary throws BoundaryParseError surfacing only key names", () => {
  try {
    contract.parseBoundary(contract.PostDeviceRegisterRequest, {
      device_fingerprint: "abc",
      client_kind: "desktop",
      expo_push_token: "token",
      legacy_field: true,
    });
    assert.fail("expected BoundaryParseError");
  } catch (err) {
    assert.ok(err instanceof contract.BoundaryParseError);
    assert.ok(Array.isArray(err.keys));
    // The error reports the offending key, never the payload values.
    assert.ok(err.keys.includes("legacy_field"));
    assert.ok(!err.message.includes("token"));
  }
});
