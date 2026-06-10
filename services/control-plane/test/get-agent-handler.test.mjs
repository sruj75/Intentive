/**
 * `GET /agent` handler, hermetic: fake identity + fake agents drive each branch.
 * The handler owns the HTTP concerns — token extraction, gate enforcement,
 * error→status mapping, and outgoing validation — and, crucially, that the
 * `runtime_jwt` it returns is the inbound bearer token verbatim (ADR-0002).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { GetAgentResponse } from "@intentive/api-contract";
import { JwtVerificationError } from "@intentive/providers/auth";

import { createGetAgentHandler } from "../dist/domains/routing/ui/get-agent.js";
import { AgentRuntimeUnavailableError } from "../dist/domains/agents/types/runtime-errors.js";

const routingCtx = (over = {}) => ({
  userId: "u_1",
  authSubject: "sub-1",
  nextGate: null,
  ...over,
});

const identityFor = (ctx) => ({ resolveRoutingContext: async () => ctx });
const agentsFor = (identity) => ({ ensureAgentInstance: async () => identity });

test("a satisfied caller → 200 with routing whose runtime_jwt is the inbound token", async () => {
  const res = await createGetAgentHandler({
    identity: identityFor(routingCtx()),
    agents: agentsFor({
      agentInstanceId: "agent_42",
      wsUrl: "wss://runtime.example.com/ws",
    }),
  }).handle({ authorization: "Bearer the.user.jwt" });

  assert.equal(res.status, 200);
  const body = GetAgentResponse.parse(res.body);
  assert.equal(body.agent_instance_id, "agent_42");
  assert.equal(body.ws_url, "wss://runtime.example.com/ws");
  assert.equal(body.runtime_jwt, "the.user.jwt", "runtime_jwt is the pass-through bearer token");
});

test("the resolved principal is forwarded to ensureAgentInstance", async () => {
  const seen = [];
  await createGetAgentHandler({
    identity: identityFor(routingCtx({ userId: "u_9", authSubject: "sub-9" })),
    agents: {
      ensureAgentInstance: async (input) => {
        seen.push(input);
        return { agentInstanceId: "a", wsUrl: "wss://r/ws" };
      },
    },
  }).handle({ authorization: "Bearer t" });

  assert.deepEqual(seen, [{ userId: "u_9", authSubject: "sub-9" }]);
});

test("a missing Authorization header → 401 and never resolves or provisions", async () => {
  const res = await createGetAgentHandler({
    identity: {
      resolveRoutingContext: async () => assert.fail("must not resolve without a token"),
    },
    agents: { ensureAgentInstance: async () => assert.fail("must not provision unauthenticated") },
  }).handle({ authorization: null });

  assert.equal(res.status, 401);
  assert.equal(res.body.code, "auth_failed");
});

test("an expired token → 401 and never provisions", async () => {
  const res = await createGetAgentHandler({
    identity: {
      resolveRoutingContext: async () => {
        throw new JwtVerificationError("expired", "redacted secret-token for secret-user-id");
      },
    },
    agents: {
      ensureAgentInstance: async () => assert.fail("must not provision on a failed verify"),
    },
  }).handle({ authorization: "Bearer some.jwt.token" });

  assert.equal(res.status, 401);
  assert.equal(res.body.code, "auth_failed");
});

test("a JWKS outage → retryable 503 service_unavailable", async () => {
  const res = await createGetAgentHandler({
    identity: {
      resolveRoutingContext: async () => {
        throw new JwtVerificationError("jwks_unavailable", "redacted");
      },
    },
    agents: {
      ensureAgentInstance: async () => assert.fail("must not provision when auth is down"),
    },
  }).handle({ authorization: "Bearer some.jwt.token" });

  assert.equal(res.status, 503);
  assert.equal(res.body.code, "service_unavailable");
});

test("an unsatisfied gate → bare 403 gate_required and never provisions", async () => {
  let provisioned = false;
  const res = await createGetAgentHandler({
    identity: identityFor(routingCtx({ nextGate: "consent_primer" })),
    agents: {
      ensureAgentInstance: async () => {
        provisioned = true;
        return { agentInstanceId: "a", wsUrl: "wss://r/ws" };
      },
    },
  }).handle({ authorization: "Bearer good.jwt.token" });

  assert.equal(res.status, 403);
  assert.equal(res.body.code, "gate_required");
  assert.equal(provisioned, false, "a gate short-circuits before Session Start");
  assert.equal(
    JSON.stringify(res.body).includes("consent_primer"),
    false,
    "the 403 leaks no gate details — /me is the explainer",
  );
});

test("the Runtime being unavailable → retryable 503 with no token/claim leakage", async () => {
  const res = await createGetAgentHandler({
    identity: identityFor(routingCtx()),
    agents: {
      ensureAgentInstance: async () => {
        throw new AgentRuntimeUnavailableError("transport", "boom");
      },
    },
  }).handle({ authorization: "Bearer secret-token" });

  assert.equal(res.status, 503);
  assert.equal(res.body.code, "service_unavailable");
  const serialized = JSON.stringify(res.body);
  assert.equal(serialized.includes("secret-token"), false);
  assert.equal(serialized.includes("sub-1"), false);
});

test("the device-signal headers are parsed and forwarded to resolveRoutingContext", async () => {
  const seen = [];
  await createGetAgentHandler({
    identity: {
      resolveRoutingContext: async (_token, signal) => {
        seen.push(signal);
        return routingCtx();
      },
    },
    agents: agentsFor({ agentInstanceId: "a", wsUrl: "wss://r/ws" }),
  }).handle({
    authorization: "Bearer t",
    clientKind: "desktop",
    capturePermissionGranted: "false",
  });

  assert.deepEqual(seen, [{ client_kind: "desktop", capture_permission_granted: false }]);
});
