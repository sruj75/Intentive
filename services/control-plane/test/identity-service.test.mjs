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
const fakeDevices = (list = []) => ({ listDevicesForUser: async () => list });
const fakeAgents = (has = false) => ({ hasAgentInstance: async () => has });
const recordingLogger = (records) => ({
  info: (event, attrs) => records.push({ level: "info", event, attrs }),
  warn: (event, attrs) => records.push({ level: "warn", event, attrs }),
  error: (event, error, attrs) => records.push({ level: "error", event, error, attrs }),
  child: () => recordingLogger(records),
});

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
    devices: fakeDevices(),
    agents: fakeAgents(),
  }).authenticate("tok");

  assert.deepEqual(result, { userId: "u_1" });
  assert.deepEqual(seen, ["tok"]);
});

test("authenticate logs JWT verification success", async () => {
  const records = [];

  await createIdentityService({
    verifier: fakeVerifier("sub-1"),
    users: fakeUsers("u_1"),
    gates: fakeGates(null),
    devices: fakeDevices(),
    agents: fakeAgents(),
    logger: recordingLogger(records),
  }).authenticate("tok");

  assert.deepEqual(records, [{ level: "info", event: "auth.jwt_verify", attrs: { status: "ok" } }]);
});

test("resolveAccount composes the gate the gates domain reports", async () => {
  const account = await createIdentityService({
    verifier: fakeVerifier("sub-1"),
    users: fakeUsers("u_1"),
    gates: fakeGates("consent_primer"),
    devices: fakeDevices(),
    agents: fakeAgents(),
  }).resolveAccount("tok");

  assert.deepEqual(account, {
    user_id: "u_1",
    next_gate: "consent_primer",
    has_agent_instance: false,
    has_desktop_client: false,
  });
});

test("resolveAccount reflects has_agent_instance from the injected agents reader", async () => {
  const seen = [];
  const account = await createIdentityService({
    verifier: fakeVerifier("sub-1"),
    users: fakeUsers("u_1"),
    gates: fakeGates(null),
    devices: fakeDevices(),
    agents: {
      hasAgentInstance: async (userId) => {
        seen.push(userId);
        return true;
      },
    },
  }).resolveAccount("tok");

  assert.equal(account.has_agent_instance, true, "the reader's answer drives the field");
  assert.deepEqual(seen, ["u_1"], "asked for the resolved internal user id");
});

test("resolveAccount reports a registered Desktop Client from the Device Registry", async () => {
  const account = await createIdentityService({
    verifier: fakeVerifier("sub-1"),
    users: fakeUsers("u_1"),
    gates: fakeGates(null),
    devices: fakeDevices([{ client_kind: "desktop" }]),
    agents: fakeAgents(),
  }).resolveAccount("tok", { client_kind: "mobile" });

  assert.equal(account.has_desktop_client, true);
});

test("resolveAccount does not treat Mobile-only devices as a registered Desktop Client", async () => {
  const account = await createIdentityService({
    verifier: fakeVerifier("sub-1"),
    users: fakeUsers("u_1"),
    gates: fakeGates(null),
    devices: fakeDevices([{ client_kind: "mobile" }]),
    agents: fakeAgents(),
  }).resolveAccount("tok", { client_kind: "mobile" });

  assert.equal(account.has_desktop_client, false);
});

test("resolveRoutingContext returns userId, authSubject, and nextGate from one verification", async () => {
  let verifyCount = 0;
  const ctx = await createIdentityService({
    verifier: {
      verify: async () => {
        verifyCount += 1;
        return { user_id: "sub-1" };
      },
    },
    users: fakeUsers("u_1"),
    gates: fakeGates("consent_primer"),
    devices: fakeDevices(),
    agents: fakeAgents(),
  }).resolveRoutingContext("tok");

  assert.deepEqual(ctx, { userId: "u_1", authSubject: "sub-1", nextGate: "consent_primer" });
  assert.equal(verifyCount, 1, "routing context costs exactly one verification");
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
    devices: fakeDevices(),
    agents: fakeAgents(),
  }).resolveAccount("tok");

  assert.deepEqual(seen, ["u_1"], "gates are computed for the internal user id");
  assert.equal(account.next_gate, null);
});

