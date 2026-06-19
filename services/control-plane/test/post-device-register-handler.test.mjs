/**
 * `POST /devices/register` handler, hermetic: fake identity + a fake register
 * port drive each branch. The handler owns the same HTTP concerns as the other
 * authenticated endpoints — authenticating the request and mapping auth failures
 * to a status — plus mapping the parsed request onto the repo and validating the
 * boundary in and out. It must never touch the token-bearing repo surface.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createPostDeviceRegisterHandler } from "../dist/domains/devices/ui/post-device-register.js";

const identityFor = (userId) => ({ authenticate: async () => ({ userId }) });
const recordingLogger = (records) => ({
  info: (event, attrs) => records.push({ level: "info", event, attrs }),
  warn: (event, attrs) => records.push({ level: "warn", event, attrs }),
  error: (event, error, attrs) => records.push({ level: "error", event, error, attrs }),
  child: () => recordingLogger(records),
});

test("a valid registration returns a device_id and maps the request onto the repo", async () => {
  const seen = [];
  const records = [];
  const res = await createPostDeviceRegisterHandler({
    identity: identityFor("u_1"),
    devices: {
      registerDevice: async (input) => {
        seen.push(input);
        return { deviceId: "dev_1" };
      },
    },
    logger: recordingLogger(records),
  }).handle({
    authorization: "Bearer good.jwt.token",
    body: { device_fingerprint: "fp-1", client_kind: "desktop", expo_push_token: "tok-a" },
  });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { device_id: "dev_1" });
  assert.deepEqual(seen, [
    {
      userId: "u_1",
      deviceFingerprint: "fp-1",
      clientKind: "desktop",
      expoPushToken: "tok-a",
    },
  ]);
  assert.deepEqual(records, [
    {
      level: "info",
      event: "devices.registered",
      attrs: { user_id: "u_1", client_kind: "desktop", status: "ok" },
    },
  ]);
});

// One wiring case proves the handler routes through `requireUser` and
// short-circuits before touching the repo; the full auth-failure matrix
// (expired, JWKS-outage 503, token shapes) lives in http-auth.test.mjs.
test("an unauthenticated request → 401 and never registers", async () => {
  const res = await createPostDeviceRegisterHandler({
    identity: { authenticate: async () => assert.fail("must not authenticate without a token") },
    devices: {
      registerDevice: async () => assert.fail("must not register on an unauthenticated call"),
    },
  }).handle({ authorization: null, body: { device_fingerprint: "fp", client_kind: "mobile" } });

  assert.equal(res.status, 401);
  assert.equal(res.body.code, "auth_failed");
});
