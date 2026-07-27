import assert from "node:assert/strict";
import test from "node:test";

import { createTurn } from "../dist/index.js";

test("turn execution resolves the floor, invokes the adapter, and appends the ok anchor after caller rows", async () => {
  const order = [];
  const successQuery = Promise.resolve([{ ok: true }]);
  const anchorQuery = Promise.resolve([{ id: "turn_1" }]);
  const transactions = [];
  const turnRecords = [];
  const turn = createTurn({
    sql: {
      transaction: async (queries) => {
        order.push("transaction");
        transactions.push(queries);
      },
    },
    runtimeTurns: {
      recordQuery: (record) => {
        turnRecords.push(record);
        return anchorQuery;
      },
    },
    fallbackModel: "fallback-model",
    workingContext: async (input) => {
      order.push("assemble");
      assert.equal(input.evidenceCursorStart, 4);
      assert.equal(input.evidenceCursorEnd, 9);
      return {
        userId: input.userId,
        threadId: input.threadId,
        body: input.body,
        trigger: input.trigger,
        pinnedFloor: input.floor,
        userProfile: "profile",
      };
    },
    adapter: {
      invoke: async (input) => {
        order.push("invoke");
        assert.equal(input.userProfile, "profile");
        assert.equal(input.pinnedFloor.version, "floor_v1");
        return {
          reply: "hello from Companion",
          traceId: "trace_1",
          model: "model",
          bundleVersion: "floor_v1",
        };
      },
    },
  });

  const result = await turn({
    userId: "user_1",
    threadId: "thread_1",
    body: "hello",
    trigger: "user_message",
    windowId: "11111111-1111-4111-8111-111111111111",
    evidenceCursorStart: 4,
    evidenceCursorEnd: 9,
    evidenceVersion: "evidence_v1",
    recentPerception: "bounded coaching evidence",
    floor: () => {
      order.push("floor");
      return Promise.resolve(floor("floor_v1"));
    },
    onSuccess: (output) => {
      order.push(`success:${output.traceId}`);
      return [successQuery];
    },
    onFailure: () => {
      throw new Error("unexpected failure policy");
    },
  });

  assert.deepEqual(order, ["floor", "assemble", "invoke", "success:trace_1", "transaction"]);
  assert.equal(result?.reply, "hello from Companion");
  // The spine appends the runtime_turns anchor *after* the caller's rows.
  assert.deepEqual(transactions, [[successQuery, anchorQuery]]);
  assert.deepEqual(turnRecords, [
    {
      userId: "user_1",
      threadId: "thread_1",
      traceId: "trace_1",
      model: "model",
      bundleVersion: "floor_v1",
      windowId: "11111111-1111-4111-8111-111111111111",
      trigger: "user_message",
      evidenceCursorStart: 4,
      evidenceCursorEnd: 9,
      evidenceVersion: "evidence_v1",
      status: "ok",
      error: null,
    },
  ]);
});

test("turn execution appends a failed anchor and contains the error when policy says not to rethrow", async () => {
  const failureQuery = Promise.resolve([{ failed: true }]);
  const anchorQuery = Promise.resolve([{ id: "turn_1" }]);
  const transactions = [];
  const turnRecords = [];
  const turn = createTurn({
    sql: { transaction: async (queries) => transactions.push(queries) },
    runtimeTurns: {
      recordQuery: (record) => {
        turnRecords.push(record);
        return anchorQuery;
      },
    },
    fallbackModel: "fallback-model",
    workingContext: async (input) => ({
      userId: input.userId,
      threadId: input.threadId,
      body: input.body,
      trigger: input.trigger,
      pinnedFloor: input.floor,
      userProfile: "",
    }),
    adapter: {
      invoke: async () => {
        throw new Error("model unavailable");
      },
    },
  });

  await turn({
    userId: "user_1",
    threadId: "thread_1",
    body: "hello",
    trigger: "cron",
    floor: () => Promise.resolve(floor("floor_v1")),
    onSuccess: () => {
      throw new Error("unexpected success policy");
    },
    onFailure: (error) => {
      assert.match(String(error), /model unavailable/);
      return { queries: [failureQuery], rethrow: false };
    },
  });

  assert.deepEqual(transactions, [[failureQuery, anchorQuery]]);
  assert.deepEqual(turnRecords, [
    {
      userId: "user_1",
      threadId: "thread_1",
      traceId: null,
      model: "fallback-model",
      bundleVersion: null,
      windowId: null,
      trigger: "cron",
      evidenceCursorStart: null,
      evidenceCursorEnd: null,
      evidenceVersion: null,
      status: "failed",
      error: "Error",
    },
  ]);
});

