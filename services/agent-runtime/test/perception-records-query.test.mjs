import assert from "node:assert/strict";
import test from "node:test";

import { createPerceptionRecordsRepo, toPerceptionRecord } from "../dist/index.js";

const userId = "00000000-0000-4000-8000-000000000001";

test("content reconciliation invalidates an embedding only when its source content changes", () => {
  const calls = [];
  const repo = createPerceptionRecordsRepo(capturingSql(calls));

  repo.appendQuery(toPerceptionRecord(userId, perceptionEvent(true)));

  const statement = calls[0].text;
  assert.match(statement, /embedding_model_id\s*=\s*CASE/i);
  assert.match(statement, /embedding_dim\s*=\s*CASE/i);
  assert.match(statement, /embedding\s*=\s*CASE/i);
  assert.match(statement, /summary\s+IS\s+DISTINCT\s+FROM\s+excluded\.summary/i);
  assert.match(statement, /signals\s+IS\s+DISTINCT\s+FROM\s+excluded\.signals/i);
});

test("embedding storage is conditional on the projected content used to compute it", async () => {
  const calls = [];
  const repo = createPerceptionRecordsRepo(capturingSql(calls));
  const expectedRecord = toPerceptionRecord(userId, perceptionEvent(false));

  await repo.storeEmbedding({
    modelId: "test-model",
    vector: [1, 0, 0],
    expectedRecord,
  });

  const statement = calls[0].text;
  assert.match(statement, /artifact_type\s*=\s*/i);
  assert.match(statement, /summary\s*=\s*/i);
  assert.match(statement, /signals\s*=\s*.*::jsonb/is);
});

function capturingSql(calls) {
  return (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return Promise.resolve([]);
  };
}

function perceptionEvent(contentRedacted) {
  return {
    type: "perception_event",
    event_id: "perception_1",
    source_client: "desktop",
    captured_at: "2026-07-23T00:00:00.000Z",
    period_start: "2026-07-22T23:55:00.000Z",
    period_end: "2026-07-23T00:00:00.000Z",
    artifact_type: "searchable_screen_record",
    summary: contentRedacted ? "redacted view" : "payroll secret 1234",
    signals: {
      content_redacted: contentRedacted,
      bundle_id: "com.example.Secret",
      app_name: "Secret",
      ...(contentRedacted
        ? {}
        : {
            window_title: "payroll secret 1234",
            ocr_text: "payroll secret 1234",
          }),
    },
    sensitivity_label: "secret_detected",
    retention_class: "screen_memory_30d",
    confidence: 0.9,
    expires_at: "2099-07-23T00:00:00.000Z",
    local_record_ref: "screen-memory://perception_1",
  };
}
