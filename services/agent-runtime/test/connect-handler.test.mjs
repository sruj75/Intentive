import assert from "node:assert/strict";
import test from "node:test";

import { createConnectHandler } from "../dist/index.js";

const validConnect = {
  type: "connect",
  auth_token: "jwt_1",
  client_kind: "mobile",
  client_version: "1.0.0",
};

test("connect handshake verifies the JWT and returns hello_ok with an empty Session Snapshot", async () => {
  let seenToken;
  const handler = createConnectHandler({
    sessions: sessionRegistry({
      authSubject: "auth-sub-1",
      userId: "00000000-0000-4000-8000-000000000001",
      agentInstanceId: "agent_instance_1",
    }),
    verifier: {
      verify: async (token) => {
        seenToken = token;
        return { user_id: "auth-sub-1" };
      },
    },
  });

  const result = await handler.handle(validConnect);

  assert.equal(seenToken, "jwt_1");
  assert.equal(result.closeSocket, false);
  assert.deepEqual(result.response, {
    type: "hello_ok",
    session_snapshot: { messages: [], before_cursor: null },
  });
  assert.deepEqual(result.session, {
    userId: "00000000-0000-4000-8000-000000000001",
    clientKind: "mobile",
    agentInstanceId: "agent_instance_1",
  });
});

test("connect handshake maps JWT verification failures to structured runtime errors", async () => {
  for (const [reason, code] of [
    ["invalid_signature", "auth_failed"],
    ["expired", "auth_failed"],
    ["jwks_unavailable", "service_unavailable"],
  ]) {
    const handler = createConnectHandler({
      sessions: sessionRegistry({
        authSubject: "auth-sub-1",
        userId: "00000000-0000-4000-8000-000000000001",
        agentInstanceId: "agent_instance_1",
      }),
      verifier: { verify: async () => Promise.reject({ reason }) },
    });

    const result = await handler.handle(validConnect);

    assert.equal(result.closeSocket, true);
    assert.equal(result.response.type, "runtime_error");
    assert.equal(result.response.code, code);
  }
});

test("pre-handshake non-connect events are rejected before JWT verification", async () => {
  let verifierCalls = 0;
  const handler = createConnectHandler({
    sessions: sessionRegistry({
      authSubject: "auth-sub-1",
      userId: "00000000-0000-4000-8000-000000000001",
      agentInstanceId: "agent_instance_1",
    }),
    verifier: {
      verify: async () => {
        verifierCalls += 1;
        return { user_id: "auth-sub-1" };
      },
    },
  });

  const result = await handler.handle({
    type: "user_message",
    message_id: "message_1",
    body: "hello",
    sent_at: "2026-06-06T00:00:00.000Z",
  });

  assert.equal(result.closeSocket, true);
  assert.deepEqual(result.response, {
    type: "runtime_error",
    code: "invalid_connect",
    message: "First WebSocket event must be connect.",
  });
  assert.equal(verifierCalls, 0);
});

test("malformed inbound events are rejected as invalid_connect", async () => {
  let verifierCalls = 0;
  const handler = createConnectHandler({
    sessions: sessionRegistry({
      authSubject: "auth-sub-1",
      userId: "00000000-0000-4000-8000-000000000001",
      agentInstanceId: "agent_instance_1",
    }),
    verifier: {
      verify: async () => {
        verifierCalls += 1;
        return { user_id: "auth-sub-1" };
      },
    },
  });

  const result = await handler.handle({ type: "connect", client_kind: "mobile" });

  assert.equal(result.closeSocket, true);
  assert.equal(result.response.type, "runtime_error");
  assert.equal(result.response.code, "invalid_connect");
  assert.equal(verifierCalls, 0);
});

test("connect resolves the WebSocket session from the verified auth subject, not by creating an Agent Instance from it", async () => {
  let seenSubject;
  const handler = createConnectHandler({
    sessions: {
      loadSessionByAuthSubject: async ({ authSubject, clientKind }) => {
        seenSubject = authSubject;
        return {
          userId: "00000000-0000-4000-8000-000000000001",
          clientKind,
          agentInstanceId: "agent_instance_1",
        };
      },
    },
    verifier: { verify: async () => ({ user_id: "auth-sub-not-a-uuid" }) },
  });

  const result = await handler.handle(validConnect);

  assert.equal(seenSubject, "auth-sub-not-a-uuid");
  assert.equal(result.closeSocket, false);
  assert.deepEqual(result.session, {
    userId: "00000000-0000-4000-8000-000000000001",
    clientKind: "mobile",
    agentInstanceId: "agent_instance_1",
  });
});

test("connect rejects valid JWTs that have not gone through Session Start", async () => {
  const handler = createConnectHandler({
    sessions: { loadSessionByAuthSubject: async () => null },
    verifier: { verify: async () => ({ user_id: "auth-sub-1" }) },
  });

  const result = await handler.handle(validConnect);

  assert.equal(result.closeSocket, true);
  assert.deepEqual(result.response, {
    type: "runtime_error",
    code: "service_unavailable",
    message: "Session has not been started.",
  });
});

function sessionRegistry({ authSubject, userId, agentInstanceId }) {
  return {
    loadSessionByAuthSubject: async (input) => ({
      userId: input.authSubject === authSubject ? userId : "unexpected_user",
      clientKind: input.clientKind,
      agentInstanceId,
    }),
  };
}
