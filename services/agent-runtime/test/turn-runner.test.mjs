import assert from "node:assert/strict";
import test from "node:test";

import { createTurnRunner } from "../dist/index.js";

const session = {
  userId: "00000000-0000-4000-8000-000000000001",
  clientKind: "mobile",
  agentInstanceId: "00000000-0000-4000-8000-000000000010",
  pinnedFloor: floor("floor_v1"),
};

test("runTurn writes the companion reply and ok Runtime Turn in one transaction", async () => {
  const queries = {
    companion: Promise.resolve([{ companion: true }]),
    turn: Promise.resolve([{ turn: true }]),
  };
  const transactions = [];
  const adapterCalls = [];
  const companionEntries = [];
  const turnRecords = [];
  const runTurn = createTurnRunner({
    sql: {
      transaction: async (queryBatch) => {
        transactions.push(queryBatch);
        return [];
      },
    },
    adapter: {
      invoke: async (input) => {
        adapterCalls.push(input);
        return {
          reply: "hello from Companion",
          traceId: "trace_1",
          model: "test-model",
          bundleVersion: "floor_v1",
        };
      },
    },
    conversation: {
      appendQuery: (entry) => {
        companionEntries.push(entry);
        return queries.companion;
      },
    },
    runtimeTurns: {
      recordQuery: (record) => {
        turnRecords.push(record);
        return queries.turn;
      },
    },
    newMessageId: () => "companion_1",
    fallbackModel: "fallback-model",
    readUserProfile: async () => "likes direct answers",
    readRecentPerception: async () => "Most recent perception: reviewing a design doc",
  });

  await runTurn(session, userMessage("message_1", "hello"));

  assert.deepEqual(adapterCalls, [
    {
      userId: session.userId,
      threadId: session.userId,
      body: "hello",
      trigger: "user_message",
      pinnedFloor: floor("floor_v1"),
      userProfile: "likes direct answers",
      recentPerception: "Most recent perception: reviewing a design doc",
    },
  ]);
  assert.deepEqual(companionEntries, [
    {
      userId: session.userId,
      messageId: "companion_1",
      author: "companion",
      body: "hello from Companion",
      viaPostMessageBack: false,
    },
  ]);
  assert.deepEqual(turnRecords, [
    {
      userId: session.userId,
      threadId: session.userId,
      traceId: "trace_1",
      model: "test-model",
      bundleVersion: "floor_v1",
      status: "ok",
      error: null,
    },
  ]);
  assert.deepEqual(transactions, [[queries.companion, queries.turn]]);
});

test("runTurn delivers the persisted companion reply after a successful transaction", async () => {
  const deliveries = [];
  const runTurn = createTurnRunner({
    sql: {
      transaction: async () => [],
    },
    adapter: {
      invoke: async () => ({
        reply: "hello from Companion",
        traceId: "trace_1",
        model: "test-model",
        bundleVersion: "floor_v1",
      }),
    },
    conversation: {
      appendQuery: () => Promise.resolve([]),
    },
    runtimeTurns: {
      recordQuery: () => Promise.resolve([]),
    },
    deliveryPort: {
      deliver: async (message, mode) => deliveries.push([message, mode]),
    },
    newMessageId: () => "companion_1",
    fallbackModel: "fallback-model",
  });

  await runTurn(session, userMessage("message_1", "hello"));

  assert.deepEqual(deliveries, [
    [
      {
        userId: session.userId,
        messageId: "companion_1",
        body: "hello from Companion",
      },
      "reply",
    ],
  ]);
});

test("runTurn omits recentPerception when no Sensory Buffer reader is injected", async () => {
  const adapterCalls = [];
  const runTurn = createTurnRunner({
    sql: {
      transaction: async () => [],
    },
    adapter: {
      invoke: async (input) => {
        adapterCalls.push(input);
        return {
          reply: "hello from Companion",
          traceId: "trace_1",
          model: "test-model",
          bundleVersion: "floor_v1",
        };
      },
    },
    conversation: {
      appendQuery: () => Promise.resolve([]),
    },
    runtimeTurns: {
      recordQuery: () => Promise.resolve([]),
    },
    newMessageId: () => "companion_1",
    fallbackModel: "fallback-model",
  });

  await runTurn(session, userMessage("message_1", "hello"));

  assert.equal(Object.hasOwn(adapterCalls[0], "recentPerception"), false);
});

test("runTurn records a failed Runtime Turn when invoke fails", async () => {
  const turnQuery = Promise.resolve([{ turn: true }]);
  const transactions = [];
  const companionEntries = [];
  const turnRecords = [];
  const runTurn = createTurnRunner({
    sql: {
      transaction: async (queryBatch) => {
        transactions.push(queryBatch);
        return [];
      },
    },
    adapter: {
      invoke: async () => {
        throw new Error("model unavailable");
      },
    },
    conversation: {
      appendQuery: (entry) => {
        companionEntries.push(entry);
        return Promise.resolve([]);
      },
    },
    runtimeTurns: {
      recordQuery: (record) => {
        turnRecords.push(record);
        return turnQuery;
      },
    },
    newMessageId: () => "companion_1",
    fallbackModel: "fallback-model",
  });

  await assert.rejects(runTurn(session, userMessage("message_1", "hello")), /model unavailable/);

  assert.deepEqual(companionEntries, []);
  // The failed turn has no persisted companion reply and therefore no delivery.
  assert.deepEqual(turnRecords, [
    {
      userId: session.userId,
      threadId: session.userId,
      traceId: null,
      model: "fallback-model",
      bundleVersion: null,
      status: "failed",
      error: "model unavailable",
    },
  ]);
  assert.deepEqual(transactions, [[turnQuery]]);
});

function userMessage(messageId, body) {
  return {
    type: "user_message",
    message_id: messageId,
    body,
    sent_at: "2026-06-09T00:00:00.000Z",
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
