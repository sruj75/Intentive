import assert from "node:assert/strict";
import test from "node:test";

import { createAuthAdapter } from "../dist/domains/auth/service/auth-adapter.js";

/**
 * The Auth Adapter routes a chosen provider to its implementation, gates the
 * launch-only dev provider behind `includeDev` (`__DEV__`), reports
 * capability-honest `not-configured` for social providers without credentials,
 * and delegates session/token/sign-out to the shared Neon client.
 */

function fakeClient(overrides = {}) {
  return {
    socialCalls: [],
    signInSocial(provider) {
      this.socialCalls.push(provider);
      return Promise.resolve(overrides.attempt ?? { result: "authenticated" });
    },
    hasSession: () => Promise.resolve(overrides.hasSession ?? false),
    getJwt: () => Promise.resolve(overrides.jwt ?? null),
    signOut() {
      this.signedOut = true;
      return Promise.resolve();
    },
  };
}

const ALL = new Set(["google", "apple"]);

test("dev provider is unavailable unless includeDev (it must never ship)", async () => {
  const prod = createAuthAdapter({ client: fakeClient(), enabled: ALL, includeDev: false });
  assert.deepEqual(await prod.signIn("dev"), { status: "not-configured" });

  const dev = createAuthAdapter({ client: fakeClient(), enabled: ALL, includeDev: true });
  assert.deepEqual(await dev.signIn("dev"), { status: "signed-in" });
});

test("google routes to the Neon provider and signs in", async () => {
  const adapter = createAuthAdapter({
    client: fakeClient({ attempt: { result: "authenticated" } }),
    enabled: new Set(["google"]),
    includeDev: false,
  });
  assert.deepEqual(await adapter.signIn("google"), { status: "signed-in" });
});

test("recoverable sign-in failures are captured through injected telemetry", async () => {
  const telemetry = createTelemetry();
  const adapter = createAuthAdapter({
    client: fakeClient({ attempt: { result: "failed", message: "oauth failed" } }),
    enabled: new Set(["google"]),
    includeDev: false,
    telemetry: telemetry.port,
  });

  assert.deepEqual(await adapter.signIn("google"), {
    status: "error",
    message: "oauth failed",
  });
  assert.equal(telemetry.captured.length, 1);
  assert.equal(telemetry.captured[0].ctx.tags.error_type, "auth");
  assert.equal(telemetry.captured[0].ctx.tags.auth_provider, "google");
});

test("a social provider without credentials is not-configured, opening no OAuth flow", async () => {
  const client = fakeClient();
  const adapter = createAuthAdapter({
    client,
    enabled: new Set(["google"]), // apple absent
    includeDev: false,
  });
  assert.deepEqual(await adapter.signIn("apple"), { status: "not-configured" });
  // Capability honesty lives in the adapter now: a disabled provider never even
  // reaches the client, so no dead OAuth flow is opened.
  assert.deepEqual(client.socialCalls, []);
});

test("session, token, and sign-out delegate to the shared client", async () => {
  const client = fakeClient({ hasSession: true, jwt: "jwt-xyz" });
  const adapter = createAuthAdapter({ client, enabled: ALL, includeDev: true });
  assert.equal(await adapter.restoreSession(), true);
  assert.equal(await adapter.getUserJwt(), "jwt-xyz");
  await adapter.signOut();
  assert.equal(client.signedOut, true);
});

test("thrown JWT failures are captured and rethrown", async () => {
  const telemetry = createTelemetry();
  const jwtError = new Error("jwt unavailable");
  const client = fakeClient();
  client.getJwt = () => Promise.reject(jwtError);
  const adapter = createAuthAdapter({
    client,
    enabled: ALL,
    includeDev: true,
    telemetry: telemetry.port,
  });

  await assert.rejects(() => adapter.getUserJwt(), jwtError);
  assert.equal(telemetry.captured.length, 1);
  assert.equal(telemetry.captured[0].error, jwtError);
  assert.equal(telemetry.captured[0].ctx.tags.error_type, "auth");
});

function createTelemetry() {
  const captured = [];
  return {
    captured,
    port: {
      captureException(error, ctx) {
        captured.push({ error, ctx });
      },
      addBreadcrumb: () => undefined,
    },
  };
}
