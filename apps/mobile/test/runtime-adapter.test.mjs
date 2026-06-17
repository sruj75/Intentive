import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeAdapter } from "../dist/domains/chat/runtime/runtime-adapter.js";

const at = "2026-06-12T00:00:00.000Z";

test("connect sends the Protocol connect frame and hello_ok seeds the store", async () => {
  const harness = createHarness();
  await harness.adapter.connect();

  harness.sockets[0].open();
  const connectFrame = JSON.parse(harness.sockets[0].sent[0]);
  assert.deepEqual(connectFrame, {
    type: "connect",
    auth_token: "runtime-jwt",
    client_kind: "mobile",
    client_version: "test-version",
    client_tz: "America/New_York",
  });
  // The reported zone must be a real IANA zone the Runtime can resolve.
  assert.doesNotThrow(() => new Intl.DateTimeFormat("en-US", { timeZone: connectFrame.client_tz }));

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

test("empty hello_ok snapshot connects with no client-authored opening message", async () => {
  const harness = createHarness();
  await harness.adapter.connect();

  harness.sockets[0].open();
  harness.sockets[0].message(emptySnapshot());

  assert.equal(harness.adapter.getState().connectionState, "connected");
  assert.equal(harness.adapter.getState().messages.length, 0);
  assert.equal(harness.adapter.getState().beforeCursor, null);
  assert.equal(harness.adapter.getState().agentState, "available");
});

test("connect omits client_tz when the platform cannot resolve a zone", async () => {
  const harness = createHarness({ resolveTimeZone: () => undefined });
  await harness.adapter.connect();

  harness.sockets[0].open();
  const connectFrame = JSON.parse(harness.sockets[0].sent[0]);
  assert.equal("client_tz" in connectFrame, false);
});

test("malformed hello_ok rejects at the Protocol boundary without replacing the store", async () => {
  const harness = createHarness();
  await harness.adapter.connect();
  harness.sockets[0].open();
  harness.sockets[0].message(snapshot("opening"));

  const before = harness.adapter.getState().messages;
  harness.sockets[0].messageRaw(
    JSON.stringify({
      type: "hello_ok",
      session_snapshot: {
        messages: [
          {
            message_id: "invalid",
            author: "companion",
            body: "invalid snapshot",
            at: "not-a-date",
            via_post_message_back: false,
          },
        ],
        before_cursor: null,
      },
    }),
  );

  assert.equal(harness.adapter.getState().connectionState, "error");
  assert.equal(harness.adapter.getState().error.kind, "protocol");
  assert.equal(harness.adapter.getState().messages, before);
  assert.deepEqual(
    harness.adapter.getState().messages.map((message) => message.id),
    ["opening"],
  );
});

test("inbound companion_message appends and sends delivery_ack", async () => {
  const harness = createHarness();
  await harness.adapter.connect();
  harness.sockets[0].open();
  harness.sockets[0].message(emptySnapshot());

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
  harness.sockets[0].message(emptySnapshot());

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

test("sendUserMessage during routing queues one frame and flushes after hello_ok", async () => {
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
    ["connect"],
  );
  harness.sockets[0].message(emptySnapshot());

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

test("sendUserMessage during connecting queues one frame and flushes after hello_ok", async () => {
  const harness = createHarness();
  await harness.adapter.connect();

  await harness.adapter.sendUserMessage(" hello ");
  assert.equal(harness.adapter.getState().connectionState, "connecting");
  assert.equal(harness.sockets[0].sent.length, 0);

  harness.sockets[0].open();

  assert.deepEqual(
    harness.sockets[0].sent.map((frame) => JSON.parse(frame).type),
    ["connect"],
  );

  harness.sockets[0].message(emptySnapshot());

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
  assert.deepEqual(
    harness.sockets[0].sent.map((frame) => JSON.parse(frame).type),
    ["connect"],
  );

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
  assert.deepEqual(
    harness.sockets[0].sent.map((frame) => JSON.parse(frame).type),
    ["connect", "user_message"],
  );
});

test("sendUserMessage during retrying queues one frame and flushes after retry hello_ok", async () => {
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
    ["connect"],
  );
  harness.sockets[0].message(emptySnapshot());

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

test("retryUserMessage reuses the failed message id, body, and original sent_at", async () => {
  const harness = createHarness();
  await harness.adapter.connect();
  harness.sockets[0].open();
  harness.sockets[0].message(emptySnapshot());
  await harness.adapter.sendUserMessage(" hello ");

  harness.sockets[0].closeFromServer();
  assert.equal(harness.adapter.getState().messages[0].delivery, "failed");

  await harness.adapter.retryUserMessage("id-1");
  assert.equal(harness.adapter.getState().messages[0].delivery, "pending");
  assert.equal(harness.adapter.getState().messages[0].body, "hello");
  assert.equal(harness.adapter.getState().messages[0].at, at);

  harness.runNextTimer();
  await harness.flush();
  harness.sockets[1].open();
  harness.sockets[1].message(emptySnapshot());

  assert.deepEqual(JSON.parse(harness.sockets[1].sent.at(-1)), {
    type: "user_message",
    message_id: "id-1",
    body: "hello",
    sent_at: at,
  });
});

test("retry-confirmed message reconciles to one confirmed user row", async () => {
  const harness = createHarness();
  await harness.adapter.connect();
  harness.sockets[0].open();
  harness.sockets[0].message(emptySnapshot());
  await harness.adapter.sendUserMessage("hello");

  harness.sockets[0].closeFromServer();
  await harness.adapter.retryUserMessage("id-1");
  harness.runNextTimer();
  await harness.flush();
  harness.sockets[1].open();
  harness.sockets[1].message({
    type: "hello_ok",
    session_snapshot: {
      messages: [
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

  assert.equal(harness.adapter.getState().messages.length, 1);
  assert.equal(harness.adapter.getState().messages[0].id, "id-1");
  assert.equal(harness.adapter.getState().messages[0].delivery, "confirmed");
});

test("retryUserMessage leaves confirmed and unknown message ids unchanged", async () => {
  const harness = createHarness();
  await harness.adapter.connect();
  harness.sockets[0].open();
  harness.sockets[0].message({
    type: "hello_ok",
    session_snapshot: {
      messages: [
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

  await harness.adapter.retryUserMessage("id-1");
  await harness.adapter.retryUserMessage("missing");

  assert.equal(harness.adapter.getState().messages[0].delivery, "confirmed");
  assert.deepEqual(
    harness.sockets[0].sent.map((frame) => JSON.parse(frame).type),
    ["connect"],
  );
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

test("stale routing after reconnect cannot replace the fresh socket", async () => {
  const slowRoute = deferred();
  const fastRoute = deferred();
  const fetches = [slowRoute.promise, fastRoute.promise];
  const harness = createHarness({
    fetch: async () => fetches.shift(),
  });

  const staleConnect = harness.adapter.connect();
  harness.adapter.close();
  const freshConnect = harness.adapter.connect();

  fastRoute.resolve(okRoutingResponse("wss://runtime.example/fresh", "fresh-jwt"));
  await freshConnect;

  assert.equal(harness.sockets.length, 1);
  assert.equal(harness.sockets[0].url, "wss://runtime.example/fresh");
  harness.sockets[0].open();
  assert.equal(JSON.parse(harness.sockets[0].sent[0]).auth_token, "fresh-jwt");

  slowRoute.resolve(okRoutingResponse("wss://runtime.example/stale", "stale-jwt"));
  await staleConnect;

  assert.equal(harness.sockets.length, 1);
  assert.equal(harness.sockets[0].url, "wss://runtime.example/fresh");
  assert.deepEqual(
    harness.sockets[0].sent.map((frame) => JSON.parse(frame).auth_token).filter(Boolean),
    ["fresh-jwt"],
  );
});

test("stale routing after close creates no socket and leaves the adapter idle", async () => {
  const route = deferred();
  const harness = createHarness({
    fetch: async () => route.promise,
  });

  const connecting = harness.adapter.connect();
  harness.adapter.close();

  route.resolve(okRoutingResponse("wss://runtime.example/stale", "stale-jwt"));
  await connecting;

  assert.equal(harness.sockets.length, 0);
  assert.equal(harness.adapter.getState().connectionState, "idle");
});

test("stale routing failures after newer connect do not fail pending outbound", async () => {
  const staleRoute = deferred();
  const freshRoute = deferred();
  const fetches = [staleRoute.promise, freshRoute.promise];
  const harness = createHarness({
    fetch: async () => fetches.shift(),
  });

  const staleConnect = harness.adapter.connect();
  await harness.adapter.sendUserMessage("hello");
  const freshConnect = harness.adapter.connect();

  freshRoute.resolve(okRoutingResponse("wss://runtime.example/fresh", "fresh-jwt"));
  await freshConnect;
  harness.sockets[0].open();

  staleRoute.resolve(response(401, {}));
  await staleConnect;

  assert.equal(harness.adapter.getState().connectionState, "connecting");
  assert.equal(harness.adapter.getState().error, null);
  assert.equal(harness.adapter.getState().messages[0].delivery, "pending");
  assert.equal(harness.timers.length, 0);
  assert.deepEqual(
    harness.sockets[0].sent.map((frame) => JSON.parse(frame).type),
    ["connect"],
  );
});

test("stale retry timers after reconnect are ignored", async () => {
  const fetches = [
    response(503, {}),
    okRoutingResponse("wss://runtime.example/fresh", "fresh-jwt"),
  ];
  const harness = createHarness({
    fetch: async () => fetches.shift(),
  });

  await harness.adapter.connect();
  assert.equal(harness.adapter.getState().connectionState, "retrying");

  const freshConnect = harness.adapter.connect();
  await freshConnect;
  harness.sockets[0].open();

  harness.runNextTimer({ forceCancelled: true });
  await harness.flush();

  assert.equal(harness.sockets.length, 1);
  assert.equal(harness.sockets[0].url, "wss://runtime.example/fresh");
  assert.equal(JSON.parse(harness.sockets[0].sent[0]).auth_token, "fresh-jwt");
});

test("stale socket callbacks after reconnect cannot mutate state or flush the queue", async () => {
  let routeCount = 0;
  const harness = createHarness({
    fetch: async () => okRoutingResponse(`wss://runtime.example/${++routeCount}`, "jwt"),
  });

  await harness.adapter.connect();
  const staleSocket = harness.sockets[0];
  staleSocket.open();
  staleSocket.message(snapshot("stale-opening"));

  const freshConnect = harness.adapter.connect();
  await harness.adapter.sendUserMessage("hello");
  await freshConnect;

  staleSocket.message(snapshot("late-stale-opening"));
  staleSocket.errorFromSocket();
  staleSocket.closeFromServer();

  assert.equal(harness.adapter.getState().connectionState, "connecting");
  assert.equal(harness.adapter.getState().error, null);
  assert.deepEqual(
    harness.adapter.getState().messages.map((message) => message.id),
    ["stale-opening", "id-1"],
  );
  assert.deepEqual(
    staleSocket.sent.map((frame) => JSON.parse(frame).type),
    ["connect"],
  );
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

test("message typed after a connected socket drops is delivered on the next connection", async () => {
  const harness = createHarness();
  await harness.adapter.connect();
  harness.sockets[0].open();
  harness.sockets[0].message(emptySnapshot());

  harness.sockets[0].closeFromServer();
  assert.equal(harness.adapter.getState().connectionState, "retrying");

  await harness.adapter.sendUserMessage("hello");

  assert.deepEqual(
    harness.sockets[0].sent.map((frame) => JSON.parse(frame).type),
    ["connect"],
  );

  harness.runNextTimer();
  await harness.flush();
  harness.sockets[1].open();
  harness.sockets[1].message(emptySnapshot());

  assert.deepEqual(
    harness.sockets[1].sent.map((frame) => JSON.parse(frame).type),
    ["connect", "user_message"],
  );
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
    createWebSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    clientVersion: "test-version",
    resolveTimeZone:
      "resolveTimeZone" in options ? options.resolveTimeZone : () => "America/New_York",
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
    timers,
    runNextTimer(options = {}) {
      const timer = timers.shift();
      if (timer && (!timer.cancelled || options.forceCancelled)) timer.fn();
    },
    flush: () => new Promise((resolve) => setTimeout(resolve, 0)),
  };
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

function emptySnapshot() {
  return {
    type: "hello_ok",
    session_snapshot: {
      messages: [],
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

function okRoutingResponse(wsUrl = "wss://runtime.example/session", runtimeJwt = "runtime-jwt") {
  return response(200, {
    agent_instance_id: "agent-1",
    ws_url: wsUrl,
    runtime_jwt: runtimeJwt,
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}
