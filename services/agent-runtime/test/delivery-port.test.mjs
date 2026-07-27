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
        assert.equal(predicate(connection("mobile")), true);
        assert.equal(predicate(connection("desktop")), true);
        return ["mobile", "desktop"];
      },
      hasActiveCoachingWindow: () => false,
    },
    deliveries: { recordQuery: async (record) => records.push(record) },
    cpPush: { push: async () => assert.fail("reply delivery must not push") },
    authorizeProactive: async () => false,
  });

  assert.equal(await port.deliverReply(message("m1")), true);

  assert.equal(sent[0].via_post_message_back, false);
  assert.deepEqual(records, [
    {
      userId: "00000000-0000-4000-8000-000000000001",
      messageId: "m1",
      windowId: null,
      path: "stream",
      clientKind: "mobile",
      status: "ok",
      error: null,
      attemptedAt: at,
    },
    {
      userId: "00000000-0000-4000-8000-000000000001",
      messageId: "m1",
      windowId: null,
      path: "stream",
      clientKind: "desktop",
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
    registry: { send: () => [], hasActiveCoachingWindow: () => false },
    deliveries: { recordQuery: async (record) => records.push(record) },
    cpPush: { push: async () => assert.fail("reply delivery must not push") },
    authorizeProactive: async () => false,
  });

  assert.equal(await port.deliverReply(message("m1")), false);

  assert.equal(records[0].path, "stream");
  assert.equal(records[0].status, "failed");
  assert.match(records[0].error, /no connected chat-capable client/);
});

test("ordinary proactive delivery streams to a foreground chat client", async () => {
  const records = [];
  const sent = [];
  const port = createDeliveryPort({
    clock: () => at,
    registry: {
      send: (_userId, predicate, event) => {
        sent.push(event);
        assert.equal(predicate(connection("mobile", null, null, false)), false);
        assert.equal(predicate(connection("desktop", null, null, true)), true);
        return ["desktop"];
      },
      hasActiveCoachingWindow: () => false,
    },
    deliveries: { recordQuery: async (record) => records.push(record) },
    cpPush: { push: async () => assert.fail("foreground PMB must not push") },
    authorizeProactive: async () => false,
  });

  assert.equal(await port.deliverOrdinaryProactive(message("ordinary_1")), true);

  assert.equal(sent[0].via_post_message_back, true);
  assert.equal("window_id" in sent[0], false);
  assert.equal(records[0].path, "stream");
  assert.equal(records[0].clientKind, "desktop");
  assert.equal(records[0].windowId, null);
});

test("ordinary proactive delivery falls back to Control Plane push", async () => {
  const records = [];
  const pushes = [];
  const port = createDeliveryPort({
    clock: () => at,
    registry: {
      send: () => [],
      hasActiveCoachingWindow: () => false,
    },
    deliveries: { recordQuery: async (record) => records.push(record) },
    cpPush: { push: async (input) => pushes.push(input) },
    authorizeProactive: async () => false,
  });

  assert.equal(await port.deliverOrdinaryProactive(message("ordinary_2")), true);

  assert.deepEqual(pushes, [
    {
      userId: "00000000-0000-4000-8000-000000000001",
      previewText: "hello",
      messageId: "ordinary_2",
    },
  ]);
  assert.equal(records[0].path, "push");
  assert.equal(records[0].status, "ok");
  assert.equal(records[0].windowId, null);
});

test("ordinary proactive delivery records Control Plane push failure", async () => {
  const records = [];
  const port = createDeliveryPort({
    clock: () => at,
    registry: {
      send: () => [],
      hasActiveCoachingWindow: () => false,
    },
    deliveries: { recordQuery: async (record) => records.push(record) },
    cpPush: { push: async () => Promise.reject(new Error("cp unavailable")) },
    authorizeProactive: async () => false,
  });

  assert.equal(await port.deliverOrdinaryProactive(message("ordinary_3")), false);
  assert.equal(records[0].path, "push");
  assert.equal(records[0].status, "failed");
  assert.equal(records[0].windowId, null);
  assert.equal(records[0].error, "cp unavailable");
});

