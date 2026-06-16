import assert from "node:assert/strict";
import test from "node:test";

import { createMonitoringTurn, createTurn, createWorkingContext } from "../dist/index.js";

test("Monitoring Turn runs on the main user thread and records only an ok Runtime Turn", async () => {
  const executions = [];
  const records = [];
  const transactions = [];
  const monitoringTurn = createMonitoringTurn({
    floorResolver: { resolve: async () => floor("floor_v1") },
    turn: spy(executions, () =>
      createTurn({
        sql: { transaction: async (queries) => transactions.push(queries) },
        adapter: {
          invoke: async () => ({
            reply: "internal reasoning",
            traceId: "trace_1",
            model: "model",
            bundleVersion: "floor_v1",
          }),
        },
        workingContext: createWorkingContext({ readUserProfile: async () => "" }),
        runtimeTurns: {
          recordQuery: (record) => (records.push(record), Promise.resolve([record])),
        },
        fallbackModel: "fallback-model",
      }),
    ),
  });

  await monitoringTurn("user_1", "heartbeat");

  assert.equal(executions[0].userId, "user_1");
  assert.equal(executions[0].threadId, "user_1");
  assert.equal(executions[0].trigger, "heartbeat");
  // The spine writes a single runtime_turns(ok) anchor; onSuccess contributes no rows.
  assert.equal(transactions.length, 1);
  assert.deepEqual(transactions[0].length, 1);
  assert.equal(records[0].status, "ok");
});

test("Monitoring Turn records exactly one failed Runtime Turn when floor resolution fails", async () => {
  const records = [];
  const transactions = [];
  let invoked = false;
  const monitoringTurn = createMonitoringTurn({
    floorResolver: { resolve: async () => Promise.reject(new Error("floor unavailable")) },
    turn: createTurn({
      sql: { transaction: async (queries) => transactions.push(queries) },
      adapter: {
        invoke: async () => {
          invoked = true;
          throw new Error("adapter should not run without a floor");
        },
      },
      workingContext: createWorkingContext({ readUserProfile: async () => "" }),
      runtimeTurns: { recordQuery: (record) => (records.push(record), Promise.resolve([record])) },
      fallbackModel: "fallback-model",
    }),
  });

  await monitoringTurn("user_1", "heartbeat");

  assert.equal(invoked, false);
  // Exactly one transaction: the old outer-catch double-path is gone.
  assert.equal(transactions.length, 1);
  assert.equal(records.length, 1);
  assert.equal(records[0].status, "failed");
  assert.equal(records[0].error, "floor unavailable");
});

function spy(sink, build) {
  const turn = build();
  return async (execution) => {
    sink.push(execution);
    return turn(execution);
  };
}

function floor(version) {
  return {
    version,
    documents: { SOUL: "soul", AGENTS: "agents", BOOTSTRAP: "bootstrap", HEARTBEAT: "heartbeat" },
    langfusePrompts: [],
  };
}
