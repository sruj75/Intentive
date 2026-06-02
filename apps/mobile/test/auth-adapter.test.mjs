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
    signInSocial: () => Promise.resolve(overrides.attempt ?? { result: "authenticated" }),
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

test("a social provider without credentials is not-configured", async () => {
  const adapter = createAuthAdapter({
    client: fakeClient(),
    enabled: new Set(["google"]), // apple absent
    includeDev: false,
  });
  assert.deepEqual(await adapter.signIn("apple"), { status: "not-configured" });
});

test("session, token, and sign-out delegate to the shared client", async () => {
  const client = fakeClient({ hasSession: true, jwt: "jwt-xyz" });
  const adapter = createAuthAdapter({ client, enabled: ALL, includeDev: true });
  assert.equal(await adapter.restoreSession(), true);
  assert.equal(await adapter.getAccessToken(), "jwt-xyz");
  await adapter.signOut();
  assert.equal(client.signedOut, true);
});
