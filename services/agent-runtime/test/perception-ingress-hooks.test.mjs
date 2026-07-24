import assert from "node:assert/strict";
import test from "node:test";

import { createPerceptionIngressHooks, createPerUserChannel } from "../dist/index.js";

const session = {
  userId: "00000000-0000-4000-8000-000000000001",
  clientKind: "desktop",
  agentInstanceId: "00000000-0000-4000-8000-000000000010",
  pinnedFloor: {
    version: "floor_v1",
    documents: {
      SOUL: "soul",
      AGENTS: "agents",
      BOOTSTRAP: "bootstrap",
      HEARTBEAT: "heartbeat",
    },
    langfusePrompts: [],
  },
};

test("embedding enrichment cannot consume or delay the perception Monitoring Turn", async () => {
  const seen = [];
  let releaseEmbedding;
  const embeddingGate = new Promise((resolve) => {
    releaseEmbedding = resolve;
  });
  let channel;
  const hooks = createPerceptionIngressHooks({
    embedder: {
      modelId: "test-model",
      dim: 3,
      embed: async () => {
        seen.push("embedding:start");
        await embeddingGate;
        seen.push("embedding:end");
        return [1, 0, 0];
      },
    },
    storeEmbedding: async (input) => {
      seen.push(["stored", input]);
    },
    enqueueMonitoring: (userId) => {
      return channel.enqueueBestEffort(userId, () => {
        seen.push(["monitoring", userId]);
      });
    },
    onEmbeddingError: (error) => {
      throw error;
    },
  });
  const event = perceptionEvent();
  channel = createPerUserChannel({
    sql: { transaction: async () => [[{ id: "ledger_1" }]] },
    ledger: { recordQuery: () => Promise.resolve([{ id: "ledger_1" }]) },
    conversation: {
      readSnapshot: async () => ({ messages: [], before_cursor: null }),
    },
    project: () => [],
    ...hooks,
  });

  await channel.accept(session, event);
  await waitFor(() => seen.includes("embedding:start"));
  await waitFor(() => seen.some((item) => Array.isArray(item) && item[0] === "monitoring"));

  assert.deepEqual(seen, ["embedding:start", ["monitoring", session.userId]]);

  releaseEmbedding();
  await waitFor(() => seen.some((item) => Array.isArray(item) && item[0] === "stored"));
  assert.equal(seen.at(-1)[1].expectedRecord.summary, event.summary);
});

function perceptionEvent() {
  return {
    type: "perception_event",
    event_id: "perception_1",
    source_client: "desktop",
    captured_at: "2026-07-23T00:00:00.000Z",
    period_start: "2026-07-22T23:55:00.000Z",
    period_end: "2026-07-23T00:00:00.000Z",
    artifact_type: "searchable_screen_record",
    summary: "planning",
    signals: {
      content_redacted: false,
      bundle_id: "com.example.Editor",
      app_name: "Editor",
      window_title: "Plan",
      ocr_text: "planning",
    },
    sensitivity_label: "normal",
    retention_class: "screen_memory_30d",
    confidence: 0.9,
    expires_at: "2099-07-23T00:00:00.000Z",
    local_record_ref: "screen-memory://perception_1",
  };
}

async function waitFor(predicate) {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.equal(predicate(), true);
}
