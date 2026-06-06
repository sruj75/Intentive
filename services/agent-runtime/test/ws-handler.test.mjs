import assert from "node:assert/strict";
import test from "node:test";

import { WebSocket, WebSocketServer } from "ws";

import { attachGatewayWebSocketHandler, createConnectHandler } from "../dist/index.js";

test("a real WebSocket connection receives hello_ok after connect", async () => {
  const server = new WebSocketServer({ port: 0 });
  const connectHandler = createConnectHandler({
    verifier: { verify: async () => ({ user_id: "user_1" }) },
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
  let seenEvent;
  const connectHandler = createConnectHandler({
    verifier: {
      verify: async () => {
        verifierCalls += 1;
        return { user_id: "user_1" };
      },
    },
  });

  server.on("connection", (socket) => {
    attachGatewayWebSocketHandler(socket, connectHandler, (event) => {
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