test("a swallowed coaching egress failure records a failed turn and does not consume evidence", async () => {
  const attemptQuery = Promise.resolve([{ attempted: true }]);
  const anchorQuery = Promise.resolve([{ id: "turn_1" }]);
  const transactions = [];
  const turnRecords = [];
  const turn = createTurn({
    sql: { transaction: async (queries) => transactions.push(queries) },
    runtimeTurns: {
      recordQuery: (record) => {
        turnRecords.push(record);
        return anchorQuery;
      },
    },
    fallbackModel: "fallback-model",
    workingContext: async (input) => ({
      userId: input.userId,
      threadId: input.threadId,
      body: input.body,
      trigger: input.trigger,
      pinnedFloor: input.floor,
      userProfile: "",
    }),
    adapter: {
      invoke: async (input) => {
        // DeepAgents converts a thrown tool error into a ToolMessage. The
        // side-effect guard must still fail the shell turn after invoke returns.
        input.effects.fail(new Error("coaching delivery was not accepted"));
        return {
          reply: "model continued after the tool error",
          traceId: "trace_failed_egress",
          model: "model",
          bundleVersion: "floor_v1",
        };
      },
    },
  });

  const result = await turn({
    userId: "user_1",
    threadId: "user_1",
    body: "monitor",
    trigger: "perception_event",
    windowId: "11111111-1111-4111-8111-111111111111",
    evidenceCursorStart: 4,
    evidenceCursorEnd: 8,
    evidenceVersion: "11111111-1111-4111-8111-111111111111:4-8",
    floor: () => Promise.resolve(floor("floor_v1")),
    onSuccess: () => [assert.fail("failed coaching delivery must not advance the evidence cursor")],
    onFailure: (error) => {
      assert.match(String(error), /delivery was not accepted/);
      return { queries: [attemptQuery], rethrow: false };
    },
  });

  assert.equal(result, null);
  assert.deepEqual(transactions, [[attemptQuery, anchorQuery]]);
  assert.equal(turnRecords[0].status, "failed");
  assert.equal(turnRecords[0].evidenceCursorStart, 4);
  assert.equal(turnRecords[0].evidenceCursorEnd, 8);
});

test("a failed Coaching Turn persists only a content-free error type", async () => {
  const ocrSecret = "OCR_SECRET_runtime_turns_must_not_retain_7f43c9";
  const turnRecords = [];
  const turn = createTurn({
    sql: { transaction: async (queries) => queries },
    runtimeTurns: {
      recordQuery: (record) => {
        turnRecords.push(record);
        return Promise.resolve([{ id: "turn_1" }]);
      },
    },
    fallbackModel: "fallback-model",
    workingContext: async (input) => ({
      userId: input.userId,
      threadId: input.threadId,
      body: input.body,
      trigger: input.trigger,
      pinnedFloor: input.floor,
      userProfile: "",
    }),
    adapter: {
      invoke: async () => {
        const error = new TypeError(`provider rejected OCR evidence: ${ocrSecret}`);
        error.code = `SECRET_CODE:${ocrSecret}`;
        error.cause = new Error(`secret cause: ${ocrSecret}`);
        throw error;
      },
    },
  });

  const result = await turn({
    userId: "user_1",
    threadId: "user_1",
    body: "monitor",
    trigger: "perception_event",
    windowId: "11111111-1111-4111-8111-111111111111",
    evidenceCursorStart: 4,
    evidenceCursorEnd: 8,
    evidenceVersion: "11111111-1111-4111-8111-111111111111:4-8",
    recentPerception: `Visible screen text: ${ocrSecret}`,
    floor: () => Promise.resolve(floor("floor_v1")),
    onSuccess: () => {
      throw new Error("unexpected success policy");
    },
    onFailure: (error) => {
      assert.match(String(error), new RegExp(ocrSecret));
      return { queries: [], rethrow: false };
    },
  });

  assert.equal(result, null);
  assert.equal(turnRecords[0].error, "TypeError");
  assert.doesNotMatch(JSON.stringify(turnRecords[0]), new RegExp(ocrSecret));
});

