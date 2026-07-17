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

test("durable ingress is acknowledged with its stable id after the channel commits", async () => {
  const accepted = [];
  const route = createPostConnectRouter({
    channel: {
      accept: async (s, event) => {
        accepted.push(event.type);
      },
      readSnapshot: async () => ({ messages: [], before_cursor: null }),
    },
  });

  const perceptionEvent = {
    type: "perception_event",
    event_id: "0b8c6d2e-1f4a-4c3b-9a7d-2e5f6a7b8c9d",
    source_client: "desktop",
    captured_at: "2026-06-10T00:00:00.000Z",
    period_start: "2026-06-09T23:59:00.000Z",
    period_end: "2026-06-10T00:00:00.000Z",
    artifact_type: "activity_summary",
    summary: "s",
    signals: {},
    sensitivity_label: "normal",
    retention_class: "screen_memory_30d",
    confidence: 0.9,
    expires_at: "2026-07-10T00:00:00.000Z",
    local_record_ref: "7c4d9f10-3a2b-4e5c-8d6f-1a2b3c4d5e6f",
  };
  assert.deepEqual(await route(session, perceptionEvent), {
    type: "runtime_ingress_ack",
    ingress_kind: "perception_event",
    ingress_id: "0b8c6d2e-1f4a-4c3b-9a7d-2e5f6a7b8c9d",
  });

  const tombstone = {
    type: "perception_tombstone",
    tombstone_id: "5f9a1b2c-3d4e-4f5a-9b8c-7d6e5f4a3b2c",
    reason: "manual_delete",
    event_refs: ["0b8c6d2e-1f4a-4c3b-9a7d-2e5f6a7b8c9d"],
    emitted_at: "2026-06-10T00:01:00.000Z",
  };
  assert.deepEqual(await route(session, tombstone), {
    type: "runtime_ingress_ack",
    ingress_kind: "perception_tombstone",
    ingress_id: "5f9a1b2c-3d4e-4f5a-9b8c-7d6e5f4a3b2c",
  });

  const marker = {
    type: "session_end_marker",
    marker_id: "3e2d1c0b-9a8f-4e7d-8c6b-5a4f3e2d1c0b",
    session_id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    ended_at: "2026-06-10T00:02:00.000Z",
    reason: "quit",
  };
  assert.deepEqual(await route(session, marker), {
    type: "runtime_ingress_ack",
    ingress_kind: "session_end_marker",
    ingress_id: "3e2d1c0b-9a8f-4e7d-8c6b-5a4f3e2d1c0b",
  });

  assert.deepEqual(accepted, ["perception_event", "perception_tombstone", "session_end_marker"]);
});

test("a failed channel commit rejects and is never acknowledged", async () => {
  const route = createPostConnectRouter({
    channel: {
      accept: async () => {
        throw new Error("transaction failed");
      },
      readSnapshot: async () => ({ messages: [], before_cursor: null }),
    },
  });

  await assert.rejects(
    () =>
      route(session, {
        type: "session_end_marker",
        marker_id: "3e2d1c0b-9a8f-4e7d-8c6b-5a4f3e2d1c0b",
        session_id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
        ended_at: "2026-06-10T00:02:00.000Z",
        reason: "quit",
      }),
    /transaction failed/,
  );
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
