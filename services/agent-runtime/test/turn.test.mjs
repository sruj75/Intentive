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

  await turn({
    userId: "user_1",
    threadId: "thread_1",
    body: "hello",
    trigger: "user_message",
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
  // The spine appends the runtime_turns anchor *after* the caller's rows.
  assert.deepEqual(transactions, [[successQuery, anchorQuery]]);
  assert.deepEqual(turnRecords, [
    {
      userId: "user_1",
      threadId: "thread_1",
      traceId: "trace_1",
      model: "model",
      bundleVersion: "floor_v1",
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
      status: "failed",
      error: "model unavailable",
    },
  ]);
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

  await turn({
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
  assert.deepEqual(transactions, [[anchorQuery]]);
  assert.equal(turnRecords[0].status, "failed");
  assert.equal(turnRecords[0].error, "floor unavailable");
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
