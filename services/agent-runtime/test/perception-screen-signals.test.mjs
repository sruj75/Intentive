import assert from "node:assert/strict";
import test from "node:test";

import {
  embeddingText,
  permittedEmbeddingText,
  structuredScreenFields,
  toPerceptionRecord,
} from "../dist/index.js";

const PERMITTED = {
  type: "perception_event",
  event_id: "0b8c6d2e-1f4a-4c3b-9a7d-2e5f6a7b8c9d",
  source_client: "desktop",
  captured_at: "2026-07-05T10:00:00.000Z",
  period_start: "2026-07-05T09:59:00.000Z",
  period_end: "2026-07-05T10:00:00.000Z",
  artifact_type: "searchable_screen_record",
  summary: "Reviewing the renovation plan.",
  signals: {
    content_redacted: false,
    bundle_id: "com.microsoft.VSCode",
    app_name: "Code",
    window_title: "plan.md",
    ocr_text: "Eight release blockers",
  },
  sensitivity_label: "normal",
  retention_class: "screen_memory_30d",
  confidence: 0.92,
  expires_at: "2026-08-04T10:00:00.000Z",
  local_record_ref: "7c4d9f10-3a2b-4e5c-8d6f-1a2b3c4d5e6f",
};

const REDACTED = {
  ...PERMITTED,
  event_id: "4d5e6f7a-8b9c-4d0e-9f1a-2b3c4d5e6f7a",
  summary: "Secret content detected on screen.",
  signals: {
    content_redacted: true,
    bundle_id: "com.apple.keychainaccess",
    app_name: "Keychain Access",
  },
  sensitivity_label: "secret_detected",
  local_record_ref: "8e9f0a1b-2c3d-4e5f-9a0b-1c2d3e4f5a6b",
};

test("a permitted screen record projects its full permitted field set", () => {
  const fields = structuredScreenFields(PERMITTED);
  assert.deepEqual(fields, {
    bundleId: "com.microsoft.VSCode",
    appName: "Code",
    windowTitle: "plan.md",
    ocrText: "Eight release blockers",
    contentRedacted: false,
  });

  const record = toPerceptionRecord("user-1", PERMITTED);
  assert.equal(record.appName, "Code");
  assert.equal(record.windowTitle, "plan.md");
  assert.equal(record.ocrText, "Eight release blockers");
  assert.equal(record.contentRedacted, false);
});

test("a redacted screen record withholds title, OCR, and never embeds secret text", () => {
  const fields = structuredScreenFields(REDACTED);
  assert.deepEqual(fields, {
    bundleId: "com.apple.keychainaccess",
    appName: "Keychain Access",
    windowTitle: null,
    ocrText: null,
    contentRedacted: true,
  });

  const embedded = permittedEmbeddingText(REDACTED);
  // Summary + app identity only — no title or OCR (there is none to leak).
  assert.match(embedded, /Secret content detected/);
  assert.match(embedded, /Keychain Access/);
  assert.doesNotMatch(embedded, /plan\.md/);
  assert.doesNotMatch(embedded, /Eight release blockers/);
});

test("permitted embedding text includes title and OCR for a permitted record", () => {
  const embedded = embeddingText(PERMITTED);
  assert.match(embedded, /Reviewing the renovation plan/);
  assert.match(embedded, /Code/);
  assert.match(embedded, /plan\.md/);
  assert.match(embedded, /Eight release blockers/);
});

test("non-screen artifacts leave the structured columns null and flatten string signals", () => {
  const audio = {
    ...PERMITTED,
    artifact_type: "ambient_audio_summary",
    summary: "Nearby speech discussed the launch.",
    signals: { audio_source: "microphone", transcript_word_count: 7 },
  };
  const fields = structuredScreenFields(audio);
  assert.deepEqual(fields, {
    bundleId: null,
    appName: null,
    windowTitle: null,
    ocrText: null,
    contentRedacted: false,
  });

  const embedded = permittedEmbeddingText(audio);
  assert.match(embedded, /Nearby speech discussed the launch/);
  // Flattened string signal values are still embedded for non-screen artifacts.
  assert.match(embedded, /microphone/);
});
