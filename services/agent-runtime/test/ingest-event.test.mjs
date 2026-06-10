import assert from "node:assert/strict";
import test from "node:test";

import { createIngestEvent } from "../dist/index.js";

const session = {
  userId: "00000000-0000-4000-8000-000000000001",
  clientKind: "mobile",
  agentInstanceId: "00000000-0000-4000-8000-000000000010",
};

test("ingest builds the ledger query before projection queries", async () => {
  const records = [];
  const projectionQueries = [Promise.resolve([{ projection: true }])];
  const ingest = createIngestEvent({
    ledger: {
      recordQuery: (record) => {
        records.push(record);
        return Promise.resolve([{ id: "ledger_1" }]);
      },
    },
    project: () => projectionQueries,
  });

  const event = userMessage("message_1");
  const queries = ingest.queriesFor(session, event);

  assert.deepEqual(records, [
    {
      userId: session.userId,
      kind: "user_message",
      dedupKey: "message_1",
      payload: event,
    },
  ]);
  assert.equal(queries.length, 2);
  assert.equal(queries[1], projectionQueries[0]);
});

test("ingest derives stable keys for message and snapshot events and minted keys for end markers", async () => {
  const records = [];
  const keys = ["end_1", "end_2"];
  const ingest = createIngestEvent({
    ledger: {
      recordIfNew: async (record) => {
        records.push(record);
        return { isNew: true };
      },
      recordQuery: (record) => {
        records.push(record);
        return Promise.resolve([{ id: "ledger_1" }]);
      },
    },
    newDedupKey: () => keys.shift(),
  });

  ingest.queriesFor(session, userMessage("message_1"));
  ingest.queriesFor(session, {
    type: "context_snapshot",
    snapshot_id: "snapshot_1",
    captured_at: "2026-06-09T00:00:00.000Z",
    period_start: "2026-06-08T23:55:00.000Z",
    period_end: "2026-06-09T00:00:00.000Z",
    summary: "screen summary",
  });
  ingest.queriesFor(session, {
    type: "session_end_marker",
    ended_at: "2026-06-09T00:01:00.000Z",
    reason: "quit",
  });
  ingest.queriesFor(session, {
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

function userMessage(messageId) {
  return {
    type: "user_message",
    message_id: messageId,
    body: "hello",
    sent_at: "2026-06-09T00:00:00.000Z",
  };
}
