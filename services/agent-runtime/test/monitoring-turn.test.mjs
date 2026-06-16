import assert from "node:assert/strict";
import test from "node:test";

import { createMonitoringTurn } from "../dist/index.js";

test("Monitoring Turn runs on the main user thread and records only a Runtime Turn", async () => {
  const executions = [];
  const records = [];
  const transactions = [];
  const monitoringTurn = createMonitoringTurn({
    sql: { transaction: async (queries) => transactions.push(queries) },
    floorResolver: { resolve: async () => floor("floor_v1") },
    fallbackModel: "fallback-model",
    runtimeTurns: { recordQuery: (record) => (records.push(record), Promise.resolve([record])) },
    turn: async (execution) => {
      executions.push(execution);
      await Promise.all(
        execution.onSuccess({
          reply: "internal reasoning",
          traceId: "trace_1",
          model: "model",
          bundleVersion: "floor_v1",
        }),
      );
    },
  });

  await monitoringTurn("user_1", "heartbeat");

  assert.equal(executions[0].userId, "user_1");
  assert.equal(executions[0].threadId, "user_1");
  assert.equal(executions[0].trigger, "heartbeat");
  assert.equal(records[0].status, "ok");
  assert.equal(transactions.length, 0);
});

test("Monitoring Turn records a failed Runtime Turn when floor resolution fails", async () => {
  const records = [];
  const transactions = [];
  const monitoringTurn = createMonitoringTurn({
    sql: { transaction: async (queries) => transactions.push(queries) },
    floorResolver: { resolve: async () => Promise.reject(new Error("floor unavailable")) },
    fallbackModel: "fallback-model",
    runtimeTurns: { recordQuery: (record) => (records.push(record), Promise.resolve([record])) },
    turn: async () => assert.fail("turn should not run without a floor"),
  });

  await monitoringTurn("user_1", "heartbeat");

  assert.equal(records[0].status, "failed");
  assert.equal(records[0].error, "floor unavailable");
  assert.equal(transactions.length, 1);
});

function floor(version) {
  return {
    version,
    documents: { SOUL: "soul", AGENTS: "agents", BOOTSTRAP: "bootstrap", HEARTBEAT: "heartbeat" },
    langfusePrompts: [],
  };
}
