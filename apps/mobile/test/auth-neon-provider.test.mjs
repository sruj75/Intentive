import assert from "node:assert/strict";
import test from "node:test";

import { createNeonAuthProvider } from "../dist/domains/auth/service/neon-provider.js";

/**
 * The Neon Auth provider owns capability honesty (no creds → `not-configured`,
 * never a fake success) and interprets an OAuth attempt: dismissed browser is
 * `cancelled`, an established session is `signed-in`, anything else is a
 * recoverable `error`. Session/token ops delegate to the shared client.
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

test("disabled provider reports not-configured without opening an OAuth flow", async () => {
  const client = fakeClient();
  const apple = createNeonAuthProvider({ client, social: "apple", enabled: false });
  assert.deepEqual(await apple.signIn(), { status: "not-configured" });
  assert.deepEqual(client.socialCalls, []);
});

test("authenticated attempt → signed-in", async () => {
  const client = fakeClient({ attempt: { result: "authenticated" } });
  const google = createNeonAuthProvider({ client, social: "google", enabled: true });
  assert.deepEqual(await google.signIn(), { status: "signed-in" });
  assert.deepEqual(client.socialCalls, ["google"]);
});

test("dismissed browser → cancelled (not an error)", async () => {
  const client = fakeClient({ attempt: { result: "dismissed" } });
  const google = createNeonAuthProvider({ client, social: "google", enabled: true });
  assert.deepEqual(await google.signIn(), { status: "cancelled" });
});

test("failed attempt → recoverable error carrying the message", async () => {
  const client = fakeClient({ attempt: { result: "failed", message: "network down" } });
  const google = createNeonAuthProvider({ client, social: "google", enabled: true });
  assert.deepEqual(await google.signIn(), { status: "error", message: "network down" });
});

test("session and token operations delegate to the client", async () => {
  const client = fakeClient({ hasSession: true, jwt: "jwt-123" });
  const google = createNeonAuthProvider({ client, social: "google", enabled: true });
  assert.equal(await google.restoreSession(), true);
  assert.equal(await google.getAccessToken(), "jwt-123");
  await google.signOut();
  assert.equal(client.signedOut, true);
});
