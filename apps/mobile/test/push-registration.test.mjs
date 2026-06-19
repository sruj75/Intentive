import assert from "node:assert/strict";
import test from "node:test";

import { NotificationsConfigurationError } from "../dist/domains/notifications/types/notifications-port.js";
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

  const result = await registerForPush(deps);

  assert.deepEqual(result, { status: "terminal", reason: "permission_denied" });
  assert.deepEqual(calls, []);
});

test("registerForPush treats unavailable notifications as terminal", async () => {
  const { deps, calls } = baseDeps({
    notifications: {
      requestPermission: async () => "unavailable",
      getExpoPushToken: async () => assert.fail("token must not be requested"),
    },
  });

  const result = await registerForPush(deps);

  assert.deepEqual(result, { status: "terminal", reason: "notifications_unavailable" });
  assert.deepEqual(calls, []);
});

test("registerForPush treats a missing Expo token as terminal", async () => {
  const { deps, calls } = baseDeps({
    notifications: {
      requestPermission: async () => "granted",
      getExpoPushToken: async () => null,
    },
  });

  const result = await registerForPush(deps);

  assert.deepEqual(result, { status: "terminal", reason: "expo_token_unavailable" });
  assert.deepEqual(calls, []);
});

test("registerForPush registers the token and stable fingerprint when permission is granted", async () => {
  const { deps, calls } = baseDeps();

  const result = await registerForPush(deps);

  assert.deepEqual(result, { status: "registered" });
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    device_fingerprint: "fingerprint-1",
    client_kind: "mobile",
    expo_push_token: "ExponentPushToken[token]",
  });
});

test("registerForPush treats registration failures as retryable", async () => {
  const errors = [];
  const { deps } = baseDeps({
    fetch: async () => {
      throw new Error("network down");
    },
    onError: (error) => errors.push(error),
  });

  const result = await registerForPush(deps);

  assert.deepEqual(result, { status: "retryable", reason: "registration_failed" });
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /network down/);
});

test("registerForPush treats no User JWT as retryable", async () => {
  const { deps } = baseDeps({
    getUserJwt: async () => null,
  });

  const result = await registerForPush(deps);

  assert.deepEqual(result, { status: "retryable", reason: "registration_unavailable" });
});

test("registerForPush treats missing push configuration as terminal", async () => {
  const errors = [];
  const { deps } = baseDeps({
    notifications: {
      requestPermission: async () => "granted",
      getExpoPushToken: async () => {
        throw new NotificationsConfigurationError("Project ID not found");
      },
    },
    onError: (error) => errors.push(error),
  });

  const result = await registerForPush(deps);

  assert.deepEqual(result, { status: "terminal", reason: "configuration_error" });
  assert.equal(errors.length, 1);
});
