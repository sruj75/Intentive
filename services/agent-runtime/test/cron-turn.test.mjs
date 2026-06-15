import assert from "node:assert/strict";
import test from "node:test";

import { createCronTurnHandler, isTransient } from "../dist/index.js";

test("cron turn invokes the adapter on an ephemeral thread and records a silent successful run", async () => {
  const invocations = [];
  const transactions = [];
  const handler = createCronTurnHandler({
    sql: { transaction: async (queries) => transactions.push(queries) },
    adapter: {
      invoke: async (input) => {
        invocations.push(input);
        return { reply: "", traceId: "trace_1", model: "model", bundleVersion: "floor_v1" };
      },
    },
    cronJobs: {
      deleteQuery: (id) => Promise.resolve([{ id, op: "delete" }]),
      rescheduleQuery: () => Promise.resolve([]),
    },
    cronRuns: { recordQuery: (record) => Promise.resolve([{ id: "run_1", record }]) },
    floorResolver: { resolve: async () => floor("floor_v1") },
    readUserProfile: async () => "profile",
    readRecentPerception: async () => null,
    newThreadId: () => "cron-thread",
  });

  await handler(job({ scheduleKind: "at" }), { firedAt: new Date("2026-06-16T00:00:00.000Z") });

  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].threadId, "cron-thread");
  assert.equal(invocations[0].trigger, "cron");
  assert.equal(invocations[0].body, "wake");
  assert.equal(transactions.length, 1);
  const rows = await Promise.all(transactions[0]);
  assert.equal(rows[0][0].record.status, "ok");
  assert.equal(rows[1][0].op, "delete");
});

test("cron turn retries transient failures with cross-tick backoff", async () => {
  const transactions = [];
  const handler = createCronTurnHandler({
    sql: { transaction: async (queries) => transactions.push(queries) },
    adapter: { invoke: async () => Promise.reject(new Error("network timeout")) },
    cronJobs: {
      deleteQuery: () => Promise.resolve([]),
      rescheduleQuery: (id, nextFireAt, attemptCount) =>
        Promise.resolve([{ id, nextFireAt, attemptCount }]),
    },
    cronRuns: { recordQuery: (record) => Promise.resolve([{ id: "run_1", record }]) },
    floorResolver: { resolve: async () => floor("floor_v1") },
    newThreadId: () => "cron-thread",
  });

  await handler(job({ attemptCount: 0, scheduleKind: "every", scheduleExpr: "5m" }), {
    firedAt: new Date("2026-06-16T00:00:00.000Z"),
  });

  const rows = await Promise.all(transactions[0]);
  assert.equal(rows[0][0].record.status, "failed");
  assert.equal(rows[1][0].nextFireAt.toISOString(), "2026-06-16T00:01:00.000Z");
  assert.equal(rows[1][0].attemptCount, 1);
});

test("transient classifier recognizes provider and network failures", () => {
  assert.equal(isTransient(new Error("rate_limit")), true);
  assert.equal(isTransient(new Error("validation failed")), false);
});

function job(overrides = {}) {
  return {
    id: "job_1",
    userId: "user_1",
    path: "/job_1.md",
    name: "job",
    scheduleKind: "at",
    scheduleExpr: "2026-06-16T00:00:00.000Z",
    tz: null,
    status: "active",
    nextFireAt: new Date("2026-06-16T00:00:00.000Z"),
    prompt: "wake",
    attemptCount: 0,
    ...overrides,
  };
}

function floor(version) {
  return {
    version,
    documents: {
      SOUL: "soul",
      AGENTS: "agents",
      BOOTSTRAP: "bootstrap",
      HEARTBEAT: "heartbeat",
    },
    langfusePrompts: [],
  };
}
