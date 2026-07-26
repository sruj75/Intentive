import assert from "node:assert/strict";
import test from "node:test";

import { createPerceptionRecordsRepo, toPerceptionRecord } from "../dist/index.js";

const userId = "00000000-0000-4000-8000-000000000001";

test("content reconciliation invalidates an embedding when any rendered input or redaction changes", () => {
  const calls = [];
  const repo = createPerceptionRecordsRepo(capturingSql(calls));

  repo.appendQuery(toPerceptionRecord(userId, perceptionEvent(true)));

  const statement = calls[0].text;
  assert.match(statement, /embedding_model_id\s*=\s*CASE/i);
  assert.match(statement, /embedding_dim\s*=\s*CASE/i);
  assert.match(statement, /embedding\s*=\s*CASE/i);
  assert.match(statement, /summary\s+IS\s+DISTINCT\s+FROM\s+excluded\.summary/i);
  assert.match(statement, /signals\s+IS\s+DISTINCT\s+FROM\s+excluded\.signals/i);
  assert.match(statement, /app_name\s+IS\s+DISTINCT\s+FROM\s+excluded\.app_name/i);
  assert.match(statement, /window_title\s+IS\s+DISTINCT\s+FROM\s+excluded\.window_title/i);
  assert.match(statement, /ocr_text\s+IS\s+DISTINCT\s+FROM\s+excluded\.ocr_text/i);
  assert.match(statement, /content_redacted\s+IS\s+DISTINCT\s+FROM\s+excluded\.content_redacted/i);
});

test("a permitted retry cannot restore detailed content after a redacted re-emission", () => {
  const calls = [];
  const repo = createPerceptionRecordsRepo(capturingSql(calls));

  repo.appendQuery(toPerceptionRecord(userId, perceptionEvent(false)));

  const statement = calls[0].text;
  assert.match(
    statement,
    /summary\s*=\s*CASE[\s\S]*perception_records\.content_redacted[\s\S]*perception_records\.summary/i,
  );
  assert.match(
    statement,
    /signals\s*=\s*CASE[\s\S]*perception_records\.content_redacted[\s\S]*perception_records\.signals/i,
  );
  assert.match(statement, /window_title\s*=\s*CASE[\s\S]*content_redacted[\s\S]*THEN NULL/i);
  assert.match(statement, /ocr_text\s*=\s*CASE[\s\S]*content_redacted[\s\S]*THEN NULL/i);
  assert.match(
    statement,
    /content_redacted\s*=\s*perception_records\.content_redacted\s+OR\s+excluded\.content_redacted/i,
  );
});

test("a late duplicate cannot recreate an event removed by a later tombstone", () => {
  const calls = [];
  const repo = createPerceptionRecordsRepo(capturingSql(calls));

  repo.appendQuery(toPerceptionRecord(userId, perceptionEvent(false)));

  const statement = calls[0].text;
  assert.match(
    statement,
    /FROM\s+agent_runtime\.runtime_events\s+AS\s+incoming[\s\S]*incoming\.kind\s*=\s*'perception_event'[\s\S]*incoming\.dedup_key/i,
  );
  assert.match(
    statement,
    /tombstone\.kind\s*=\s*'perception_tombstone'[\s\S]*tombstone\.ingest_seq\s*>\s*incoming\.ingest_seq/i,
  );
  assert.match(statement, /tombstone\.payload\s*->>\s*'reason'\s*=\s*'clear_all'/i);
  assert.match(statement, /tombstone\.payload\s*->\s*'event_refs'[\s\S]*jsonb_build_array/i);
});

test("embedding candidates are read only when the current projection still matches the input", async () => {
  const calls = [];
  const repo = createPerceptionRecordsRepo(capturingSql(calls));
  const expectedRecord = toPerceptionRecord(userId, perceptionEvent(false));

  assert.equal(await repo.readEmbeddingCandidate(expectedRecord), null);

  const statement = calls[0].text;
  assert.match(statement, /WHERE\s+user_id\s*=/i);
  assert.match(statement, /AND\s+event_id\s*=/i);
  assert.match(statement, /AND\s+artifact_type\s*=/i);
  assert.match(statement, /AND\s+summary\s*=/i);
  assert.match(statement, /AND\s+signals\s*=\s*.*::jsonb/is);
  assert.match(statement, /AND\s+app_name\s+IS\s+NOT\s+DISTINCT\s+FROM/i);
  assert.match(statement, /AND\s+window_title\s+IS\s+NOT\s+DISTINCT\s+FROM/i);
  assert.match(statement, /AND\s+ocr_text\s+IS\s+NOT\s+DISTINCT\s+FROM/i);
  assert.match(statement, /AND\s+content_redacted\s*=/i);
  assert.match(statement, /AND\s+expires_at\s*=/i);
  assert.match(statement, /AND\s+expires_at\s*>\s*now\(\)/i);
});

test("embedding storage compare-and-sets every rendered input and the live projection identity", async () => {
  const calls = [];
  const repo = createPerceptionRecordsRepo(capturingSql(calls));
  const expectedRecord = toPerceptionRecord(userId, perceptionEvent(false));

  await repo.storeEmbedding({
    modelId: "test-model",
    vector: [1, 0, 0],
    expectedRecord: {
      ...expectedRecord,
      projectionId: "00000000-0000-4000-8000-000000000099",
    },
  });

  const statement = calls[0].text;
  assert.match(statement, /WHERE\s+id\s*=/i);
  assert.match(statement, /artifact_type\s*=\s*/i);
  assert.match(statement, /summary\s*=\s*/i);
  assert.match(statement, /signals\s*=\s*.*::jsonb/is);
  assert.match(statement, /app_name\s+IS\s+NOT\s+DISTINCT\s+FROM/i);
  assert.match(statement, /window_title\s+IS\s+NOT\s+DISTINCT\s+FROM/i);
  assert.match(statement, /ocr_text\s+IS\s+NOT\s+DISTINCT\s+FROM/i);
  assert.match(statement, /content_redacted\s*=/i);
  assert.match(statement, /expires_at\s*=/i);
  assert.match(statement, /expires_at\s*>\s*now\(\)/i);
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
