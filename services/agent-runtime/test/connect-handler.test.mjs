import assert from "node:assert/strict";
import test from "node:test";

import { JwtVerificationError } from "@intentive/providers/auth";

import { createConnectHandler } from "../dist/index.js";

const validConnect = {
  type: "connect",
  auth_token: "jwt_1",
  client_kind: "mobile",
  client_version: "1.0.0",
};

const emptySnapshot = { messages: [], before_cursor: null };

function snapshotReader(snapshot = emptySnapshot) {
  return { readSnapshot: async () => snapshot };
}

test("connect handshake verifies the JWT and returns hello_ok with the User's reconnect Session Snapshot", async () => {
  let seenToken;
  let seenUserId;
  const snapshot = {
    messages: [
      {
        message_id: "m1",
        author: "user",
        body: "hello",
        at: "2026-06-10T00:00:00.000Z",
        via_post_message_back: false,
      },
    ],
    before_cursor: "7",
  };
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
    floorResolver: floorResolver(),
    conversation: {
      readSnapshot: async (userId) => {
        seenUserId = userId;
        return snapshot;
      },
    },
  });

  const result = await handler.handle(validConnect);

  assert.equal(seenToken, "jwt_1");
  assert.equal(seenUserId, "00000000-0000-4000-8000-000000000001");
  assert.equal(result.closeSocket, false);
  assert.deepEqual(result.response, {
    type: "hello_ok",
    session_snapshot: snapshot,
  });
  assert.deepEqual(result.session, {
    userId: "00000000-0000-4000-8000-000000000001",
    clientKind: "mobile",
    agentInstanceId: "agent_instance_1",
    pinnedFloor: floor("floor_v1"),
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
      verifier: {
        verify: async () => Promise.reject(new JwtVerificationError(reason, "verification failed")),
      },
      floorResolver: floorResolver(),
      conversation: snapshotReader(),
    });

    const result = await handler.handle(validConnect);

    assert.equal(result.closeSocket, true);
    assert.equal(result.response.type, "runtime_error");
    assert.equal(result.response.code, code);
  }
});

test("connect handshake maps Session Snapshot read failures to the history failure domain", async () => {
  const handler = createConnectHandler({
    sessions: sessionRegistry({
      authSubject: "auth-sub-1",
      userId: "00000000-0000-4000-8000-000000000001",
      agentInstanceId: "agent_instance_1",
    }),
    verifier: { verify: async () => ({ user_id: "auth-sub-1" }) },
    floorResolver: floorResolver(),
    conversation: {
      readSnapshot: async () => {
        throw new Error("history unavailable");
      },
    },
  });

  const result = await handler.handle(validConnect);

  assert.equal(result.closeSocket, true);
  assert.deepEqual(result.response, {
    type: "runtime_error",
    code: "service_unavailable",
    message: "Conversation history is temporarily unavailable.",
  });
});

test("connect handshake maps session lookup failures to service_unavailable", async () => {
  const handler = createConnectHandler({
    sessions: {
      loadSessionByAuthSubject: async () => {
        const err = new Error("database unavailable");
        err.name = "NeonDbError";
        throw err;
      },
    },
    verifier: { verify: async () => ({ user_id: "auth-sub-1" }) },
    floorResolver: floorResolver(),
    conversation: snapshotReader(),
  });

  const result = await handler.handle(validConnect);

  assert.equal(result.closeSocket, true);
  assert.deepEqual(result.response, {
    type: "runtime_error",
    code: "service_unavailable",
    message: "Session is temporarily unavailable.",
  });
});

test("connect handshake still maps JWT failures through the auth taxonomy", async () => {
  const handler = createConnectHandler({
    sessions: sessionRegistry({
      authSubject: "auth-sub-1",
      userId: "00000000-0000-4000-8000-000000000001",
      agentInstanceId: "agent_instance_1",
    }),
    verifier: {
      verify: async () =>
        Promise.reject(new JwtVerificationError("invalid_signature", "verification failed")),
    },
    floorResolver: floorResolver(),
    conversation: {
      readSnapshot: async () => {
        throw new Error("must not read history after auth failure");
      },
    },
  });

  const result = await handler.handle(validConnect);

  assert.equal(result.closeSocket, true);
  assert.equal(result.response.type, "runtime_error");
  assert.equal(result.response.code, "auth_failed");
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
    floorResolver: floorResolver(),
    conversation: snapshotReader(),
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
    floorResolver: floorResolver(),
    conversation: snapshotReader(),
  });

  const result = await handler.handle({ type: "connect", client_kind: "mobile" });

  assert.equal(result.closeSocket, true);
  assert.equal(result.response.type, "runtime_error");
  assert.equal(result.response.code, "invalid_connect");
  assert.equal(verifierCalls, 0);
});

test("connect resolves the WebSocket session from the verified auth subject, not by creating an Agent Instance from it", async () => {
  let seenSubject;
  let seenClientTz;
  const handler = createConnectHandler({
    sessions: {
      loadSessionByAuthSubject: async ({ authSubject, clientKind, clientTz }) => {
        seenSubject = authSubject;
        seenClientTz = clientTz;
        return {
          userId: "00000000-0000-4000-8000-000000000001",
          clientKind,
          agentInstanceId: "agent_instance_1",
        };
      },
    },
    verifier: { verify: async () => ({ user_id: "auth-sub-not-a-uuid" }) },
    floorResolver: floorResolver(),
    conversation: snapshotReader(),
  });

  const result = await handler.handle({ ...validConnect, client_tz: "Asia/Kolkata" });

  assert.equal(seenSubject, "auth-sub-not-a-uuid");
  assert.equal(seenClientTz, "Asia/Kolkata");
  assert.equal(result.closeSocket, false);
  assert.deepEqual(result.session, {
    userId: "00000000-0000-4000-8000-000000000001",
    clientKind: "mobile",
    agentInstanceId: "agent_instance_1",
    pinnedFloor: floor("floor_v1"),
  });
});

test("connect rejects valid JWTs that have not gone through Session Start", async () => {
  const handler = createConnectHandler({
    sessions: { loadSessionByAuthSubject: async () => null },
    verifier: { verify: async () => ({ user_id: "auth-sub-1" }) },
    floorResolver: floorResolver(),
    conversation: snapshotReader(),
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

function floorResolver() {
  return { resolve: async () => floor("floor_v1") };
}

function floor(version) {
  return {
    version,
    documents: {
      SOUL: "soul",
      AGENTS: "agents",
      BOOTSTRAP: "bootstrap",
      HEARTBEAT: "heartbeat",
    },
    langfusePrompts: [],
  };
}
