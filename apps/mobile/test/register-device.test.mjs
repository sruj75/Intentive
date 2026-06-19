import assert from "node:assert/strict";
import test from "node:test";

import { registerDevice } from "../dist/domains/notifications/service/register-device.js";

test("registerDevice posts the Expo Push Token with a bearer User JWT", async () => {
  const calls = [];
  const result = await registerDevice(
    {
      baseUrl: "https://cp.test",
      getUserJwt: async () => "jwt-123",
      fetch: async (url, init) => {
        calls.push({ url, init });
        return { ok: true, status: 200, json: async () => ({ device_id: "dev_1" }) };
      },
    },
    {
      deviceFingerprint: "fingerprint-1",
      expoPushToken: "ExponentPushToken[token]",
    },
  );

  assert.deepEqual(result, { deviceId: "dev_1" });
  assert.equal(calls[0].url, "https://cp.test/devices/register");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.authorization, "Bearer jwt-123");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    device_fingerprint: "fingerprint-1",
    client_kind: "mobile",
    expo_push_token: "ExponentPushToken[token]",
  });
});

test("registerDevice returns early when no User JWT is available", async () => {
  const result = await registerDevice(
    {
      baseUrl: "https://cp.test",
      getUserJwt: async () => null,
      fetch: async () => assert.fail("fetch must not be called without a JWT"),
    },
    {
      deviceFingerprint: "fingerprint-1",
      expoPushToken: "ExponentPushToken[token]",
    },
  );

  assert.equal(result, null);
});

test("registerDevice validates the response at the boundary", async () => {
  await assert.rejects(
    registerDevice(
      {
        baseUrl: "https://cp.test",
        getUserJwt: async () => "jwt-123",
        fetch: async () => ({ ok: true, status: 200, json: async () => ({ wrong: "shape" }) }),
      },
      {
        deviceFingerprint: "fingerprint-1",
        expoPushToken: "ExponentPushToken[token]",
      },
    ),
    /Invalid payload/,
  );
});
