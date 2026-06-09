/**
 * `POST /consent` handler, hermetic: fake identity + gates drive each branch.
 * The handler owns the same HTTP concerns as `GET /me` — authenticating the
 * request and mapping auth failures to a status — plus recording the gate for
 * the authenticated user and validating the boundary in and out.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { JwtVerificationError } from "@intentive/providers/auth";

import { createPostConsentHandler } from "../dist/domains/identity/ui/post-consent.js";

const identityFor = (userId) => ({ authenticate: async () => ({ userId }) });

test("a valid token records consent for the resolved user and returns ok", async () => {
  const recorded = [];
  const res = await createPostConsentHandler({
    identity: identityFor("u_1"),
    gates: { recordConsent: async (userId) => recorded.push(userId) },
  }).handle({ authorization: "Bearer good.jwt.token", body: {} });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.deepEqual(recorded, ["u_1"], "consent is recorded for the authenticated user");
});

test("a missing Authorization header → 401 and never records", async () => {
  const res = await createPostConsentHandler({
    identity: { authenticate: async () => assert.fail("must not authenticate without a token") },
    gates: { recordConsent: async () => assert.fail("must not record on an unauthenticated call") },
  }).handle({ authorization: null, body: {} });

  assert.equal(res.status, 401);
  assert.equal(res.body.code, "auth_failed");
});

test("an expired token → 401 and never records", async () => {
  const res = await createPostConsentHandler({
    identity: {
      authenticate: async () => {
        throw new JwtVerificationError("expired", "redacted");
      },
    },
    gates: { recordConsent: async () => assert.fail("must not record on a failed verification") },
  }).handle({ authorization: "Bearer some.jwt.token", body: {} });

  assert.equal(res.status, 401);
  assert.equal(res.body.code, "auth_failed");
});

test("a JWKS outage → retryable 503", async () => {
  const res = await createPostConsentHandler({
    identity: {
      authenticate: async () => {
        throw new JwtVerificationError("jwks_unavailable", "redacted");
      },
    },
    gates: { recordConsent: async () => assert.fail("must not record when auth is unavailable") },
  }).handle({ authorization: "Bearer some.jwt.token", body: {} });

  assert.equal(res.status, 503);
  assert.equal(res.body.code, "service_unavailable");
});
