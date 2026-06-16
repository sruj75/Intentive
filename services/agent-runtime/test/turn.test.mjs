import assert from "node:assert/strict";
import test from "node:test";

import { createTurn } from "../dist/index.js";

test("turn execution assembles context, invokes the adapter, and records success in one transaction", async () => {
  const order = [];
  const successQuery = Promise.resolve([{ ok: true }]);
  const transactions = [];
  const turn = createTurn({
    sql: {
      transaction: async (queries) => {
        order.push("transaction");
        transactions.push(queries);
      },
    },
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
    floor: floor("floor_v1"),
    onSuccess: (output) => {
      order.push(`success:${output.traceId}`);
      return [successQuery];
    },
    onFailure: () => {
      throw new Error("unexpected failure policy");
    },
  });

  assert.deepEqual(order, ["assemble", "invoke", "success:trace_1", "transaction"]);
  assert.deepEqual(transactions, [[successQuery]]);
});

test("turn execution records failure rows and contains the error when policy says not to rethrow", async () => {
  const failureQuery = Promise.resolve([{ failed: true }]);
  const transactions = [];
  const turn = createTurn({
    sql: { transaction: async (queries) => transactions.push(queries) },
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
    floor: floor("floor_v1"),
    onSuccess: () => {
      throw new Error("unexpected success policy");
    },
    onFailure: (error) => {
      assert.match(String(error), /model unavailable/);
      return { queries: [failureQuery], rethrow: false };
    },
  });

  assert.deepEqual(transactions, [[failureQuery]]);
});

test("turn execution rethrows after recording failure rows when policy requires containment upstream", async () => {
  const failureQuery = Promise.resolve([{ failed: true }]);
  const transactions = [];
  const turn = createTurn({
    sql: { transaction: async (queries) => transactions.push(queries) },
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
      floor: floor("floor_v1"),
      onSuccess: () => {
        throw new Error("unexpected success policy");
      },
      onFailure: () => ({ queries: [failureQuery], rethrow: true }),
    }),
    /model unavailable/,
  );

  assert.deepEqual(transactions, [[failureQuery]]);
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
