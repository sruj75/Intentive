import assert from "node:assert/strict";
import test from "node:test";

import { createConnectionRegistry } from "../dist/index.js";

test("connection registry registers, sends by predicate, updates foreground, and unregisters", () => {
  const sent = [];
  const registry = createConnectionRegistry();
  const handle = registry.register(session("mobile"), {
    send: (frame) => sent.push(JSON.parse(frame)),
  });

  assert.deepEqual(
    registry.send(
      "00000000-0000-4000-8000-000000000001",
      (connection) => connection.clientKind === "mobile" && connection.foreground,
      event("m1"),
    ),
    ["mobile"],
  );
  assert.equal(sent[0].message_id, "m1");

  handle.setForeground(false);
  assert.deepEqual(
    registry.send(
      "00000000-0000-4000-8000-000000000001",
      (connection) => connection.clientKind === "mobile" && connection.foreground,
      event("m2"),
    ),
    [],
  );

  handle.unregister();
  assert.deepEqual(
    registry.send("00000000-0000-4000-8000-000000000001", () => true, event("m3")),
    [],
  );
});

test("connection registry only sends to matching chat-capable connections", () => {
  const mobile = [];
  const desktop = [];
  const registry = createConnectionRegistry();
  registry.register(session("mobile"), { send: (frame) => mobile.push(JSON.parse(frame)) });
  registry.register(session("desktop"), { send: (frame) => desktop.push(JSON.parse(frame)) });

  const delivered = registry.send(
    "00000000-0000-4000-8000-000000000001",
    (connection) => connection.clientKind === "mobile",
    event("m1"),
  );

  assert.deepEqual(delivered, ["mobile"]);
  assert.equal(mobile.length, 1);
  assert.equal(desktop.length, 0);
});

test("Desktop coaching presence attests one active window and disconnect fails closed", () => {
  const registry = createConnectionRegistry();
  const handle = registry.register(session("desktop", ["desktop_coaching_v1"]), {
    send: () => {},
  });
  const windowId = "11111111-1111-4111-8111-111111111111";
  const resumedWindowId = "22222222-2222-4222-8222-222222222222";

  assert.equal(registry.hasActiveCoachingWindow(session("desktop").userId, windowId), false);
  handle.setCoachingPresence(windowId, "active", "2026-07-26T08:00:00.000Z");
  assert.equal(registry.hasActiveCoachingWindow(session("desktop").userId, windowId), true);

  handle.clearCoachingPresence(windowId, "2026-07-26T08:00:00.500Z");
  assert.equal(registry.hasActiveCoachingWindow(session("desktop").userId, windowId), false);

  handle.setCoachingPresence(resumedWindowId, "active", "2026-07-26T08:00:01.000Z");
  handle.setCoachingPresence(resumedWindowId, "locked", "2026-07-26T08:00:02.000Z");
  assert.equal(registry.hasActiveCoachingWindow(session("desktop").userId, resumedWindowId), false);

  handle.setCoachingPresence(resumedWindowId, "active", "2026-07-26T08:00:03.000Z");
  handle.unregister();
  assert.equal(registry.hasActiveCoachingWindow(session("desktop").userId, resumedWindowId), false);
});

test("ending a Coaching Window clears that window across overlapping Desktop sockets", () => {
  const registry = createConnectionRegistry();
  const first = registry.register(session("desktop", ["desktop_coaching_v1"]), {
    send: () => {},
  });
  const second = registry.register(session("desktop", ["desktop_coaching_v1"]), {
    send: () => {},
  });
  const windowId = "11111111-1111-4111-8111-111111111111";

  first.setCoachingPresence(windowId, "active", "2026-07-26T08:00:00.000Z");
  second.setCoachingPresence(windowId, "active", "2026-07-26T08:00:01.000Z");
  assert.equal(registry.hasActiveCoachingWindow(session("desktop").userId, windowId), true);

  registry.clearCoachingWindow(session("desktop").userId, windowId, "2026-07-26T08:00:02.000Z");

  assert.equal(registry.hasActiveCoachingWindow(session("desktop").userId, windowId), false);
});

