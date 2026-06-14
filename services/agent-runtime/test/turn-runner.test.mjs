import assert from "node:assert/strict";
import test from "node:test";

import { createTurnRunner } from "../dist/index.js";

const session = {
  userId: "00000000-0000-4000-8000-000000000001",
  clientKind: "mobile",
  agentInstanceId: "00000000-0000-4000-8000-000000000010",
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
        return { reply: "hello from Companion", traceId: "trace_1", model: "test-model" };
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
  });

  await runTurn(session, userMessage("message_1", "hello"));

  assert.deepEqual(adapterCalls, [{ threadId: session.userId, body: "hello" }]);
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
      status: "ok",
      error: null,
    },
  ]);
  assert.deepEqual(transactions, [[queries.companion, queries.turn]]);
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
  assert.deepEqual(turnRecords, [
    {
      userId: session.userId,
      threadId: session.userId,
      traceId: null,
      model: "fallback-model",
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
