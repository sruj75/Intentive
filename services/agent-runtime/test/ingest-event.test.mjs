import assert from "node:assert/strict";
import test from "node:test";

import { createIngestEvent } from "../dist/index.js";

const session = {
  userId: "00000000-0000-4000-8000-000000000001",
  clientKind: "mobile",
  agentInstanceId: "00000000-0000-4000-8000-000000000010",
};

test("ingest processes a newly recorded event once", async () => {
  const records = [];
  const processed = [];
  const ingest = createIngestEvent({
    ledger: {
      recordIfNew: async (record) => {
        records.push(record);
        return { isNew: true };
      },
    },
    processor: async (seenSession, event) => {
      processed.push({ seenSession, event });
    },
  });

  const event = userMessage("message_1");
  const recorded = await ingest.recordIfNew(session, event);
  await ingest.process(recorded);

  assert.deepEqual(records, [
    {
      userId: session.userId,
      kind: "user_message",
      dedupKey: "message_1",
      payload: event,
    },
  ]);
  assert.deepEqual(processed, [{ seenSession: session, event }]);
});

test("ingest drops duplicate events before processing", async () => {
  let processorCalls = 0;
  const ingest = createIngestEvent({
    ledger: { recordIfNew: async () => ({ isNew: false }) },
    processor: async () => {
      processorCalls += 1;
    },
  });

  const recorded = await ingest.recordIfNew(session, userMessage("message_1"));

  assert.equal(recorded, null);
  assert.equal(processorCalls, 0);
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
    },
    processor: async () => undefined,
    newDedupKey: () => keys.shift(),
  });

  await ingest.recordIfNew(session, userMessage("message_1"));
  await ingest.recordIfNew(session, {
    type: "context_snapshot",
    snapshot_id: "snapshot_1",
    captured_at: "2026-06-09T00:00:00.000Z",
    period_start: "2026-06-08T23:55:00.000Z",
    period_end: "2026-06-09T00:00:00.000Z",
    summary: "screen summary",
  });
  await ingest.recordIfNew(session, {
    type: "session_end_marker",
    ended_at: "2026-06-09T00:01:00.000Z",
    reason: "quit",
  });
  await ingest.recordIfNew(session, {
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
