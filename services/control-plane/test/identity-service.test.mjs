/**
 * Identity service logic, fully hermetic: a fake verifier and a fake repo stand
 * in for the JWKS network call and the database, so this tier proves the
 * composition (verify → resolve → assemble) without any I/O.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { JwtVerificationError } from "@intentive/providers/auth";

import { createIdentityService } from "../dist/domains/identity/service/resolve-account.js";

test("resolveAccount maps a verified sub to the user_id skeleton", async () => {
  const seen = [];
  const verifier = {
    verify: async (token) => {
      seen.push(token);
      return { user_id: "sub-1" }; // verifier returns the IdP subject
    },
  };
  const users = {
    resolveUser: async ({ sub }) => {
      assert.equal(sub, "sub-1");
      return { userId: "u_1" };
    },
  };

  const account = await createIdentityService({ verifier, users }).resolveAccount("tok");

  assert.deepEqual(account, { user_id: "u_1", next_gate: null, has_agent_instance: false });
  assert.deepEqual(seen, ["tok"]);
});

test("resolveAccount propagates a verification failure and never touches the repo", async () => {
  let repoCalled = false;
  const verifier = {
    verify: async () => {
      throw new JwtVerificationError("expired", "redacted");
    },
  };
  const users = {
    resolveUser: async () => {
      repoCalled = true;
      return { userId: "u_1" };
    },
  };

  await assert.rejects(
    () => createIdentityService({ verifier, users }).resolveAccount("tok"),
    (err) => {
      assert.ok(err instanceof JwtVerificationError);
      assert.equal(err.reason, "expired");
      return true;
    },
  );
  assert.equal(repoCalled, false, "a failed verification must short-circuit before the repo");
});
