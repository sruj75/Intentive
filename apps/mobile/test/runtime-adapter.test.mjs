import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeAdapter } from "../dist/domains/chat/runtime/runtime-adapter.js";

const at = "2026-06-12T00:00:00.000Z";

test("connect sends the Protocol connect frame and hello_ok seeds the store", async () => {
  const harness = createHarness();
  await harness.adapter.connect();

  harness.sockets[0].open();
  assert.deepEqual(JSON.parse(harness.sockets[0].sent[0]), {
    type: "connect",
    auth_token: "runtime-jwt",
    client_kind: "mobile",
    client_version: "test-version",
  });

  harness.sockets[0].message({
    type: "hello_ok",
    session_snapshot: {
      messages: [
        {
          message_id: "opening",
          author: "companion",
          body: "hello",
          at,
          via_post_message_back: false,
        },
      ],
      before_cursor: null,
    },
  });

  assert.equal(harness.adapter.getState().connectionState, "connected");
  assert.equal(harness.adapter.getState().messages[0].body, "hello");
});

test("inbound companion_message appends and sends delivery_ack", async () => {
  const harness = createHarness();
  await harness.adapter.connect();
  harness.sockets[0].open();

  harness.sockets[0].message({
    type: "companion_message",
    message_id: "c1",
    body: "reply",
    emitted_at: at,
    via_post_message_back: false,
  });

  assert.equal(harness.adapter.getState().messages[0].id, "c1");
  assert.deepEqual(JSON.parse(harness.sockets[0].sent.at(-1)), {
    type: "delivery_ack",
    message_id: "c1",
  });
});

test("sendUserMessage shows pending immediately and emits user_message", async () => {
  const harness = createHarness();
  await harness.adapter.connect();
  harness.sockets[0].open();

  await harness.adapter.sendUserMessage(" hello ");

  assert.equal(harness.adapter.getState().messages[0].body, "hello");
  assert.equal(harness.adapter.getState().messages[0].delivery, "pending");
  assert.equal(harness.adapter.getState().agentState, "thinking");
  assert.deepEqual(JSON.parse(harness.sockets[0].sent.at(-1)), {
    type: "user_message",
    message_id: "id-1",
    body: "hello",
    sent_at: at,
  });
});

test("sendUserMessage during routing queues one frame and flushes after socket open", async () => {
  let resolveFetch;
  const fetchReady = new Promise((resolve) => {
    resolveFetch = resolve;
  });
  const harness = createHarness({
    fetch: async () => fetchReady,
  });

  const connecting = harness.adapter.connect();
  assert.equal(harness.adapter.getState().connectionState, "routing");

  await harness.adapter.sendUserMessage(" hello ");
  assert.equal(harness.adapter.getState().messages.length, 1);
  assert.equal(harness.sockets.length, 0);

  resolveFetch(okRoutingResponse());
  await connecting;

  assert.equal(harness.sockets[0].sent.length, 0);
  harness.sockets[0].open();

  assert.deepEqual(
    harness.sockets[0].sent.map((frame) => JSON.parse(frame).type),
    ["connect", "user_message"],
  );
  assert.deepEqual(JSON.parse(harness.sockets[0].sent[1]), {
    type: "user_message",
    message_id: "id-1",
    body: "hello",
    sent_at: at,
  });
});

test("sendUserMessage during connecting queues one frame and flushes after socket open", async () => {
  const harness = createHarness();
  await harness.adapter.connect();

  await harness.adapter.sendUserMessage(" hello ");
  assert.equal(harness.adapter.getState().connectionState, "connecting");
  assert.equal(harness.sockets[0].sent.length, 0);

  harness.sockets[0].open();

  assert.deepEqual(
    harness.sockets[0].sent.map((frame) => JSON.parse(frame).type),
    ["connect", "user_message"],
  );
});

test("sendUserMessage during connecting keeps hello_ok server order authoritative", async () => {
  const harness = createHarness();
  await harness.adapter.connect();

  await harness.adapter.sendUserMessage(" hello ");
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

  assert.deepEqual(
    harness.adapter
      .getState()
      .messages.map((message) => `${message.id}:${message.delivery ?? "server"}`),
    ["opening:server", "id-1:pending"],
  );
});

test("sendUserMessage during retrying queues one frame and flushes after retry opens", async () => {
  const fetches = [response(503, {}), okRoutingResponse()];
  const harness = createHarness({
    fetch: async () => fetches.shift(),
  });

  await harness.adapter.connect();
  assert.equal(harness.adapter.getState().connectionState, "retrying");

  await harness.adapter.sendUserMessage(" hello ");
  assert.equal(harness.sockets.length, 0);

  harness.runNextTimer();
  await harness.flush();
  harness.sockets[0].open();

  assert.deepEqual(
    harness.sockets[0].sent.map((frame) => JSON.parse(frame).type),
    ["connect", "user_message"],
  );
});

test("queued outbound keeps message_id and reconciles when snapshot confirms it", async () => {
  const harness = createHarness();
  await harness.adapter.connect();
  await harness.adapter.sendUserMessage(" hello ");

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
        {
          message_id: "id-1",
          author: "user",
          body: "hello",
          at,
          via_post_message_back: false,
        },
      ],
      before_cursor: null,
    },
  });

  assert.deepEqual(
    harness.adapter.getState().messages.map((message) => message.id),
    ["opening", "id-1"],
  );
  assert.equal(harness.adapter.getState().messages[1].delivery, "confirmed");
});