test("locking a Coaching Window fails closed across overlapping sockets without touching a newer window", () => {
  const registry = createConnectionRegistry();
  const first = registry.register(session("desktop", ["desktop_coaching_v1"]), {
    send: () => {},
  });
  const second = registry.register(session("desktop", ["desktop_coaching_v1"]), {
    send: () => {},
  });
  const userId = session("desktop").userId;
  const windowId = "11111111-1111-4111-8111-111111111111";
  const newerWindowId = "22222222-2222-4222-8222-222222222222";

  first.setCoachingPresence(windowId, "active", "2026-07-26T08:00:00.000Z");
  second.setCoachingPresence(windowId, "active", "2026-07-26T08:00:01.000Z");
  assert.equal(registry.hasActiveCoachingWindow(userId, windowId), true);

  assert.equal(registry.lockCoachingWindow(userId, windowId, "2026-07-26T08:00:02.000Z"), true);

  assert.equal(registry.hasActiveCoachingWindow(userId, windowId), false);

  first.setCoachingPresence(windowId, "active", "2026-07-26T08:00:03.000Z");
  second.setCoachingPresence(newerWindowId, "active", "2026-07-26T08:00:04.000Z");
  assert.equal(registry.hasActiveCoachingWindow(userId, windowId), true);
  assert.equal(registry.hasActiveCoachingWindow(userId, newerWindowId), true);

  assert.equal(registry.lockCoachingWindow(userId, windowId, "2026-07-26T08:00:05.000Z"), true);

  assert.equal(registry.hasActiveCoachingWindow(userId, windowId), false);
  assert.equal(registry.hasActiveCoachingWindow(userId, newerWindowId), true);
});

test("presence timestamps reject a delayed same-window reopen while preserving newer windows", () => {
  const registry = createConnectionRegistry();
  const first = registry.register(session("desktop", ["desktop_coaching_v1"]), {
    send: () => {},
  });
  const second = registry.register(session("desktop", ["desktop_coaching_v1"]), {
    send: () => {},
  });
  const userId = session("desktop").userId;
  const windowId = "11111111-1111-4111-8111-111111111111";
  const newerWindowId = "22222222-2222-4222-8222-222222222222";

  assert.equal(first.setCoachingPresence(windowId, "active", "2026-07-26T08:00:00.000Z"), true);
  assert.equal(second.setCoachingPresence(windowId, "active", "2026-07-26T08:00:01.000Z"), true);
  assert.equal(second.setCoachingPresence(windowId, "locked", "2026-07-26T08:00:02.000Z"), true);
  assert.equal(registry.hasActiveCoachingWindow(userId, windowId), false);

  assert.equal(
    second.setCoachingPresence(newerWindowId, "active", "2026-07-26T08:00:03.000Z"),
    true,
  );
  assert.equal(first.setCoachingPresence(windowId, "active", "2026-07-26T08:00:01.500Z"), false);
  assert.equal(registry.hasActiveCoachingWindow(userId, windowId), false);
  assert.equal(registry.hasActiveCoachingWindow(userId, newerWindowId), true);

  assert.equal(first.setCoachingPresence(windowId, "active", "2026-07-26T08:00:04.000Z"), true);
  assert.equal(registry.hasActiveCoachingWindow(userId, windowId), true);
  assert.equal(registry.hasActiveCoachingWindow(userId, newerWindowId), true);
});

test("an older locked frame always fails closed while only a genuinely later active frame reattests", () => {
  const registry = createConnectionRegistry();
  const handle = registry.register(session("desktop", ["desktop_coaching_v1"]), {
    send: () => {},
  });
  const userId = session("desktop").userId;
  const windowId = "11111111-1111-4111-8111-111111111111";

  assert.equal(handle.setCoachingPresence(windowId, "active", "2026-07-26T08:00:02.000Z"), true);
  assert.equal(handle.setCoachingPresence(windowId, "locked", "2026-07-26T08:00:01.000Z"), true);
  assert.equal(registry.hasActiveCoachingWindow(userId, windowId), false);

  assert.equal(handle.setCoachingPresence(windowId, "active", "2026-07-26T08:00:01.500Z"), false);
  assert.equal(registry.hasActiveCoachingWindow(userId, windowId), false);

  assert.equal(handle.setCoachingPresence(windowId, "active", "2026-07-26T08:00:03.000Z"), true);
  assert.equal(registry.hasActiveCoachingWindow(userId, windowId), true);
});

