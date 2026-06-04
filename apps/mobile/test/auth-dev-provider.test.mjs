import assert from "node:assert/strict";
import test from "node:test";

import { createDevAuthProvider } from "../dist/domains/auth/service/dev-provider.js";

/**
 * The Dev Auth Provider is the launch-only fake (ADR 0012): a sign-in strategy
 * that reports success so the gate walk works with no backend. It holds no real
 * session — session/token/sign-out are the Auth Adapter's, served by the real
 * Neon client, and are covered at the adapter interface (auth-adapter.test.mjs
 * "session, token, and sign-out delegate to the shared client", includeDev:true).
 */

test("dev provider sign-in succeeds (launch-only fake)", async () => {
  const provider = createDevAuthProvider();
  assert.deepEqual(await provider.signIn(), { status: "signed-in" });
});