test("terminal socket and Protocol errors mark pending outbound failed", async () => {
  for (const fail of [
    (socket) => socket.errorFromSocket(),
    (socket) => socket.messageRaw("{not json"),
    (socket) => socket.message({ type: "runtime_error", message: "runtime exploded" }),
  ]) {
    const harness = createHarness();
    await harness.adapter.connect();
    harness.sockets[0].open();
    await harness.adapter.sendUserMessage("hello");

    fail(harness.sockets[0]);

    assert.equal(harness.adapter.getState().connectionState, "error");
    assert.equal(harness.adapter.getState().messages[0].delivery, "failed");
  }
});

test("reauth, gate, and routing cap exhaustion mark queued outbound failed", async () => {
  for (const fetch of [
    async () => response(401, {}),
    async () => response(403, {}),
    async () => response(503, {}),
  ]) {
    const harness = createHarness({ fetch, maxRoutingRetries: 0 });

    await harness.adapter.sendUserMessage("hello");
    await harness.adapter.connect();

    assert.equal(harness.adapter.getState().connectionState, "error");
    assert.equal(harness.adapter.getState().messages[0].delivery, "failed");
  }
});

test("thrown routing failures retry to the cap and do not stay stuck routing", async () => {
  const harness = createHarness({
    fetch: async () => {
      throw new Error("fetch failed");
    },
    maxRoutingRetries: 1,
  });

  await harness.adapter.connect();
  assert.equal(harness.adapter.getState().connectionState, "retrying");

  harness.runNextTimer();
  await harness.flush();

  assert.equal(harness.adapter.getState().connectionState, "error");
  assert.equal(harness.adapter.getState().error.kind, "routing-unavailable");
});

test("close does not mark pending outbound failed", async () => {
  const harness = createHarness();
  await harness.adapter.connect();
  await harness.adapter.sendUserMessage("hello");

  harness.adapter.close();

  assert.equal(harness.adapter.getState().connectionState, "idle");
  assert.equal(harness.adapter.getState().messages[0].delivery, "pending");
});

test("socket drop retries routing and a duplicate snapshot does not double the opening", async () => {
  const harness = createHarness();
  await harness.adapter.connect();
  harness.sockets[0].open();
  harness.sockets[0].message(snapshot("opening"));

  harness.sockets[0].closeFromServer();
  assert.equal(harness.adapter.getState().connectionState, "retrying");
  harness.runNextTimer();
  await harness.flush();

  harness.sockets[1].open();
  harness.sockets[1].message(snapshot("opening"));

  assert.equal(harness.adapter.getState().messages.length, 1);
  assert.equal(harness.adapter.getState().messages[0].id, "opening");
});

test("503 routing retries to the cap and then surfaces an error", async () => {
  const harness = createHarness({
    fetch: async () => response(503, {}),
    maxRoutingRetries: 2,
  });

  await harness.adapter.connect();
  assert.equal(harness.adapter.getState().connectionState, "retrying");

  harness.runNextTimer();
  await harness.flush();
  assert.equal(harness.adapter.getState().connectionState, "retrying");

  harness.runNextTimer();
  await harness.flush();
  assert.equal(harness.adapter.getState().connectionState, "error");
  assert.equal(harness.adapter.getState().error.kind, "routing-unavailable");
});

function createHarness(options = {}) {
  const sockets = [];
  const timers = [];
  let ids = 0;
  const adapter = createRuntimeAdapter({
    baseUrl: "https://control.example",
    getUserJwt: async () => "user-jwt",
    fetch: options.fetch ?? (async () => okRoutingResponse()),
    createWebSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    clientVersion: "test-version",
    now: () => at,
    id: () => `id-${++ids}`,
    schedule: (fn) => {
      const timer = { fn, cancelled: false };
      timers.push(timer);
      return { cancel: () => (timer.cancelled = true) };
    },
    backoffMs: [1, 1, 1],
    maxRoutingRetries: options.maxRoutingRetries,
  });

  return {
    adapter,
    sockets,
    runNextTimer() {
      const timer = timers.shift();
      if (timer && !timer.cancelled) timer.fn();
    },
    flush: () => new Promise((resolve) => setTimeout(resolve, 0)),
  };
}

class FakeSocket {
  onopen = null;
  onmessage = null;
  onerror = null;
  onclose = null;
  sent = [];

  send(data) {
    this.sent.push(data);
  }

  close() {}

  open() {
    this.onopen?.();
  }

  message(frame) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  messageRaw(data) {
    this.onmessage?.({ data });
  }

  errorFromSocket() {
    this.onerror?.({});
  }

  closeFromServer() {
    this.onclose?.();
  }
}

function snapshot(id) {
  return {
    type: "hello_ok",
    session_snapshot: {
      messages: [
        {
          message_id: id,
          author: "companion",
          body: "hello",
          at,
          via_post_message_back: false,
        },
      ],
      before_cursor: null,
    },
  };
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

function okRoutingResponse() {
  return response(200, {
    agent_instance_id: "agent-1",
    ws_url: "wss://runtime.example/session",
    runtime_jwt: "runtime-jwt",
  });
}
