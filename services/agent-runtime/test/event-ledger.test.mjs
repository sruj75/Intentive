import assert from "node:assert/strict";
import test from "node:test";

import { createEventLedger } from "../dist/index.js";

test("perception ledger payload is empty because identity and order live in typed columns", () => {
  const calls = [];
  const ledger = createEventLedger(capturingSql(calls));

  ledger.recordQuery({
    userId: "00000000-0000-4000-8000-000000000001",
    kind: "perception_event",
    dedupKey: "11111111-1111-4111-8111-111111111111",
    payload: perceptionEvent(),
  });

  const persisted = JSON.parse(calls[0].values[3]);
  assert.deepEqual(persisted, {});
  assert.match(calls[0].text, /user_id,\s*kind,\s*dedup_key,\s*payload/i);
});

test("non-perception ledger rows preserve their complete payload", () => {
  const calls = [];
  const ledger = createEventLedger(capturingSql(calls));
  const payload = {
    type: "user_message",
    message_id: "message_1",
    body: "hello",
    sent_at: "2026-07-26T08:00:00.000Z",
  };

  ledger.recordQuery({
    userId: "00000000-0000-4000-8000-000000000001",
    kind: "user_message",
    dedupKey: "message_1",
    payload,
  });

  assert.deepEqual(JSON.parse(calls[0].values[3]), payload);
});

function capturingSql(calls) {
  return (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return Promise.resolve([]);
  };
}

function perceptionEvent() {
  return {
    type: "perception_event",
    event_id: "11111111-1111-4111-8111-111111111111",
    window_id: "22222222-2222-4222-8222-222222222222",
    source_client: "desktop",
    captured_at: "2026-07-26T08:00:00.000Z",
    period_start: "2026-07-26T07:59:00.000Z",
    period_end: "2026-07-26T08:00:00.000Z",
    artifact_type: "searchable_screen_record",
    summary: "confidential acquisition draft",
    signals: {
      content_redacted: false,
      bundle_id: "com.apple.TextEdit",
      app_name: "TextEdit",
      window_title: "Acquisition",
      ocr_text: "confidential acquisition draft",
    },
    embedding_ref: { model_id: "local", dim: 1, vector: [1] },
    sensitivity_label: "sensitive",
    retention_class: "screen_memory_30d",
    confidence: 0.9,
    expires_at: "2026-08-26T08:00:00.000Z",
    local_record_ref: "33333333-3333-4333-8333-333333333333",
  };
}