test("coaching proactive delivery streams only to the matching actively attested Desktop", async () => {
  const records = [];
  const sent = [];
  const coachingDeliveries = [];
  const logEvents = [];
  const port = createDeliveryPort({
    clock: () => at,
    registry: {
      sendFirstSuccessful: (_userId, predicate, event) => {
        sent.push(event);
        assert.equal(predicate(connection("mobile", "window_1", "active")), false);
        assert.equal(predicate(connection("desktop", "window_2", "active")), false);
        assert.equal(predicate(connection("desktop", "window_1", "locked")), false);
        assert.equal(predicate(connection("desktop", "window_1", "active", false)), true);
        assert.equal(predicate(connection("desktop", "window_1", "active", false)), true);
        return "desktop";
      },
      hasActiveCoachingWindow: (_userId, windowId) => windowId === "window_1",
    },
    deliveries: { recordQuery: async (record) => records.push(record) },
    cpPush: { push: async () => assert.fail("foreground proactive delivery must not push") },
    authorizeProactive: async (_userId, windowId) => windowId === "window_1",
    coachingMetrics: {
      onProactiveDelivered: (input) => coachingDeliveries.push(input),
    },
    logger: recordingLogger(logEvents),
  });

  assert.equal(await port.deliverCoachingProactive(message("m1", "window_1")), true);

  assert.equal(sent[0].window_id, "window_1");
  assert.equal(records[0].path, "stream");
  assert.equal(records[0].clientKind, "desktop");
  assert.equal(records[0].windowId, "window_1");
  assert.equal(records[0].status, "ok");
  assert.deepEqual(coachingDeliveries, [
    {
      userId: "00000000-0000-4000-8000-000000000001",
      windowId: "window_1",
      messageId: "m1",
      kind: "intervention",
    },
  ]);
  assert.equal(
    logEvents.some((record) => record.event === "coaching.intervention_stream_sent"),
    true,
  );
  assert.equal(
    logEvents.some((record) => record.event === "coaching.intervention_shown"),
    false,
  );
});

test("stable opening messages classify successful proactive delivery as orientation", async () => {
  const coachingDeliveries = [];
  const logEvents = [];
  const port = createDeliveryPort({
    clock: () => at,
    registry: {
      sendFirstSuccessful: () => "desktop",
      hasActiveCoachingWindow: () => true,
    },
    deliveries: { recordQuery: async () => [] },
    cpPush: { push: async () => assert.fail("coaching delivery must never push") },
    authorizeProactive: async () => true,
    coachingMetrics: {
      onProactiveDelivered: (input) => coachingDeliveries.push(input),
    },
    logger: recordingLogger(logEvents),
  });
  const windowId = "11111111-1111-4111-8111-111111111111";

  await port.deliverCoachingProactive(message(`opening:${windowId}`, windowId));

  assert.equal(coachingDeliveries[0].kind, "orientation");
  assert.equal(
    logEvents.some((record) => record.event === "coaching.intervention_stream_sent"),
    false,
  );
});

test("proactive delivery fails closed when the durable window is stale and never pushes", async () => {
  const records = [];
  const pushes = [];
  let sendCalls = 0;
  const port = createDeliveryPort({
    clock: () => at,
    registry: {
      send: () => {
        sendCalls += 1;
        return ["desktop"];
      },
      hasActiveCoachingWindow: () => true,
    },
    deliveries: { recordQuery: async (record) => records.push(record) },
    cpPush: {
      push: async (input) => {
        pushes.push(input);
      },
    },
    authorizeProactive: async () => false,
  });

  assert.equal(await port.deliverCoachingProactive(message("m1", "window_1")), false);

  assert.equal(sendCalls, 0);
  assert.deepEqual(pushes, []);
  assert.equal(records[0].path, "stream");
  assert.equal(records[0].status, "failed");
  assert.equal(records[0].windowId, "window_1");
  assert.match(records[0].error, /active coaching window/);
});

test("proactive delivery fails closed without matching live Desktop attestation", async () => {
  const records = [];
  const port = createDeliveryPort({
    clock: () => at,
    registry: {
      send: () => [],
      hasActiveCoachingWindow: () => false,
    },
    deliveries: { recordQuery: async (record) => records.push(record) },
    cpPush: { push: async () => assert.fail("coaching delivery must never push") },
    authorizeProactive: async () => true,
  });

  assert.equal(await port.deliverCoachingProactive(message("m1", "window_1")), false);

  assert.equal(records[0].path, "stream");
  assert.equal(records[0].status, "failed");
  assert.match(records[0].error, /matching active Desktop/);
});

function message(messageId, windowId) {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    messageId,
    body: "hello",
    ...(windowId ? { windowId } : {}),
  };
}

function connection(
  clientKind,
  coachingWindowId = null,
  coachingPresence = null,
  foreground = true,
) {
  return {
    clientKind,
    capabilities: clientKind === "desktop" ? ["desktop_coaching_v1"] : [],
    foreground,
    coachingWindowId,
    coachingPresence,
  };
}

function recordingLogger(records) {
  return {
    info: (event, attrs) => records.push({ level: "info", event, attrs }),
    warn: (event, attrs) => records.push({ level: "warn", event, attrs }),
    error: (event, error, attrs) => records.push({ level: "error", event, error, attrs }),
    child: () => recordingLogger(records),
  };
}
