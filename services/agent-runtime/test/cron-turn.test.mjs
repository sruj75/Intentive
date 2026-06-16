import assert from "node:assert/strict";
import test from "node:test";

import {
  createCronTurnHandler,
  createTurn,
  createWorkingContext,
  isTransient,
} from "../dist/index.js";

test("cron turn invokes the adapter on the user's main thread and records a silent successful run", async () => {
  const invocations = [];
  const transactions = [];
  const adapter = {
    invoke: async (input) => {
      invocations.push(input);
      return { reply: "", traceId: "trace_1", model: "model", bundleVersion: "floor_v1" };
    },
  };
  const sql = { transaction: async (queries) => transactions.push(queries) };
  const handler = createCronTurnHandler({
    cronJobs: {
      deleteQuery: (id) => Promise.resolve([{ id, op: "delete" }]),
      rescheduleQuery: () => Promise.resolve([]),
    },
    cronRuns: { recordQuery: (record) => Promise.resolve([{ id: "run_1", record }]) },
    floorResolver: { resolve: async () => floor("floor_v1") },
    turn: createTurn({
      sql,
      adapter,
      workingContext: createWorkingContext({
        readUserProfile: async () => "profile",
        readRecentPerception: async () => null,
      }),
      runtimeTurns: { recordQuery: (record) => Promise.resolve([{ id: "rt_1", record }]) },
      fallbackModel: "fallback-model",
    }),
  });

  await handler(job({ scheduleKind: "at" }), { firedAt: new Date("2026-06-16T00:00:00.000Z") });

  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].threadId, "user_1");
  assert.equal(invocations[0].trigger, "cron");
  assert.equal(invocations[0].body, "wake");
  assert.equal(transactions.length, 1);
  const rows = await Promise.all(transactions[0]);
  // [cron_runs(ok), lifecycle, runtime_turns(ok)] — the spine appends the anchor.
  assert.equal(rows[0][0].record.status, "ok");
  assert.equal(rows[1][0].op, "delete");
  assert.equal(rows[2][0].record.status, "ok");
});

test("cron turn retries transient failures with cross-tick backoff and records a failed anchor", async () => {
  const transactions = [];
  const adapter = { invoke: async () => Promise.reject(new Error("network timeout")) };
  const sql = { transaction: async (queries) => transactions.push(queries) };
  const handler = createCronTurnHandler({
    cronJobs: {
      deleteQuery: () => Promise.resolve([]),
      rescheduleQuery: (id, nextFireAt, attemptCount) =>
        Promise.resolve([{ id, nextFireAt, attemptCount }]),
    },
    cronRuns: { recordQuery: (record) => Promise.resolve([{ id: "run_1", record }]) },
    floorResolver: { resolve: async () => floor("floor_v1") },
    turn: createTurn({
      sql,
      adapter,
      workingContext: createWorkingContext({ readUserProfile: async () => "" }),
      runtimeTurns: { recordQuery: (record) => Promise.resolve([{ id: "rt_1", record }]) },
      fallbackModel: "fallback-model",
    }),
    newThreadId: () => "cron-thread",
  });

  await handler(job({ attemptCount: 0, scheduleKind: "every", scheduleExpr: "5m" }), {
    firedAt: new Date("2026-06-16T00:00:00.000Z"),
  });

  const rows = await Promise.all(transactions[0]);
  // [cron_runs(failed), reschedule, runtime_turns(failed)].
  assert.equal(rows[0][0].record.status, "failed");
  assert.equal(rows[1][0].nextFireAt.toISOString(), "2026-06-16T00:01:00.000Z");
  assert.equal(rows[1][0].attemptCount, 1);
  assert.equal(rows[2][0].record.status, "failed");
});

test("cron turn routes floor-resolution failure through the spine's failure path", async () => {
  const transactions = [];
  let invoked = false;
  const adapter = {
    invoke: async () => {
      invoked = true;
      return { reply: "", traceId: "trace_1", model: "model", bundleVersion: "floor_v1" };
    },
  };
  const sql = { transaction: async (queries) => transactions.push(queries) };
  const handler = createCronTurnHandler({
    cronJobs: {
      deleteQuery: (id) => Promise.resolve([{ id, op: "delete" }]),
      rescheduleQuery: (id, nextFireAt, attemptCount) =>
        Promise.resolve([{ id, nextFireAt, attemptCount }]),
    },
    cronRuns: { recordQuery: (record) => Promise.resolve([{ id: "run_1", record }]) },
    floorResolver: { resolve: async () => Promise.reject(new Error("floor unavailable")) },
    turn: createTurn({
      sql,
      adapter,
      workingContext: createWorkingContext({ readUserProfile: async () => "" }),
      runtimeTurns: { recordQuery: (record) => Promise.resolve([{ id: "rt_1", record }]) },
      fallbackModel: "fallback-model",
    }),
  });

  await handler(job({ scheduleKind: "at" }), { firedAt: new Date("2026-06-16T00:00:00.000Z") });

  assert.equal(invoked, false);
  // Exactly one transaction: cron_runs(failed) + lifecycle + runtime_turns(failed).
  assert.equal(transactions.length, 1);
  const rows = await Promise.all(transactions[0]);
  assert.equal(rows[0][0].record.status, "failed");
  assert.equal(rows[0][0].record.error, "floor unavailable");
  assert.equal(rows[2][0].record.status, "failed");
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
