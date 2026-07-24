import assert from "node:assert/strict";
import test from "node:test";

import { createPostConnectRouter } from "../dist/index.js";

const session = {
  userId: "00000000-0000-4000-8000-000000000001",
  clientKind: "mobile",
  agentInstanceId: "agent_instance_1",
  pinnedFloor: {
    version: "floor_v1",
    documents: {
      SOUL: "soul",
      AGENTS: "agents",
      BOOTSTRAP: "bootstrap",
      HEARTBEAT: "heartbeat",
    },
    langfusePrompts: [],
  },
};

test("a History Backfill request is a read: it calls the channel reader and returns a snapshot response", async () => {
  let acceptCalls = 0;
  const readArgs = [];
  const snapshot = { messages: [], before_cursor: "3" };

  const route = createPostConnectRouter({
    channel: {
      accept: async () => {
        acceptCalls += 1;
      },
      readSnapshot: async (userId, before, limit) => {
        readArgs.push([userId, before, limit]);
        return snapshot;
      },
    },
  });

  const response = await route(session, {
    type: "history_backfill_request",
    before_cursor: "53",
    limit: 25,
  });

  // The request never touches the write path.
  assert.equal(acceptCalls, 0);
  // It reads the older page for this User with the given cursor and limit.
  assert.deepEqual(readArgs, [[session.userId, "53", 25]]);
  // And replies with the snapshot wrapped in a backfill response frame.
  assert.deepEqual(response, {
    type: "history_backfill_response",
    session_snapshot: snapshot,
  });
});

test("a History Backfill read failure returns the history-unavailable error and never writes", async () => {
  let acceptCalls = 0;

  const route = createPostConnectRouter({
    channel: {
      accept: async () => {
        acceptCalls += 1;
      },
      readSnapshot: async () => {
        throw new Error("conversation reader unavailable");
      },
    },
  });

  const response = await route(session, {
    type: "history_backfill_request",
    before_cursor: "53",
  });

  assert.equal(acceptCalls, 0);
  assert.deepEqual(response, {
    type: "runtime_error",
    code: "service_unavailable",
    message: "Conversation history is temporarily unavailable.",
  });
});

test("a state-mutating event is accepted by the channel and produces no direct reply", async () => {
  let readCalls = 0;
  const accepted = [];

  const route = createPostConnectRouter({
    channel: {
      accept: async (s, event) => {
        accepted.push([s, event]);
      },
      readSnapshot: async () => {
        readCalls += 1;
        return { messages: [], before_cursor: null };
      },
    },
  });

  const userMessage = {
    type: "user_message",
    message_id: "m1",
    body: "hello",
    sent_at: "2026-06-10T00:00:00.000Z",
  };
  const response = await route(session, userMessage);

  // The write path owns it; the read path is untouched; nothing is sent straight back.
  assert.equal(readCalls, 0);
  assert.deepEqual(accepted, [[session, userMessage]]);
  assert.equal(response, undefined);
});

test("presence_update updates the connection foreground state and produces no direct reply", async () => {
  let acceptCalls = 0;
  let readCalls = 0;
  const foreground = [];

  const route = createPostConnectRouter({
    channel: {
      accept: async () => {
        acceptCalls += 1;
      },
      readSnapshot: async () => {
        readCalls += 1;
        return { messages: [], before_cursor: null };
      },
    },
  });

  const response = await route(session, { type: "presence_update", foreground: true });

  assert.equal(acceptCalls, 0);
  assert.equal(readCalls, 0);
  assert.deepEqual(foreground, []);
  assert.equal(response, undefined);

  await route(
    session,
    { type: "presence_update", foreground: false },
    {
      setForeground: (value) => foreground.push(value),
      unregister: () => {},
    },
  );
  assert.deepEqual(foreground, [false]);
});

test("delivery_ack is accepted as a no-op and unknown events are rejected explicitly", async () => {
  let acceptCalls = 0;
  let readCalls = 0;

  const route = createPostConnectRouter({
    channel: {
      accept: async () => {
        acceptCalls += 1;
      },
      readSnapshot: async () => {
        readCalls += 1;
        return { messages: [], before_cursor: null };
      },
    },
  });

  assert.equal(await route(session, { type: "delivery_ack", message_id: "m1" }), undefined);

  const response = await route(session, { type: "unknown_event" });

  assert.equal(acceptCalls, 0);
  assert.equal(readCalls, 0);
  assert.deepEqual(response, {
    type: "runtime_error",
    code: "invalid_connect",
    message: "Event type is not supported on an active connection.",
  });
});
