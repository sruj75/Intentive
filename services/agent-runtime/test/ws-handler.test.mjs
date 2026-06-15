import assert from "node:assert/strict";
import test from "node:test";

import { WebSocket, WebSocketServer } from "ws";

import {
  attachGatewayWebSocketHandler,
  createConnectHandler,
  createPostConnectRouter,
} from "../dist/index.js";

const emptyConversation = {
  readSnapshot: async () => ({ messages: [], before_cursor: null }),
};

test("a real WebSocket connection receives hello_ok after connect", async () => {
  const server = new WebSocketServer({ port: 0 });
  const connectHandler = createConnectHandler({
    sessions: sessionRegistry("agent_instance_1"),
    verifier: { verify: async () => ({ user_id: "user_1" }) },
    floorResolver: floorResolver(),
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
    floorResolver: floorResolver(),
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
              pinnedFloor: floor("floor_v1"),
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
    floorResolver: floorResolver(),
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

test("malformed post-handshake events return invalid_connect without closing the socket", async () => {
  const server = new WebSocketServer({ port: 0 });
  let seenEvent;
  const connectHandler = createConnectHandler({
    sessions: sessionRegistry("agent_instance_1"),
    verifier: { verify: async () => ({ user_id: "user_1" }) },
    floorResolver: floorResolver(),
    conversation: emptyConversation,
  });

  server.on("connection", (socket) => {
    attachGatewayWebSocketHandler(socket, connectHandler, (_session, event) => {
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
        type: "history_backfill_request",
        before_cursor: "not-a-seq",
      }),
    );

    const raw = await new Promise((resolve) => client.once("message", resolve));
    assert.deepEqual(JSON.parse(raw.toString()), {
      type: "runtime_error",
      code: "invalid_connect",
      message: "WebSocket event is invalid for this connection state.",
    });
    assert.equal(client.readyState, WebSocket.OPEN);

    client.send(
      JSON.stringify({
        type: "presence_update",
        foreground: true,
      }),
    );

    await waitFor(() => seenEvent?.type === "presence_update");
    assert.deepEqual(seenEvent, { type: "presence_update", foreground: true });
  } finally {
    client.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("History Backfill read failures send the history error and keep the socket open", async () => {
  const server = new WebSocketServer({ port: 0 });
  let seenEvent;
  const connectHandler = createConnectHandler({
    sessions: sessionRegistry("agent_instance_1"),
    verifier: { verify: async () => ({ user_id: "user_1" }) },
    floorResolver: floorResolver(),
    conversation: emptyConversation,
  });

  const route = createPostConnectRouter({
    channel: {
      accept: async (_session, event) => {
        seenEvent = event;
      },
      readSnapshot: async () => {
        throw new Error("conversation reader unavailable");
      },
    },
  });

  server.on("connection", (socket) => {
    attachGatewayWebSocketHandler(socket, connectHandler, route);
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
        type: "history_backfill_request",
        before_cursor: "53",
      }),
    );

    const raw = await new Promise((resolve) => client.once("message", resolve));
    assert.deepEqual(JSON.parse(raw.toString()), {
      type: "runtime_error",
      code: "service_unavailable",
      message: "Conversation history is temporarily unavailable.",
    });
    assert.equal(client.readyState, WebSocket.OPEN);

    client.send(
      JSON.stringify({
        type: "user_message",
        message_id: "message_1",
        body: "hello",
        sent_at: "2026-06-09T00:00:00.000Z",
      }),
    );

    await waitFor(() => seenEvent?.type === "user_message");
    assert.equal(seenEvent.message_id, "message_1");
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

async function waitFor(predicate) {
  for (let i = 0; i < 20; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.equal(predicate(), true);
}