test("Window End retains a terminal high-water that delayed active frames cannot resurrect", () => {
  const registry = createConnectionRegistry();
  const handle = registry.register(session("desktop", ["desktop_coaching_v1"]), {
    send: () => {},
  });
  const userId = session("desktop").userId;
  const windowId = "11111111-1111-4111-8111-111111111111";

  assert.equal(handle.setCoachingPresence(windowId, "active", "2026-07-26T08:00:01.000Z"), true);
  registry.clearCoachingWindow(userId, windowId, "2026-07-26T08:00:02.000Z");
  assert.equal(registry.hasActiveCoachingWindow(userId, windowId), false);

  assert.equal(handle.setCoachingPresence(windowId, "active", "2026-07-26T08:00:01.500Z"), false);
  assert.equal(handle.setCoachingPresence(windowId, "active", "2026-07-26T08:00:03.000Z"), false);
  assert.equal(registry.hasActiveCoachingWindow(userId, windowId), false);
});

test("first-successful delivery skips a broken matching Desktop and uses the next healthy socket", () => {
  const sent = [];
  const registry = createConnectionRegistry();
  registry.register(session("desktop", ["desktop_coaching_v1"]), {
    send: () => {
      throw new Error("stale socket");
    },
  });
  registry.register(session("desktop", ["desktop_coaching_v1"]), {
    send: (frame) => sent.push(JSON.parse(frame)),
  });

  assert.equal(
    registry.sendFirstSuccessful(
      session("desktop").userId,
      (connection) => connection.clientKind === "desktop",
      event("coaching_1"),
    ),
    "desktop",
  );
  assert.deepEqual(
    sent.map((frame) => frame.message_id),
    ["coaching_1"],
  );
});

test("connection registry releases per-window coaching state with the user's last socket", () => {
  const registry = createConnectionRegistry();
  const userId = session("desktop").userId;
  const windowId = "11111111-1111-4111-8111-111111111111";
  const preflightWindowId = "22222222-2222-4222-8222-222222222222";

  const first = registry.register(session("desktop", ["desktop_coaching_v1"]), { send: () => {} });
  const second = registry.register(session("desktop", ["desktop_coaching_v1"]), { send: () => {} });
  assert.equal(first.setCoachingPresence(windowId, "active", "2026-07-26T08:00:00.000Z"), true);
  first.clearCoachingPresence(windowId, "2026-07-26T08:30:00.000Z");
  const stalePreflight = second.prepareActiveCoachingPresence(
    preflightWindowId,
    "2026-07-26T08:20:00.000Z",
  );
  assert.notEqual(stalePreflight, null);

  // While any socket for the user survives, the terminal high-water still
  // rejects a replayed presence frame for that window.
  first.unregister();
  assert.equal(
    second.setCoachingPresence(windowId, "active", "2026-07-26T08:15:00.000Z"),
    false,
    "terminal high-water must hold while the user is still connected",
  );

  // Once the last socket is gone there is nothing left to gate: the maps are
  // keyed by a window_id Desktop mints fresh per launch, so retaining them
  // would grow this always-alive process without bound.
  second.unregister();

  const reconnected = registry.register(session("desktop", ["desktop_coaching_v1"]), {
    send: () => {},
  });
  assert.equal(
    reconnected.setCoachingPresence(
      preflightWindowId,
      "active",
      "2026-07-26T08:20:00.000Z",
      stalePreflight,
    ),
    false,
    "a preflight prepared on a disconnected socket must not survive reconnect",
  );
  assert.equal(
    reconnected.setCoachingPresence(windowId, "active", "2026-07-26T08:15:00.000Z"),
    true,
    "per-window coaching state must not outlive the user's last socket",
  );
  assert.equal(registry.hasActiveCoachingWindow(userId, windowId), true);
});

function session(clientKind, capabilities = []) {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    clientKind,
    agentInstanceId: "00000000-0000-4000-8000-000000000010",
    pinnedFloor: {
      version: "floor_v1",
      documents: { SOUL: "soul", AGENTS: "agents", BOOTSTRAP: "bootstrap", HEARTBEAT: "heartbeat" },
      langfusePrompts: [],
    },
    capabilities,
  };
}

function event(messageId) {
  return {
    type: "companion_message",
    message_id: messageId,
    body: "hello",
    emitted_at: "2026-06-16T00:00:00.000Z",
    via_post_message_back: false,
  };
}
