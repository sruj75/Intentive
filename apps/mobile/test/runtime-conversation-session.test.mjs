import assert from "node:assert/strict";
import test from "node:test";

import {
  createRuntimeConversationSession,
  projectPhase,
  projectTimeline,
} from "../dist/domains/chat/runtime/runtime-conversation-session.js";

const at = "2026-06-12T00:00:00.000Z";

test("projectTimeline shows the ready scaffold only when there are zero messages", () => {
  const empty = projectTimeline({
    messages: [],
    beforeCursor: null,
    agentState: "available",
    connectionState: "connected",
    error: null,
  });
  assert.deepEqual(
    empty.map((item) => item.kind),
    ["capability_card", "suggestion_group"],
  );
});

test("projectTimeline projects only server-truth rows once a message exists", () => {
  const timeline = projectTimeline({
    messages: [
      { id: "c1", author: "companion", body: "hello", at, viaPostMessageBack: false },
      { id: "u1", author: "user", body: "hi back", at, delivery: "confirmed" },
    ],
    beforeCursor: null,
    agentState: "available",
    connectionState: "connected",
    error: null,
  });
  // The scaffold (capability_card + suggestion_group) drops as soon as any
  // user, historical, or Companion message exists.
  assert.deepEqual(
    timeline.map((item) => item.kind),
    ["companion_message", "user_message"],
  );
  assert.equal(timeline.at(-2).text, "hello");
  assert.equal(timeline.at(-1).text, "hi back");
  assert.equal(timeline.at(-1).delivery, "confirmed");
});

test("projectTimeline preserves outbound delivery state for pending and failed rows", () => {
  const base = {
    beforeCursor: null,
    agentState: "available",
    connectionState: "connected",
    error: null,
  };
  const pending = projectTimeline({
    ...base,
    messages: [{ id: "u1", author: "user", body: "send me", at, delivery: "pending" }],
  });
  const failed = projectTimeline({
    ...base,
    messages: [{ id: "u1", author: "user", body: "send me", at, delivery: "failed" }],
  });

  assert.equal(pending.at(-1).delivery, "pending");
  assert.equal(failed.at(-1).delivery, "failed");
});

test("projectTimeline appends the thinking activity while the Agent State is thinking", () => {
  const timeline = projectTimeline({
    messages: [{ id: "u1", author: "user", body: "hi", at, delivery: "pending" }],
    beforeCursor: null,
    agentState: "thinking",
    connectionState: "connected",
    error: null,
  });
  assert.deepEqual(timeline.at(-1), { id: "activity-live", kind: "activity", phase: "thinking" });
});

test("projectPhase follows the Agent State then the latest message", () => {
  const base = { beforeCursor: null, connectionState: "connected", error: null };
  assert.equal(projectPhase({ ...base, messages: [], agentState: "available" }), "idle");
  assert.equal(
    projectPhase({
      ...base,
      messages: [{ id: "u1", author: "user", body: "hi", at, delivery: "pending" }],
      agentState: "thinking",
    }),
    "thinking",
  );
  assert.equal(
    projectPhase({
      ...base,
      messages: [{ id: "c1", author: "companion", body: "hey", at, viaPostMessageBack: false }],
      agentState: "available",
    }),
    "replied",
  );
});

test("session opens the connection, projects the hello_ok snapshot, and notifies", async () => {
  const harness = createHarness();
  const session = createRuntimeConversationSession(harness.deps);

  let notifications = 0;
  session.subscribe(() => (notifications += 1));

  await harness.flush();
  harness.sockets[0].open();
  harness.sockets[0].message({
    type: "hello_ok",
    session_snapshot: {
      messages: [
        {
          message_id: "opening",
          author: "companion",
          body: "Welcome",
          at,
          via_post_message_back: false,
        },
      ],
      before_cursor: null,
    },
  });

  const snapshot = session.getSnapshot();
  // A companion message exists, so the scaffold is dropped: only the
  // server-truth companion row projects.
  assert.deepEqual(
    snapshot.timeline.map((item) => item.kind),
    ["companion_message"],
  );
  assert.equal(snapshot.timeline.at(-1).text, "Welcome");
  assert.equal(snapshot.phase, "replied");
  assert.ok(notifications > 0, "expected at least one subscriber notification");

  session.dispose();
});

