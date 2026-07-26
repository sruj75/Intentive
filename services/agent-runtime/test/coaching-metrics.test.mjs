import assert from "node:assert/strict";
import test from "node:test";

import { createCoachingMetrics } from "../dist/index.js";

const userId = "00000000-0000-4000-8000-000000000001";
const windowId = "11111111-1111-4111-8111-111111111111";

test("Pause and Resume emit explicit one-occurrence content-free counters", () => {
  const records = [];
  const metrics = createCoachingMetrics({ logger: recordingLogger(records) });

  metrics.onLifecycle(userId, {
    type: "coaching_window_started",
    window_id: windowId,
    started_at: "2026-07-26T08:00:00.000Z",
    reason: "user_resume",
  });
  metrics.onLifecycle(userId, {
    type: "coaching_window_ended",
    window_id: windowId,
    ended_at: "2026-07-26T08:30:00.000Z",
    reason: "pause",
  });

  assert.deepEqual(records, [
    {
      level: "info",
      event: "coaching.resume",
      attrs: { user_id: userId, reason: "user_resume", count: 1, status: "ok" },
    },
    {
      level: "info",
      event: "coaching.pause",
      attrs: { user_id: userId, reason: "pause", count: 1, status: "ok" },
    },
  ]);
});

test("feature-disabled lifecycle is not retained or counted", () => {
  const records = [];
  const metrics = createCoachingMetrics({
    logger: recordingLogger(records),
    isEnabled: () => false,
  });

  metrics.onLifecycle(userId, {
    type: "coaching_window_started",
    window_id: windowId,
    started_at: "2026-07-26T08:00:00.000Z",
    reason: "user_resume",
  });
  metrics.onLifecycle(userId, {
    type: "coaching_window_ended",
    window_id: windowId,
    ended_at: "2026-07-26T08:30:00.000Z",
    reason: "pause",
  });

  assert.deepEqual(records, []);
});

test("the first committed user message measures orientation first-reply and reply latency once", () => {
  const records = [];
  let now = Date.parse("2026-07-26T08:00:00.000Z");
  const metrics = createCoachingMetrics({
    logger: recordingLogger(records),
    clock: () => now,
  });
  metrics.onLifecycle(userId, {
    type: "coaching_window_started",
    window_id: windowId,
    started_at: new Date(now).toISOString(),
    reason: "app_launch",
  });

  now += 1_000;
  metrics.onProactiveDelivered({
    userId,
    windowId,
    messageId: `opening:${windowId}`,
    kind: "orientation",
  });
  now += 4_500;
  metrics.onUserMessage(coachingSession());
  now += 1_000;
  metrics.onUserMessage(coachingSession());

  assert.deepEqual(records, [
    {
      level: "info",
      event: "coaching.first_reply",
      attrs: {
        user_id: userId,
        message_id: `opening:${windowId}`,
        category: "orientation",
        count: 1,
        duration_ms: 4_500,
        status: "ok",
      },
    },
    {
      level: "info",
      event: "coaching.reply_latency",
      attrs: {
        user_id: userId,
        message_id: `opening:${windowId}`,
        category: "orientation",
        count: 1,
        duration_ms: 4_500,
        status: "ok",
      },
    },
  ]);
});

test("an intervention measures only its next user reply and stale windows cannot create metrics", () => {
  const records = [];
  let now = Date.parse("2026-07-26T08:00:00.000Z");
  const metrics = createCoachingMetrics({
    logger: recordingLogger(records),
    clock: () => now,
  });
  metrics.onLifecycle(userId, {
    type: "coaching_window_started",
    window_id: windowId,
    started_at: new Date(now).toISOString(),
    reason: "app_launch",
  });

  metrics.onProactiveDelivered({
    userId,
    windowId: "22222222-2222-4222-8222-222222222222",
    messageId: "stale",
    kind: "intervention",
  });
  now += 2_000;
  metrics.onUserMessage(coachingSession());
  assert.deepEqual(records, []);

  metrics.onProactiveDelivered({
    userId,
    windowId,
    messageId: "intervention_1",
    kind: "intervention",
  });
  now += 3_000;
  metrics.onUserMessage({
    ...coachingSession(),
    clientKind: "mobile",
    capabilities: [],
  });
  assert.deepEqual(records, []);
  now += 3_000;
  metrics.onUserMessage(coachingSession());
  now += 1_000;
  metrics.onUserMessage(coachingSession());

  assert.deepEqual(records, [
    {
      level: "info",
      event: "coaching.reply_latency",
      attrs: {
        user_id: userId,
        message_id: "intervention_1",
        category: "intervention",
        count: 1,
        duration_ms: 6_000,
        status: "ok",
      },
    },
  ]);

  metrics.onLifecycle(userId, {
    type: "coaching_window_ended",
    window_id: windowId,
    ended_at: new Date(now).toISOString(),
    reason: "quit",
  });
  metrics.onProactiveDelivered({
    userId,
    windowId,
    messageId: "late",
    kind: "intervention",
  });
  now += 2_000;
  metrics.onUserMessage(coachingSession());
  assert.equal(records.length, 1);
});

function coachingSession() {
  return {
    userId,
    clientKind: "desktop",
    capabilities: ["desktop_coaching_v1"],
  };
}

function recordingLogger(records) {
  return {
    info: (event, attrs) => records.push({ level: "info", event, attrs }),
    warn: (event, attrs) => records.push({ level: "warn", event, attrs }),
    error: (event, _error, attrs) => records.push({ level: "error", event, attrs }),
    child: () => recordingLogger(records),
  };
}
