/**
 * `readDeviceSignal` + the header-name constants — the one device-signal parse
 * shared by `/me` and `/agent` (ADR-0005). Pins the degrade-malformed contract
 * and the header spellings the app binds to.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPTURE_PERMISSION_GRANTED_HEADER,
  CLIENT_KIND_HEADER,
  readDeviceSignal,
} from "../dist/http/device-signal.js";

test("header-name constants are the canonical lowercase HTTP spellings", () => {
  assert.equal(CLIENT_KIND_HEADER, "x-client-kind");
  assert.equal(CAPTURE_PERMISSION_GRANTED_HEADER, "x-capture-permission-granted");
});

test("a valid device signal parses into the structured shape", () => {
  const signal = readDeviceSignal({
    clientKind: "desktop",
    capturePermissionGranted: "true",
  });

  assert.deepEqual(signal, {
    client_kind: "desktop",
    capture_permission_granted: true,
  });
});

test("absent headers degrade to no signal (cross-client-only sequence)", () => {
  assert.deepEqual(readDeviceSignal({}), {});
  assert.deepEqual(readDeviceSignal({ clientKind: null, capturePermissionGranted: null }), {});
});

test("a malformed header degrades to no signal rather than throwing", () => {
  assert.deepEqual(readDeviceSignal({ clientKind: "not_a_client_kind" }), {});
  assert.deepEqual(
    readDeviceSignal({ clientKind: "mobile", capturePermissionGranted: "maybe" }),
    {},
  );
});
