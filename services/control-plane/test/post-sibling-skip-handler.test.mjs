/**
 * `POST /sibling-invitation/skip` handler, hermetic: fake identity + gates. Same
 * shape as the consent handler — authenticate, record for the user, map auth
 * failures — exercised here to pin the sibling-skip wiring independently.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createPostSiblingInvitationSkipHandler } from "../dist/domains/identity/ui/post-sibling-invitation-skip.js";

const identityFor = (userId) => ({ authenticate: async () => ({ userId }) });

test("a valid token records the skip for the resolved user and returns ok", async () => {
  const recorded = [];
  const res = await createPostSiblingInvitationSkipHandler({
    identity: identityFor("u_1"),
    gates: { recordSiblingSkip: async (userId) => recorded.push(userId) },
  }).handle({ authorization: "Bearer good.jwt.token", body: {} });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.deepEqual(recorded, ["u_1"]);
});

// One wiring case proves the handler routes through `requireUser` and
// short-circuits before the gate write; the full auth-failure matrix lives in
// http-auth.test.mjs.
test("an unauthenticated request → 401 and never records", async () => {
  const res = await createPostSiblingInvitationSkipHandler({
    identity: { authenticate: async () => assert.fail("must not authenticate without a token") },
    gates: { recordSiblingSkip: async () => assert.fail("must not record unauthenticated") },
  }).handle({ authorization: null, body: {} });

  assert.equal(res.status, 401);
  assert.equal(res.body.code, "auth_failed");
});
