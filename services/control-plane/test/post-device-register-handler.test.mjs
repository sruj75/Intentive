/**
 * `POST /devices/register` handler, hermetic: fake identity + a fake register
 * port drive each branch. The handler owns the same HTTP concerns as the other
 * authenticated endpoints — authenticating the request and mapping auth failures
 * to a status — plus mapping the parsed request onto the repo and validating the
 * boundary in and out. It must never touch the token-bearing repo surface.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { JwtVerificationError } from "@intentive/providers/auth";

import { createPostDeviceRegisterHandler } from "../dist/domains/devices/ui/post-device-register.js";

const identityFor = (userId) => ({ authenticate: async () => ({ userId }) });

test("a valid registration returns a device_id and maps the request onto the repo", async () => {
  const seen = [];
  const res = await createPostDeviceRegisterHandler({
    identity: identityFor("u_1"),
    devices: {
      registerDevice: async (input) => {
        seen.push(input);
        return { deviceId: "dev_1" };
      },
    },
  }).handle({
    authorization: "Bearer good.jwt.token",
    body: { device_fingerprint: "fp-1", client_kind: "desktop", apns_token: "tok-a" },
  });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { device_id: "dev_1" });
  assert.deepEqual(seen, [
    {
      userId: "u_1",
      deviceFingerprint: "fp-1",
      clientKind: "desktop",
      apnsToken: "tok-a",
      fcmToken: undefined,
    },
  ]);
});

test("a missing Authorization header → 401 and never registers", async () => {
  const res = await createPostDeviceRegisterHandler({
    identity: { authenticate: async () => assert.fail("must not authenticate without a token") },
    devices: {
      registerDevice: async () => assert.fail("must not register on an unauthenticated call"),
    },
  }).handle({ authorization: null, body: { device_fingerprint: "fp", client_kind: "mobile" } });

  assert.equal(res.status, 401);
  assert.equal(res.body.code, "auth_failed");
});

test("an expired token → 401 and never registers", async () => {
  const res = await createPostDeviceRegisterHandler({
    identity: {
      authenticate: async () => {
        throw new JwtVerificationError("expired", "redacted");
      },
    },
    devices: {
      registerDevice: async () => assert.fail("must not register on a failed verification"),
    },
  }).handle({
    authorization: "Bearer some.jwt.token",
    body: { device_fingerprint: "fp", client_kind: "mobile" },
  });

  assert.equal(res.status, 401);
  assert.equal(res.body.code, "auth_failed");
});

test("a JWKS outage → retryable 503", async () => {
  const res = await createPostDeviceRegisterHandler({
    identity: {
      authenticate: async () => {
        throw new JwtVerificationError("jwks_unavailable", "redacted");
      },
    },
    devices: {
      registerDevice: async () => assert.fail("must not register when auth is unavailable"),
    },
  }).handle({
    authorization: "Bearer some.jwt.token",
    body: { device_fingerprint: "fp", client_kind: "mobile" },
  });

  assert.equal(res.status, 503);
  assert.equal(res.body.code, "service_unavailable");
});