test("turn execution rethrows after recording failure rows when policy requires containment upstream", async () => {
  const failureQuery = Promise.resolve([{ failed: true }]);
  const anchorQuery = Promise.resolve([{ id: "turn_1" }]);
  const transactions = [];
  const turn = createTurn({
    sql: { transaction: async (queries) => transactions.push(queries) },
    runtimeTurns: { recordQuery: () => anchorQuery },
    fallbackModel: "fallback-model",
    workingContext: async (input) => ({
      userId: input.userId,
      threadId: input.threadId,
      body: input.body,
      trigger: input.trigger,
      pinnedFloor: input.floor,
      userProfile: "",
    }),
    adapter: {
      invoke: async () => {
        throw new Error("model unavailable");
      },
    },
  });

  await assert.rejects(
    turn({
      userId: "user_1",
      threadId: "thread_1",
      body: "hello",
      trigger: "user_message",
      floor: () => Promise.resolve(floor("floor_v1")),
      onSuccess: () => {
        throw new Error("unexpected success policy");
      },
      onFailure: () => ({ queries: [failureQuery], rethrow: true }),
    }),
    /model unavailable/,
  );

  assert.deepEqual(transactions, [[failureQuery, anchorQuery]]);
});

test("a floor-resolution failure flows through the failure path with no adapter call", async () => {
  const anchorQuery = Promise.resolve([{ id: "turn_1" }]);
  const transactions = [];
  const turnRecords = [];
  let invoked = false;
  let assembled = false;
  const turn = createTurn({
    sql: { transaction: async (queries) => transactions.push(queries) },
    runtimeTurns: {
      recordQuery: (record) => {
        turnRecords.push(record);
        return anchorQuery;
      },
    },
    fallbackModel: "fallback-model",
    workingContext: async () => {
      assembled = true;
      throw new Error("working context should not run");
    },
    adapter: {
      invoke: async () => {
        invoked = true;
        throw new Error("adapter should not run");
      },
    },
  });

  const result = await turn({
    userId: "user_1",
    threadId: "thread_1",
    body: "hello",
    trigger: "heartbeat",
    floor: () => Promise.reject(new Error("floor unavailable")),
    onSuccess: () => {
      throw new Error("unexpected success policy");
    },
    onFailure: (error) => {
      assert.match(String(error), /floor unavailable/);
      return { queries: [], rethrow: false };
    },
  });

  assert.equal(assembled, false);
  assert.equal(invoked, false);
  assert.equal(result, null);
  assert.deepEqual(transactions, [[anchorQuery]]);
  assert.equal(turnRecords[0].status, "failed");
  assert.equal(turnRecords[0].error, "Error");
});

test("turn execution invokes onTurnCommitted with the user id after a successful anchor commit", async () => {
  const committed = [];
  const anchorQuery = Promise.resolve([{ id: "turn_1" }]);
  const turn = createTurn({
    sql: { transaction: async (queries) => queries },
    runtimeTurns: { recordQuery: () => anchorQuery },
    fallbackModel: "fallback-model",
    workingContext: async (input) => ({
      userId: input.userId,
      threadId: input.threadId,
      body: input.body,
      trigger: input.trigger,
      pinnedFloor: input.floor,
      userProfile: "",
    }),
    adapter: {
      invoke: async () => ({ reply: "", traceId: "t", model: "m", bundleVersion: "v" }),
    },
    onTurnCommitted: (userId) => committed.push(userId),
  });

  await turn({
    userId: "user_ok",
    threadId: "thread_1",
    body: "hello",
    trigger: "user_message",
    floor: () => Promise.resolve(floor("floor_v1")),
    onSuccess: () => [Promise.resolve([{ ok: true }])],
    onFailure: () => {
      throw new Error("no failure expected");
    },
  });

  assert.deepEqual(committed, ["user_ok"]);
});

test("turn execution invokes onTurnCommitted even on the failed-anchor path", async () => {
  const committed = [];
  const anchorQuery = Promise.resolve([{ id: "turn_1" }]);
  const turn = createTurn({
    sql: { transaction: async (queries) => queries },
    runtimeTurns: { recordQuery: () => anchorQuery },
    fallbackModel: "fallback-model",
    workingContext: async (input) => ({
      userId: input.userId,
      threadId: input.threadId,
      body: input.body,
      trigger: input.trigger,
      pinnedFloor: input.floor,
      userProfile: "",
    }),
    adapter: {
      invoke: async () => {
        throw new Error("model unavailable");
      },
    },
    onTurnCommitted: (userId) => committed.push(userId),
  });

  await turn({
    userId: "user_fail",
    threadId: "thread_1",
    body: "hello",
    trigger: "cron",
    floor: () => Promise.resolve(floor("floor_v1")),
    onSuccess: () => {
      throw new Error("no success expected");
    },
    onFailure: () => ({ queries: [Promise.resolve([{ failed: true }])], rethrow: false }),
  });

  assert.deepEqual(committed, ["user_fail"]);
});

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
