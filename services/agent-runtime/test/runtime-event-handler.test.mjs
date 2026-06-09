import assert from "node:assert/strict";
import test from "node:test";

import { createIngestEvent, createRuntimeIngressHandler, createUserQueue } from "../dist/index.js";

const session = {
  userId: "00000000-0000-4000-8000-000000000001",
  clientKind: "mobile",
  agentInstanceId: "00000000-0000-4000-8000-000000000010",
};

test("runtime ingress writes the ledger before queueing and does not enqueue duplicates", async () => {
  const queue = createUserQueue();
  const ledgerRecords = [];
  const processed = [];
  let releaseFirstProcessor;
  const firstProcessorGate = new Promise((resolve) => {
    releaseFirstProcessor = resolve;
  });
  const ingest = createIngestEvent({
    ledger: {
      recordIfNew: async (record) => {
        ledgerRecords.push(record);
        return { isNew: ledgerRecords.length === 1 };
      },
    },
    processor: async (_session, event) => {
      processed.push(event.message_id);
      await firstProcessorGate;
    },
  });
  const handleRuntimeIngress = createRuntimeIngressHandler({ ingest, queue });

  const first = handleRuntimeIngress(session, userMessage("message_1"));
  await waitFor(() => processed.length === 1);

  await handleRuntimeIngress(session, userMessage("message_1"));

  assert.equal(ledgerRecords.length, 2);
  assert.deepEqual(processed, ["message_1"]);

  releaseFirstProcessor();
  await first;
});

function userMessage(messageId) {
  return {
    type: "user_message",
    message_id: messageId,
    body: "hello",
    sent_at: "2026-06-09T00:00:00.000Z",
  };
}

async function waitFor(predicate) {
  for (let i = 0; i < 20; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.equal(predicate(), true);
}
