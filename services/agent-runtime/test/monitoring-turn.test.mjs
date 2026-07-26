import assert from "node:assert/strict";
import test from "node:test";

import { createMonitoringTurn, createTurn, createWorkingContext } from "../dist/index.js";

test("Monitoring Turn runs on the main user thread and records only an ok Runtime Turn", async () => {
  const executions = [];
  const records = [];
  const transactions = [];
  const monitoringTurn = createMonitoringTurn({
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

  await monitoringTurn("user_1", "heartbeat", monitoringContext());

  assert.equal(executions[0].userId, "user_1");
  assert.equal(executions[0].threadId, "user_1");
  assert.equal(executions[0].trigger, "heartbeat");
  // The spine writes a single runtime_turns(ok) anchor; onSuccess contributes no rows.
  assert.equal(transactions.length, 1);
  assert.deepEqual(transactions[0].length, 1);
  assert.equal(records[0].status, "ok");
});

test("Monitoring Turn records exactly one failed Runtime Turn when model execution fails", async () => {
  const records = [];
  const transactions = [];
  let invoked = false;
  const monitoringTurn = createMonitoringTurn({
    turn: createTurn({
      sql: { transaction: async (queries) => transactions.push(queries) },
      adapter: {
        invoke: async () => {
          invoked = true;
          throw new Error("provider unavailable");
        },
      },
      workingContext: createWorkingContext({ readUserProfile: async () => "" }),
      runtimeTurns: { recordQuery: (record) => (records.push(record), Promise.resolve([record])) },
      fallbackModel: "fallback-model",
    }),
  });

  await monitoringTurn("user_1", "heartbeat", monitoringContext());

  assert.equal(invoked, true);
  // Exactly one transaction: the old outer-catch double-path is gone.
  assert.equal(transactions.length, 1);
  assert.equal(records.length, 1);
  assert.equal(records[0].status, "failed");
  assert.equal(records[0].error, "Error");
});

test("window-scoped Monitoring Turn binds fixed evidence and advances only on success", async () => {
  const successQueries = [];
  let execution;
  const monitoringTurn = createMonitoringTurn({
    turn: async (input) => {
      execution = input;
      successQueries.push(
        ...input.onSuccess({
          reply: "internal",
          traceId: "trace",
          model: "model",
          bundleVersion: "floor_v1",
        }),
      );
      return {
        reply: "internal",
        traceId: "trace",
        model: "model",
        bundleVersion: "floor_v1",
      };
    },
  });

  assert.equal(
    await monitoringTurn("user_1", "perception_event", {
      windowId: "11111111-1111-4111-8111-111111111111",
      floor: floor("connection_floor_v7"),
      evidence: {
        cursorStart: 3,
        cursorEnd: 8,
        version: "evidence_v8",
        rendered: "oldest unconsumed evidence",
      },
      beforeCommit: async () => true,
      onSuccessQueries: () => ["advance-cursor"],
      onFailureQueries: () => ["record-attempt"],
    }),
    true,
  );
  assert.equal(execution.recentPerception, "oldest unconsumed evidence");
  assert.equal(execution.evidenceCursorStart, 3);
  assert.equal(execution.evidenceCursorEnd, 8);
  assert.equal(execution.evidenceVersion, "evidence_v8");
  assert.equal((await execution.floor()).version, "connection_floor_v7");
  assert.deepEqual(successQueries, ["advance-cursor"]);
});

test("failed window-scoped Monitoring Turn records its attempt in the failed Turn transaction without advancing evidence", async () => {
  const transactions = [];
  const records = [];
  const monitoringTurn = createMonitoringTurn({
    turn: createTurn({
      sql: { transaction: async (queries) => transactions.push(queries) },
      adapter: { invoke: async () => Promise.reject(new Error("provider unavailable")) },
      workingContext: createWorkingContext({ readUserProfile: async () => "" }),
      runtimeTurns: {
        recordQuery: (record) => (records.push(record), Promise.resolve([record])),
      },
      fallbackModel: "fallback-model",
    }),
  });

  assert.equal(
    await monitoringTurn("user_1", "perception_event", {
      windowId: "11111111-1111-4111-8111-111111111111",
      floor: floor("floor_v1"),
      evidence: {
        cursorStart: 3,
        cursorEnd: 8,
        version: "evidence_v8",
        rendered: "oldest unconsumed evidence",
      },
      beforeCommit: async () => true,
      onSuccessQueries: () => [assert.fail("failed turn must not advance cursor")],
      onFailureQueries: () => ["record-judgment-attempt"],
    }),
    false,
  );

  assert.deepEqual(transactions[0][0], "record-judgment-attempt");
  assert.equal(records[0].status, "failed");
  assert.equal(transactions[0].length, 2);
});

function spy(sink, build) {
  const turn = build();
  return async (execution) => {
    sink.push(execution);
    return turn(execution);
  };
}

function monitoringContext() {
  return {
    windowId: "11111111-1111-4111-8111-111111111111",
    floor: floor("connection_floor_v1"),
    evidence: {
      cursorStart: 1,
      cursorEnd: 1,
      version: "evidence_v1",
      rendered: "bounded evidence",
    },
    beforeCommit: async () => true,
    onSuccessQueries: () => [],
    onFailureQueries: () => [],
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