test("send emits a user_message frame and dispose closes the socket", async () => {
  const harness = createHarness();
  const session = createRuntimeConversationSession(harness.deps);
  await harness.flush();
  harness.sockets[0].open();
  harness.sockets[0].message(emptySnapshot());

  session.send(" hello ");
  const lastFrame = JSON.parse(harness.sockets[0].sent.at(-1));
  assert.equal(lastFrame.type, "user_message");
  assert.equal(lastFrame.body, "hello");
  assert.equal(session.getSnapshot().phase, "thinking");
  assert.equal(session.getSnapshot().timeline.at(-1).kind, "activity");

  session.dispose();
  assert.equal(harness.sockets[0].closed, true);
});

test("getSnapshot returns a stable reference until the adapter changes", async () => {
  const harness = createHarness();
  const session = createRuntimeConversationSession(harness.deps);
  await harness.flush();
  harness.sockets[0].open();
  harness.sockets[0].message(emptySnapshot());

  const first = session.getSnapshot();
  assert.equal(session.getSnapshot(), first, "no change ⇒ same reference");

  harness.sockets[0].message({
    type: "companion_message",
    message_id: "c1",
    body: "reply",
    emitted_at: at,
    via_post_message_back: false,
  });
  assert.notEqual(session.getSnapshot(), first, "adapter change ⇒ new reference");

  session.dispose();
});

test("session projects a terminal connection error and reconnects on retry", async () => {
  const harness = createHarness();
  const session = createRuntimeConversationSession(harness.deps);
  await harness.flush();
  harness.sockets[0].open();
  harness.sockets[0].message(emptySnapshot());

  harness.sockets[0].error(new Error("offline"));
  assert.equal(session.getSnapshot().connectionState, "error");
  assert.deepEqual(session.getSnapshot().error, {
    kind: "network",
    message: "Companion Chat connection failed.",
  });

  session.retryConnection();
  await harness.flush();
  assert.equal(harness.sockets.length, 2);
  assert.equal(session.getSnapshot().connectionState, "connecting");

  session.dispose();
});

test("retryUserMessage restores the failed row and reconnects with the same message id", async () => {
  const harness = createHarness();
  const session = createRuntimeConversationSession(harness.deps);
  await harness.flush();
  harness.sockets[0].open();
  harness.sockets[0].message(emptySnapshot());

  session.send("hello");
  harness.sockets[0].error(new Error("offline"));
  assert.equal(session.getSnapshot().timeline.at(-1).delivery, "failed");

  session.retryUserMessage("id-1");
  assert.equal(
    session.getSnapshot().timeline.find((item) => item.id === "id-1").delivery,
    "pending",
  );
  await harness.flush();
  harness.sockets[1].open();
  harness.sockets[1].message(emptySnapshot());

  const retried = JSON.parse(harness.sockets[1].sent.at(-1));
  assert.equal(retried.type, "user_message");
  assert.equal(retried.message_id, "id-1");

  session.dispose();
});

function createHarness() {
  const sockets = [];
  let ids = 0;
  const deps = {
    baseUrl: "https://control.example",
    getUserJwt: async () => "user-jwt",
    fetch: async () => okRoutingResponse(),
    createWebSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    clientVersion: "test-version",
    resolveTimeZone: () => "America/New_York",
    now: () => at,
    id: () => `id-${++ids}`,
    schedule: (fn) => {
      const timer = { fn, cancelled: false };
      return { cancel: () => (timer.cancelled = true) };
    },
    backoffMs: [1, 1, 1],
  };
  return { deps, sockets, flush: () => new Promise((resolve) => setTimeout(resolve, 0)) };
}

class FakeSocket {
  constructor(url) {
    this.url = url;
  }

  onopen = null;
  onmessage = null;
  onerror = null;
  onclose = null;
  sent = [];
  closed = false;

  send(data) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
  }

  open() {
    this.onopen?.();
  }

  message(frame) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  error(value) {
    this.onerror?.(value);
  }
}

function emptySnapshot() {
  return { type: "hello_ok", session_snapshot: { messages: [], before_cursor: null } };
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function okRoutingResponse(wsUrl = "wss://runtime.example/session", runtimeJwt = "runtime-jwt") {
  return response(200, {
    agent_instance_id: "agent-1",
    ws_url: wsUrl,
    runtime_jwt: runtimeJwt,
  });
}
