import assert from "node:assert/strict";
import test from "node:test";

import { createTurnRunner } from "../dist/index.js";

const session = {
  userId: "00000000-0000-4000-8000-000000000001",
  clientKind: "mobile",
  agentInstanceId: "00000000-0000-4000-8000-000000000010",
  pinnedFloor: floor("floor_v1"),
  capabilities: [],
};
const coachingWindowId = "11111111-1111-4111-8111-111111111111";
const coachingSession = {
  ...session,
  clientKind: "desktop",
  capabilities: ["desktop_coaching_v1"],
};

test("runTurn writes the companion reply and ok Runtime Turn in one transaction", async () => {
  const queries = {
    companion: Promise.resolve([{ companion: true }]),
    bootstrap: Promise.resolve([{ bootstrap: "completed" }]),
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
    bootstrap: {
      prepareInteractive: async (_userId, eligible) => ({
        firstRun: eligible,
        transitionOnSuccessQuery: () => (eligible ? queries.bootstrap : null),
      }),
    },
    isBootstrapReplyEligible: async (_session, event) => event.window_id === coachingWindowId,
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

  await runTurn(coachingSession, userMessage("message_1", "hello", coachingWindowId));

  assert.equal(typeof adapterCalls[0].effects.fail, "function");
  assert.equal(typeof adapterCalls[0].effects.assertSucceeded, "function");
  const { effects: _effects, ...adapterCall } = adapterCalls[0];
  assert.deepEqual(adapterCall, {
    userId: session.userId,
    threadId: session.userId,
    body: "hello",
    trigger: "user_message",
    pinnedFloor: floor("floor_v1"),
    userProfile: "likes direct answers",
    recentPerception: "Most recent perception: reviewing a design doc",
    firstRun: true,
  });
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
      windowId: null,
      trigger: "user_message",
      evidenceCursorStart: null,
      evidenceCursorEnd: null,
      evidenceVersion: null,
      status: "ok",
      error: null,
    },
  ]);
  assert.deepEqual(transactions, [[queries.companion, queries.bootstrap, queries.turn]]);
});

test("a Mobile message cannot receive or complete Desktop bootstrap", async () => {
  const adapterCalls = [];
  let completionQueries = 0;
  const runTurn = createTurnRunner({
    bootstrap: {
      prepareInteractive: async (_userId, eligible) => ({
        firstRun: eligible,
        transitionOnSuccessQuery: () => {
          if (!eligible) {
            return null;
          }
          completionQueries += 1;
          return Promise.resolve([]);
        },
      }),
    },
    isBootstrapReplyEligible: async () => false,
    sql: { transaction: async () => [] },
    adapter: {
      invoke: async (input) => {
        adapterCalls.push(input);
        return {
          reply: "ordinary reply",
          traceId: "trace_1",
          model: "test-model",
          bundleVersion: "floor_v1",
        };
      },
    },
    conversation: { appendQuery: () => Promise.resolve([]) },
    runtimeTurns: { recordQuery: () => Promise.resolve([]) },
    newMessageId: () => "companion_1",
    fallbackModel: "fallback-model",
  });

  await runTurn(session, userMessage("message_1", "hello"));

  assert.equal(Object.hasOwn(adapterCalls[0], "firstRun"), false);
  assert.equal(completionQueries, 0);
});

test("a Desktop message after its Coaching Window closes cannot complete bootstrap", async () => {
  const adapterCalls = [];
  let completionQueries = 0;
  const runTurn = createTurnRunner({
    bootstrap: {
      prepareInteractive: async (_userId, eligible) => ({
        firstRun: eligible,
        transitionOnSuccessQuery: () => {
          if (!eligible) {
            return null;
          }
          completionQueries += 1;
          return Promise.resolve([]);
        },
      }),
    },
    // The message was sent with the old window correlation, but the live and
    // durable window checks in main have already observed its close.
    isBootstrapReplyEligible: async () => false,
    sql: { transaction: async () => [] },
    adapter: {
      invoke: async (input) => {
        adapterCalls.push(input);
        return {
          reply: "ordinary reply",
          traceId: "trace_1",
          model: "test-model",
          bundleVersion: "floor_v1",
        };
      },
    },
    conversation: { appendQuery: () => Promise.resolve([]) },
    runtimeTurns: { recordQuery: () => Promise.resolve([]) },
    newMessageId: () => "companion_1",
    fallbackModel: "fallback-model",
  });

  await runTurn(coachingSession, userMessage("message_1", "late reply", coachingWindowId));

  assert.equal(Object.hasOwn(adapterCalls[0], "firstRun"), false);
  assert.equal(completionQueries, 0);
});

test("runTurn delivers the persisted companion reply after a successful transaction", async () => {
  const deliveries = [];
  const runTurn = createTurnRunner({
    bootstrap: completedBootstrap(),
    isBootstrapReplyEligible: async () => false,
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
      deliverReply: async (message) => deliveries.push(message),
    },
    newMessageId: () => "companion_1",
    fallbackModel: "fallback-model",
  });

  await runTurn(session, userMessage("message_1", "hello"));

  assert.deepEqual(deliveries, [
    {
      userId: session.userId,
      messageId: "companion_1",
      body: "hello from Companion",
    },
  ]);
});

test("runTurn omits recentPerception when no Sensory Buffer reader is injected", async () => {
  const adapterCalls = [];
  const runTurn = createTurnRunner({
    bootstrap: completedBootstrap(),
    isBootstrapReplyEligible: async () => false,
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
  assert.equal(Object.hasOwn(adapterCalls[0], "firstRun"), false);
});

test("runTurn records a failed Runtime Turn when invoke fails", async () => {
  const turnQuery = Promise.resolve([{ turn: true }]);
  const transactions = [];
  const companionEntries = [];
  const turnRecords = [];
  let completionQueries = 0;
  const runTurn = createTurnRunner({
    bootstrap: {
      prepareInteractive: async (_userId, eligible) => ({
        firstRun: eligible,
        transitionOnSuccessQuery: () => {
          if (!eligible) {
            return null;
          }
          completionQueries += 1;
          return Promise.resolve([]);
        },
      }),
    },
    isBootstrapReplyEligible: async () => true,
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
  assert.equal(completionQueries, 0);
  // The failed turn has no persisted companion reply and therefore no delivery.
  assert.deepEqual(turnRecords, [
    {
      userId: session.userId,
      threadId: session.userId,
      traceId: null,
      model: "fallback-model",
      bundleVersion: null,
      windowId: null,
      trigger: "user_message",
      evidenceCursorStart: null,
      evidenceCursorEnd: null,
      evidenceVersion: null,
      status: "failed",
      error: "Error",
    },
  ]);
  assert.deepEqual(transactions, [[turnQuery]]);
});

function userMessage(messageId, body, windowId) {
  return {
    type: "user_message",
    message_id: messageId,
    body,
    sent_at: "2026-06-09T00:00:00.000Z",
    ...(windowId ? { window_id: windowId } : {}),
  };
}

function completedBootstrap() {
  return {
    prepareInteractive: async () => ({
      firstRun: false,
      transitionOnSuccessQuery: () => null,
    }),
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
