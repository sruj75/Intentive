import assert from "node:assert/strict";
import test from "node:test";

import { createPerUserChannel } from "../dist/index.js";

const session = {
  userId: "00000000-0000-4000-8000-000000000001",
  clientKind: "mobile",
  agentInstanceId: "00000000-0000-4000-8000-000000000010",
  pinnedFloor: floor("floor_v1"),
};

test("accept commits the ledger marker before projection queries in one transaction", async () => {
  const records = [];
  const transactions = [];
  const ledgerQuery = Promise.resolve([{ id: "ledger_1" }]);
  const projectionQuery = Promise.resolve([{ projection: true }]);

  const channel = createPerUserChannel({
    sql: {
      transaction: async (queries) => {
        transactions.push(queries);
        return [];
      },
    },
    ledger: {
      recordQuery: (record) => {
        records.push(record);
        return ledgerQuery;
      },
    },
    conversation: { readSnapshot: async () => emptySnapshot() },
    project: () => [projectionQuery],
  });

  const event = userMessage("message_1");
  await channel.accept(session, event);

  assert.deepEqual(records, [
    {
      userId: session.userId,
      kind: "user_message",
      dedupKey: "message_1",
      payload: event,
    },
  ]);
  // The single transaction batches the ledger insert first, projection after.
  assert.equal(transactions.length, 1);
  assert.deepEqual(transactions[0], [ledgerQuery, projectionQuery]);
});

test("accept derives stable dedup keys for messages and snapshots and mints them for end markers", async () => {
  const records = [];
  const keys = ["end_1", "end_2"];
  const channel = createPerUserChannel({
    sql: { transaction: async () => [] },
    ledger: {
      recordQuery: (record) => {
        records.push(record);
        return Promise.resolve([{ id: "ledger" }]);
      },
    },
    conversation: { readSnapshot: async () => emptySnapshot() },
    project: () => [],
    newDedupKey: () => keys.shift(),
  });

  await channel.accept(session, userMessage("message_1"));
  await channel.accept(session, {
    type: "context_snapshot",
    snapshot_id: "snapshot_1",
    captured_at: "2026-06-09T00:00:00.000Z",
    period_start: "2026-06-08T23:55:00.000Z",
    period_end: "2026-06-09T00:00:00.000Z",
    summary: "screen summary",
  });
  await channel.accept(session, {
    type: "session_end_marker",
    ended_at: "2026-06-09T00:01:00.000Z",
    reason: "quit",
  });
  await channel.accept(session, {
    type: "session_end_marker",
    ended_at: "2026-06-09T00:02:00.000Z",
    reason: "quit",
  });

  assert.deepEqual(
    records.map((record) => [record.kind, record.dedupKey]),
    [
      ["user_message", "message_1"],
      ["context_snapshot", "snapshot_1"],
      ["session_end_marker", "end_1"],
      ["session_end_marker", "end_2"],
    ],
  );
});

test("a failed transaction stays retryable in submit order", async () => {
  const attempts = [];
  let failOnce = true;
  const channel = createPerUserChannel({
    sql: {
      transaction: async () => {
        if (failOnce) {
          failOnce = false;
          throw new Error("projection failed");
        }
        return [];
      },
    },
    ledger: {
      recordQuery: (record) => {
        attempts.push(record.dedupKey);
        return Promise.resolve([{ id: "ledger" }]);
      },
    },
    conversation: { readSnapshot: async () => emptySnapshot() },
    project: () => [],
  });

  await assert.rejects(channel.accept(session, userMessage("message_1")));
  await channel.accept(session, userMessage("message_1"));

  assert.deepEqual(attempts, ["message_1", "message_1"]);
});

test("a snapshot read submitted behind a pending accept observes it (read-after-write ordering)", async () => {
  const order = [];
  let releaseTransaction;
  const transactionGate = new Promise((resolve) => {
    releaseTransaction = resolve;
  });

  const channel = createPerUserChannel({
    sql: {
      transaction: async () => {
        order.push("accept:start");
        await transactionGate;
        order.push("accept:end");
        return [];
      },
    },
    ledger: { recordQuery: () => Promise.resolve([{ id: "ledger" }]) },
    conversation: {
      readSnapshot: async () => {
        order.push("read");
        return emptySnapshot();
      },
    },
    project: () => [],
  });

  const accepted = channel.accept(session, userMessage("message_1"));
  await waitFor(() => order.includes("accept:start"));

  const read = channel.readSnapshot(session.userId);
  // The read for the same User cannot have run while the write is still pending.
  assert.deepEqual(order, ["accept:start"]);

  releaseTransaction();
  await Promise.all([accepted, read]);

  // It runs strictly after the accepted write settles.
  assert.deepEqual(order, ["accept:start", "accept:end", "read"]);
});

