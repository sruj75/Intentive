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

function session(clientKind) {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    clientKind,
    agentInstanceId: "00000000-0000-4000-8000-000000000010",
    pinnedFloor: {
      version: "floor_v1",
      documents: { SOUL: "soul", AGENTS: "agents", BOOTSTRAP: "bootstrap", HEARTBEAT: "heartbeat" },
      langfusePrompts: [],
    },
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
