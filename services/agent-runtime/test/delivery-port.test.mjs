import assert from "node:assert/strict";
import test from "node:test";

import { createDeliveryPort } from "../dist/index.js";

const at = new Date("2026-06-16T00:00:00.000Z");

test("reply delivery streams to connected chat-capable clients and records stream rows", async () => {
  const records = [];
  const sent = [];
  const port = createDeliveryPort({
    clock: () => at,
    registry: {
      send: (_userId, predicate, event) => {
        sent.push(event);
        assert.equal(predicate({ clientKind: "mobile", foreground: false }), true);
        assert.equal(predicate({ clientKind: "desktop", foreground: true }), false);
        return ["mobile"];
      },
    },
    deliveries: { recordQuery: async (record) => records.push(record) },
    cpPush: { push: async () => assert.fail("reply delivery must not push") },
  });

  await port.deliver(message("m1"), "reply");

  assert.equal(sent[0].via_post_message_back, false);
  assert.deepEqual(records, [
    {
      userId: "00000000-0000-4000-8000-000000000001",
      messageId: "m1",
      path: "stream",
      clientKind: "mobile",
      status: "ok",
      error: null,
      attemptedAt: at,
    },
  ]);
});

test("reply delivery records stream failure when no chat client is connected and never pushes", async () => {
  const records = [];
  const port = createDeliveryPort({
    clock: () => at,
    registry: { send: () => [] },
    deliveries: { recordQuery: async (record) => records.push(record) },
    cpPush: { push: async () => assert.fail("reply delivery must not push") },
  });

  await port.deliver(message("m1"), "reply");

  assert.equal(records[0].path, "stream");
  assert.equal(records[0].status, "failed");
  assert.match(records[0].error, /no connected chat-capable client/);
});

test("proactive delivery streams only to foreground chat clients", async () => {
  const records = [];
  const port = createDeliveryPort({
    clock: () => at,
    registry: {
      send: (_userId, predicate) => {
        assert.equal(predicate({ clientKind: "mobile", foreground: true }), true);
        assert.equal(predicate({ clientKind: "mobile", foreground: false }), false);
        return ["mobile"];
      },
    },
    deliveries: { recordQuery: async (record) => records.push(record) },
    cpPush: { push: async () => assert.fail("foreground proactive delivery must not push") },
  });

  await port.deliver(message("m1"), "proactive");

  assert.equal(records[0].path, "stream");
  assert.equal(records[0].status, "ok");
});

test("proactive delivery pushes when no foreground chat client is reachable and records push failures", async () => {
  const records = [];
  const pushes = [];
  const port = createDeliveryPort({
    clock: () => at,
    registry: { send: () => [] },
    deliveries: { recordQuery: async (record) => records.push(record) },
    cpPush: {
      push: async (input) => {
        pushes.push(input);
        throw new Error("cp unavailable");
      },
    },
  });

  await port.deliver(message("m1"), "proactive");

  assert.deepEqual(pushes, [
    {
      userId: "00000000-0000-4000-8000-000000000001",
      previewText: "hello",
      messageId: "m1",
    },
  ]);
  assert.equal(records[0].path, "push");
  assert.equal(records[0].status, "failed");
  assert.equal(records[0].error, "cp unavailable");
});

function message(messageId) {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    messageId,
    body: "hello",
  };
}