test("resolveAccount derives hasSiblingDevice from the registry and forwards the device context", async () => {
  const seen = [];
  const gates = {
    nextGate: async (_userId, device) => {
      seen.push(device);
      return null;
    },
  };

  await createIdentityService({
    verifier: fakeVerifier("sub-1"),
    users: fakeUsers("u_1"),
    gates,
    // The caller is a Mobile client; the user also owns a Desktop → a sibling.
    devices: fakeDevices([{ client_kind: "desktop" }]),
    agents: fakeAgents(),
  }).resolveAccount("tok", { client_kind: "mobile", capture_permission_granted: undefined });

  assert.deepEqual(seen, [
    { clientKind: "mobile", capturePermissionGranted: undefined, hasSiblingDevice: true },
  ]);
});

test("a device of the caller's own client_kind is not a sibling", async () => {
  const seen = [];
  const gates = {
    nextGate: async (_userId, device) => {
      seen.push(device.hasSiblingDevice);
      return null;
    },
  };

  await createIdentityService({
    verifier: fakeVerifier("sub-1"),
    users: fakeUsers("u_1"),
    gates,
    devices: fakeDevices([{ client_kind: "mobile" }]),
    agents: fakeAgents(),
  }).resolveAccount("tok", { client_kind: "mobile" });

  assert.deepEqual(seen, [false], "only a *different* client_kind counts as a sibling");
});

test("an Android device is ignored when computing the sibling for a Mobile caller", async () => {
  const seen = [];
  const gates = {
    nextGate: async (_userId, device) => {
      seen.push(device.hasSiblingDevice);
      return null;
    },
  };

  await createIdentityService({
    verifier: fakeVerifier("sub-1"),
    users: fakeUsers("u_1"),
    gates,
    devices: fakeDevices([{ client_kind: "android" }]),
    agents: fakeAgents(),
  }).resolveAccount("tok", { client_kind: "mobile" });

  assert.deepEqual(seen, [false], "Android is ignored for sibling computation in v1");
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
  let devicesCalled = false;
  const devices = {
    listDevicesForUser: async () => {
      devicesCalled = true;
      return [];
    },
  };
  let agentsCalled = false;
  const agents = {
    hasAgentInstance: async () => {
      agentsCalled = true;
      return false;
    },
  };

  await assert.rejects(
    () => createIdentityService({ verifier, users, gates, devices, agents }).resolveAccount("tok"),
    (err) => {
      assert.ok(err instanceof JwtVerificationError);
      assert.equal(err.reason, "expired");
      return true;
    },
  );
  assert.equal(repoCalled, false, "a failed verification must short-circuit before the repo");
  assert.equal(gatesCalled, false, "a failed verification must short-circuit before gates");
  assert.equal(devicesCalled, false, "a failed verification must short-circuit before devices");
  assert.equal(agentsCalled, false, "a failed verification must short-circuit before agents");
});

test("resolveAccount logs JWT verification failure reason", async () => {
  const records = [];
  await assert.rejects(
    () =>
      createIdentityService({
        verifier: {
          verify: async () => {
            throw new JwtVerificationError("expired", "redacted");
          },
        },
        users: fakeUsers("u_1"),
        gates: fakeGates(null),
        devices: fakeDevices(),
        agents: fakeAgents(),
        logger: recordingLogger(records),
      }).resolveAccount("tok"),
    JwtVerificationError,
  );

  assert.deepEqual(records, [
    {
      level: "warn",
      event: "auth.jwt_verify",
      attrs: { status: "failed", reason: "expired" },
    },
  ]);
});
