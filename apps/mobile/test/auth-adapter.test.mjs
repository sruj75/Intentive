import assert from "node:assert/strict";
import test from "node:test";

import { createAuthAdapter } from "../dist/domains/auth/service/auth-adapter.js";

/**
 * The Auth Adapter owns the Google-only sign-in path: it short-circuits to
 * `not-configured` when Google is not a working capability (never opening a
 * dead OAuth flow), interprets an OAuth attempt — dismissed browser is
 * `cancelled`, an established session is `signed-in`, anything else is a
 * recoverable `error` — and delegates session/token/sign-out to the shared
 * Neon client (ADR 0012 / 0030).
 */

function fakeClient(overrides = {}) {
  return {
    googleCalls: 0,
    async signInWithGoogle() {
      this.googleCalls += 1;
      return overrides.attempt ?? { result: "authenticated" };
    },
    hasSession: () => Promise.resolve(overrides.hasSession ?? false),
    getJwt: () => Promise.resolve(overrides.jwt ?? null),
    signOut() {
      this.signedOut = true;
      return Promise.resolve();
    },
  };
}

test("google sign-in routes to the native client and signs in when configured", async () => {
  const client = fakeClient({ attempt: { result: "authenticated" } });
  const adapter = createAuthAdapter({ client, googleAuthConfigured: true });
  assert.deepEqual(await adapter.signIn(), { status: "signed-in" });
  assert.equal(client.googleCalls, 1);
});

test("a dismissed native prompt is cancelled, not an error", async () => {
  const client = fakeClient({ attempt: { result: "dismissed" } });
  const adapter = createAuthAdapter({ client, googleAuthConfigured: true });
  assert.deepEqual(await adapter.signIn(), { status: "cancelled" });
});

test("a failed exchange is a recoverable error captured through telemetry", async () => {
  const telemetry = createTelemetry();
  const adapter = createAuthAdapter({
    client: fakeClient({ attempt: { result: "failed", message: "oauth failed" } }),
    googleAuthConfigured: true,
    telemetry: telemetry.port,
  });
  assert.deepEqual(await adapter.signIn(), { status: "error", message: "oauth failed" });
  assert.equal(telemetry.captured.length, 1);
  assert.equal(telemetry.captured[0].ctx.tags.error_type, "auth");
  assert.equal(telemetry.captured[0].ctx.tags.auth_provider, "google");
});

test("sign-in is not-configured when Google is not a working capability (no OAuth flow)", async () => {
  const client = fakeClient();
  const adapter = createAuthAdapter({ client, googleAuthConfigured: false });
  assert.deepEqual(await adapter.signIn(), { status: "not-configured" });
  // Capability honesty lives in the adapter: a disabled capability never reaches
  // the client, so no dead OAuth flow is opened.
  assert.equal(client.googleCalls, 0);
});

test("a thrown native failure is captured and rethrown", async () => {
  const telemetry = createTelemetry();
  const nativeError = new Error("google crashed");
  const client = fakeClient();
  client.signInWithGoogle = () => Promise.reject(nativeError);
  const adapter = createAuthAdapter({
    client,
    googleAuthConfigured: true,
    telemetry: telemetry.port,
  });
  await assert.rejects(() => adapter.signIn(), nativeError);
  assert.equal(telemetry.captured.length, 1);
  assert.equal(telemetry.captured[0].error, nativeError);
  assert.equal(telemetry.captured[0].ctx.tags.auth_provider, "google");
});

test("session, token, and sign-out delegate to the shared client", async () => {
  const client = fakeClient({ hasSession: true, jwt: "jwt-xyz" });
  const adapter = createAuthAdapter({ client, googleAuthConfigured: true });
  assert.equal(await adapter.restoreSession(), true);
  assert.equal(await adapter.getUserJwt(), "jwt-xyz");
  await adapter.signOut();
  assert.equal(client.signedOut, true);
});

test("thrown sign-out failures are captured and rethrown", async () => {
  const telemetry = createTelemetry();
  const signOutError = new Error("secure session could not be cleared");
  const client = fakeClient();
  client.signOut = () => Promise.reject(signOutError);
  const adapter = createAuthAdapter({
    client,
    googleAuthConfigured: true,
    telemetry: telemetry.port,
  });

  await assert.rejects(() => adapter.signOut(), signOutError);
  assert.equal(telemetry.captured.length, 1);
  assert.equal(telemetry.captured[0].error, signOutError);
  assert.equal(telemetry.captured[0].ctx.tags.error_type, "auth");
});

test("thrown JWT failures are captured and rethrown", async () => {
  const telemetry = createTelemetry();
  const jwtError = new Error("jwt unavailable");
  const client = fakeClient();
  client.getJwt = () => Promise.reject(jwtError);
  const adapter = createAuthAdapter({
    client,
    googleAuthConfigured: true,
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
