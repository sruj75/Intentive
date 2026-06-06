/**
 * `GET /me` handler, hermetic: a fake IdentityService drives each branch. The
 * handler owns header parsing, error→status mapping, and outgoing validation;
 * those are what these tests pin.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { AccountState } from "@intentive/api-contract";
import { JwtVerificationError } from "@intentive/providers/auth";

import { createGetMeHandler } from "../dist/domains/identity/ui/get-me.js";

const handlerThatThrows = (reason) =>
  createGetMeHandler({
    identity: {
      resolveAccount: async () => {
        throw new JwtVerificationError(reason, "redacted secret-token for secret-user-id");
      },
    },
  });

test("a missing Authorization header → 401 auth_failed", async () => {
  const res = await createGetMeHandler({
    identity: { resolveAccount: async () => assert.fail("must not verify without a token") },
  }).handle({ authorization: null });

  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { code: "auth_failed", message: "Authentication failed." });
});

test("a JWKS outage → retryable 503 service_unavailable", async () => {
  const res = await handlerThatThrows("jwks_unavailable").handle({
    authorization: "Bearer some.jwt.token",
  });
  assert.equal(res.status, 503);
  assert.equal(res.body.code, "service_unavailable");
});

test("an expired token → 401 auth_failed", async () => {
  const res = await handlerThatThrows("expired").handle({
    authorization: "Bearer some.jwt.token",
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.code, "auth_failed");
});

test("error responses never leak the token or claims", async () => {
  const res = await handlerThatThrows("invalid_signature").handle({
    authorization: "Bearer secret-token",
  });
  const serialized = JSON.stringify(res.body);
  for (const fragment of ["secret-token", "secret-user-id"]) {
    assert.equal(serialized.includes(fragment), false);
  }
});

test("a valid token → 200 with a body that round-trips as AccountState", async () => {
  const skeleton = { user_id: "u_1", next_gate: null, has_agent_instance: false };
  const res = await createGetMeHandler({
    identity: { resolveAccount: async () => skeleton },
  }).handle({ authorization: "Bearer good.jwt.token" });

  assert.equal(res.status, 200);
  assert.deepEqual(AccountState.parse(res.body), skeleton);
});
