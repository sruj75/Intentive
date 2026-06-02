import assert from "node:assert/strict";
import test from "node:test";

import { createDevAuthProvider } from "../dist/domains/auth/service/dev-provider.js";

/**
 * The Dev Auth Provider is the launch-only fake (ADR 0012): it reports success
 * so the gate walk works with no backend, but holds no real session.
 */

test("dev provider sign-in succeeds (launch-only fake)", async () => {
  const provider = createDevAuthProvider();
  assert.deepEqual(await provider.signIn(), { status: "signed-in" });
});

test("dev provider holds no real session: no restore, no token", async () => {
  const provider = createDevAuthProvider();
  assert.equal(await provider.restoreSession(), false);
  assert.equal(await provider.getAccessToken(), null);
});
