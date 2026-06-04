import assert from "node:assert/strict";
import test from "node:test";

import { createNeonAuthProvider } from "../dist/domains/auth/service/neon-provider.js";

/**
 * The Neon Auth provider is a pure sign-in strategy: it interprets an OAuth
 * attempt — dismissed browser is `cancelled`, an established session is
 * `signed-in`, anything else is a recoverable `error`. Capability honesty
 * (not-configured, never opening a dead flow) is the Auth Adapter's, covered in
 * auth-adapter.test.mjs; session/token/sign-out are the adapter's too.
 */

function fakeClient(overrides = {}) {
  return {
    socialCalls: [],
    signInSocial(provider) {
      this.socialCalls.push(provider);
      return Promise.resolve(overrides.attempt ?? { result: "authenticated" });
    },
  };
}

test("authenticated attempt → signed-in", async () => {
  const client = fakeClient({ attempt: { result: "authenticated" } });
  const google = createNeonAuthProvider({ client, social: "google" });
  assert.deepEqual(await google.signIn(), { status: "signed-in" });
  assert.deepEqual(client.socialCalls, ["google"]);
});

test("dismissed browser → cancelled (not an error)", async () => {
  const client = fakeClient({ attempt: { result: "dismissed" } });
  const google = createNeonAuthProvider({ client, social: "google" });
  assert.deepEqual(await google.signIn(), { status: "cancelled" });
});

test("failed attempt → recoverable error carrying the message", async () => {
  const client = fakeClient({ attempt: { result: "failed", message: "network down" } });
  const google = createNeonAuthProvider({ client, social: "google" });
  assert.deepEqual(await google.signIn(), { status: "error", message: "network down" });
});