test("turn failures are contained after ingress commits and the user lane keeps draining", async () => {
  const order = [];
  const channel = createPerUserChannel({
    sql: {
      transaction: async () => {
        order.push("ingress");
        return [[{ id: "ledger_1" }]];
      },
    },
    ledger: { recordQuery: () => Promise.resolve([{ id: "ledger" }]) },
    conversation: {
      readSnapshot: async () => {
        order.push("read");
        return emptySnapshot();
      },
    },
    project: () => [],
    onTurnError: () => {},
    runTurn: async () => {
      order.push("turn");
      throw new Error("model failed");
    },
  });

  await assert.doesNotReject(channel.accept(session, userMessage("message_1")));
  await channel.readSnapshot(session.userId);

  assert.deepEqual(order, ["ingress", "turn", "read"]);
});

test("runTurn is called once for a new user message and not for duplicates or non-user events", async () => {
  const turnEvents = [];
  const transactionResults = [[[{ id: "ledger_1" }]], [[]], [[{ id: "ledger_2" }]]];
  const channel = createPerUserChannel({
    sql: {
      transaction: async () => transactionResults.shift(),
    },
    ledger: { recordQuery: () => Promise.resolve([{ id: "ledger" }]) },
    conversation: { readSnapshot: async () => emptySnapshot() },
    project: () => [],
    runTurn: async (_session, event) => {
      turnEvents.push(event);
    },
  });

  const message = userMessage("message_1");
  await channel.accept(session, message);
  await channel.accept(session, message);
  await channel.accept(session, {
    type: "context_snapshot",
    snapshot_id: "snapshot_1",
    captured_at: "2026-06-09T00:00:00.000Z",
    period_start: "2026-06-08T23:55:00.000Z",
    period_end: "2026-06-09T00:00:00.000Z",
    summary: "screen summary",
  });

  assert.deepEqual(turnEvents, [message]);
});

test("cron events use fire-time idempotency and can dispatch a turn without conversation projection", async () => {
  const records = [];
  const projected = [];
  const turnEvents = [];
  const transactionResults = [[[{ id: "cron_ledger" }]], [[]]];
  const channel = createPerUserChannel({
    sql: {
      transaction: async () => transactionResults.shift(),
    },
    ledger: {
      recordQuery: (record) => {
        records.push(record);
        return Promise.resolve([{ id: "ledger" }]);
      },
    },
    conversation: { readSnapshot: async () => emptySnapshot() },
    project: (_session, event) => {
      projected.push(event.type);
      return [];
    },
    runTurn: async (_session, event) => {
      turnEvents.push(event);
    },
  });
  const event = {
    type: "cron",
    job_id: "job_1",
    fire_at: "2026-06-16T00:00:00.000Z",
    body: "wake",
  };

  await channel.accept({ ...session, clientKind: "system" }, event);
  await channel.accept({ ...session, clientKind: "system" }, event);

  assert.deepEqual(
    records.map((record) => record.dedupKey),
    ["cron:job_1:2026-06-16T00:00:00.000Z", "cron:job_1:2026-06-16T00:00:00.000Z"],
  );
  assert.deepEqual(projected, ["cron", "cron"]);
  assert.deepEqual(turnEvents, [event]);
});

test("onPerceptionArrived fires once for new perception events only", async () => {
  const perceptions = [];
  const turnEvents = [];
  const transactionResults = [
    [[{ id: "snapshot_ledger" }]],
    [[]],
    [[{ id: "marker_ledger" }]],
    [[{ id: "message_ledger" }]],
  ];
  const channel = createPerUserChannel({
    sql: {
      transaction: async () => transactionResults.shift(),
    },
    ledger: { recordQuery: () => Promise.resolve([{ id: "ledger" }]) },
    conversation: { readSnapshot: async () => emptySnapshot() },
    project: () => [],
    onPerceptionArrived: (seenSession, event) => {
      perceptions.push([seenSession.userId, event.type]);
    },
    runTurn: async (_session, event) => {
      turnEvents.push(event.type);
    },
  });

  const snapshot = {
    type: "context_snapshot",
    snapshot_id: "snapshot_1",
    captured_at: "2026-06-09T00:00:00.000Z",
    period_start: "2026-06-08T23:55:00.000Z",
    period_end: "2026-06-09T00:00:00.000Z",
    summary: "screen summary",
  };
  await channel.accept(session, snapshot);
  await channel.accept(session, snapshot);
  await channel.accept(session, {
    type: "session_end_marker",
    ended_at: "2026-06-09T00:01:00.000Z",
    reason: "quit",
  });
  await channel.accept(session, userMessage("message_1"));

  assert.deepEqual(perceptions, [
    [session.userId, "context_snapshot"],
    [session.userId, "session_end_marker"],
  ]);
  assert.deepEqual(turnEvents, ["user_message"]);
});

function emptySnapshot() {
  return { messages: [], before_cursor: null };
}

function userMessage(messageId) {
  return {
    type: "user_message",
    message_id: messageId,
    body: "hello",
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

async function waitFor(predicate) {
  for (let i = 0; i < 20; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.equal(predicate(), true);
}
