/**
 * Identity service logic, fully hermetic: fake verifier, repo, and gates stand
 * in for the JWKS network call, the database, and the gates domain, so this tier
 * proves the composition (verify → resolve → ask gates → assemble) without any
 * I/O. It is the sole assembler of `AccountState` (ADR-0004); each field comes
 * from the owning collaborator.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { JwtVerificationError } from "@intentive/providers/auth";

import { createIdentityService } from "../dist/domains/identity/service/resolve-account.js";

const fakeVerifier = (sub) => ({ verify: async () => ({ user_id: sub }) });
const fakeUsers = (userId) => ({ resolveUser: async () => ({ userId }) });
const fakeGates = (gate) => ({ nextGate: async () => gate });

test("authenticate maps a verified subject to the internal user id", async () => {
  const seen = [];
  const verifier = {
    verify: async (token) => {
      seen.push(token);
      return { user_id: "sub-1" };
    },
  };
  const users = {
    resolveUser: async ({ sub }) => {
      assert.equal(sub, "sub-1");
      return { userId: "u_1" };
    },
  };

  const result = await createIdentityService({
    verifier,
    users,
    gates: fakeGates(null),
  }).authenticate("tok");

  assert.deepEqual(result, { userId: "u_1" });
  assert.deepEqual(seen, ["tok"]);
});

test("resolveAccount composes the gate the gates domain reports", async () => {
  const account = await createIdentityService({
    verifier: fakeVerifier("sub-1"),
    users: fakeUsers("u_1"),
    gates: fakeGates("consent_primer"),
  }).resolveAccount("tok");

  assert.deepEqual(account, {
    user_id: "u_1",
    next_gate: "consent_primer",
    has_agent_instance: false,
  });
});

test("resolveAccount asks gates for the resolved user, not the subject", async () => {
  const seen = [];
  const gates = {
    nextGate: async (userId) => {
      seen.push(userId);
      return null;
    },
  };

  const account = await createIdentityService({
    verifier: fakeVerifier("sub-1"),
    users: fakeUsers("u_1"),
    gates,
  }).resolveAccount("tok");

  assert.deepEqual(seen, ["u_1"], "gates are computed for the internal user id");
  assert.equal(account.next_gate, null);
});

test("resolveAccount propagates a verification failure and never touches repo or gates", async () => {
  let repoCalled = false;
  let gatesCalled = false;
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
  const gates = {
    nextGate: async () => {
      gatesCalled = true;
      return null;
    },
  };

  await assert.rejects(
    () => createIdentityService({ verifier, users, gates }).resolveAccount("tok"),
    (err) => {
      assert.ok(err instanceof JwtVerificationError);
      assert.equal(err.reason, "expired");
      return true;
    },
  );
  assert.equal(repoCalled, false, "a failed verification must short-circuit before the repo");
  assert.equal(gatesCalled, false, "a failed verification must short-circuit before gates");
});
