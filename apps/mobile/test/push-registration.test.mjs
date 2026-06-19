import assert from "node:assert/strict";
import test from "node:test";

import { registerForPush } from "../dist/domains/notifications/service/push-registration.js";

function baseDeps(overrides = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      baseUrl: "https://cp.test",
      getUserJwt: async () => "jwt-123",
      fetch: async (url, init) => {
        calls.push({ url, init });
        return { ok: true, status: 200, json: async () => ({ device_id: "dev_1" }) };
      },
      notifications: {
        requestPermission: async () => "granted",
        getExpoPushToken: async () => "ExponentPushToken[token]",
      },
      getDeviceFingerprint: async () => "fingerprint-1",
      ...overrides,
    },
  };
}

test("registerForPush does nothing when notification permission is denied", async () => {
  const { deps, calls } = baseDeps({
    notifications: {
      requestPermission: async () => "denied",
      getExpoPushToken: async () => assert.fail("token must not be requested"),
    },
  });

  const registered = await registerForPush(deps);

  assert.equal(registered, false);
  assert.deepEqual(calls, []);
});

test("registerForPush registers the token and stable fingerprint when permission is granted", async () => {
  const { deps, calls } = baseDeps();

  const registered = await registerForPush(deps);

  assert.equal(registered, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    device_fingerprint: "fingerprint-1",
    client_kind: "mobile",
    expo_push_token: "ExponentPushToken[token]",
  });
});

test("registerForPush swallows failures and reports them to the optional hook", async () => {
  const errors = [];
  const { deps } = baseDeps({
    fetch: async () => {
      throw new Error("network down");
    },
    onError: (error) => errors.push(error),
  });

  const registered = await registerForPush(deps);

  assert.equal(registered, false);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /network down/);
});

test("registerForPush reports no registration when no User JWT is available", async () => {
  const { deps } = baseDeps({
    getUserJwt: async () => null,
  });

  const registered = await registerForPush(deps);

  assert.equal(registered, false);
});
