import assert from "node:assert/strict";
import test from "node:test";

import { WebSocket, WebSocketServer } from "ws";

import { attachGatewayWebSocketHandler, createConnectHandler } from "../dist/index.js";

const emptyConversation = {
  readSnapshot: async () => ({ messages: [], before_cursor: null }),
};

test("a real WebSocket connection receives hello_ok after connect", async () => {
  const server = new WebSocketServer({ port: 0 });
  const connectHandler = createConnectHandler({
    sessions: sessionRegistry("agent_instance_1"),
    verifier: { verify: async () => ({ user_id: "user_1" }) },
    conversation: emptyConversation,
  });

  server.on("connection", (socket) => {
    attachGatewayWebSocketHandler(socket, connectHandler);
  });

  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.notEqual(address, null);

  const client = new WebSocket(`ws://127.0.0.1:${address.port}`);
  try {
    await new Promise((resolve) => client.once("open", resolve));
    client.send(
      JSON.stringify({
        type: "connect",
        auth_token: "jwt_1",
        client_kind: "mobile",
        client_version: "1.0.0",
      }),
    );

    const raw = await new Promise((resolve) => client.once("message", resolve));
    assert.deepEqual(JSON.parse(raw.toString()), {
      type: "hello_ok",
      session_snapshot: { messages: [], before_cursor: null },
    });
  } finally {
    client.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("post-handshake client events are parsed and delegated without re-running connect", async () => {
  const server = new WebSocketServer({ port: 0 });
  let verifierCalls = 0;
  let seenSession;
  let seenEvent;
  const connectHandler = createConnectHandler({
    sessions: sessionRegistry("agent_instance_1"),
    verifier: {
      verify: async () => {
        verifierCalls += 1;
        return { user_id: "user_1" };
      },
    },
    conversation: emptyConversation,
  });

  server.on("connection", (socket) => {
    attachGatewayWebSocketHandler(socket, connectHandler, (session, event) => {
      seenSession = session;
      seenEvent = event;
    });
  });

  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.notEqual(address, null);

  const client = new WebSocket(`ws://127.0.0.1:${address.port}`);
  try {
    await new Promise((resolve) => client.once("open", resolve));
    client.send(
      JSON.stringify({
        type: "connect",
        auth_token: "jwt_1",
        client_kind: "mobile",
        client_version: "1.0.0",
      }),
    );
    await new Promise((resolve) => client.once("message", resolve));

    client.send(
      JSON.stringify({
        type: "presence_update",
        foreground: true,
      }),
    );

    await assert.doesNotReject(
      new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            assert.deepEqual(seenSession, {
              userId: "user_1",
              clientKind: "mobile",
              agentInstanceId: "agent_instance_1",
            });
            assert.deepEqual(seenEvent, { type: "presence_update", foreground: true });
            assert.equal(verifierCalls, 1);
            resolve();
          } catch (error) {
            reject(error);
          }
        }, 10);
      }),
    );
  } finally {
    client.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("post-handshake async handler failures are sent as runtime_error frames", async () => {
  const server = new WebSocketServer({ port: 0 });
  const connectHandler = createConnectHandler({
    sessions: sessionRegistry("agent_instance_1"),
    verifier: { verify: async () => ({ user_id: "user_1" }) },
    conversation: emptyConversation,
  });

  server.on("connection", (socket) => {
    attachGatewayWebSocketHandler(socket, connectHandler, async () => {
      throw new Error("ledger unavailable");
    });
  });

  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.notEqual(address, null);

  const client = new WebSocket(`ws://127.0.0.1:${address.port}`);
  try {
    await new Promise((resolve) => client.once("open", resolve));
    client.send(
      JSON.stringify({
        type: "connect",
        auth_token: "jwt_1",
        client_kind: "mobile",
        client_version: "1.0.0",
      }),
    );
    await new Promise((resolve) => client.once("message", resolve));

    client.send(
      JSON.stringify({
        type: "user_message",
        message_id: "message_1",
        body: "hello",
        sent_at: "2026-06-09T00:00:00.000Z",
      }),
    );

    const raw = await new Promise((resolve) => client.once("message", resolve));
    assert.deepEqual(JSON.parse(raw.toString()), {
      type: "runtime_error",
      code: "service_unavailable",
      message: "WebSocket event could not be processed.",
    });
  } finally {
    client.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

function sessionRegistry(agentInstanceId) {
  return {
    loadSessionByAuthSubject: async ({ authSubject, clientKind }) => ({
      userId: authSubject,
      clientKind,
      agentInstanceId,
    }),
  };
}
