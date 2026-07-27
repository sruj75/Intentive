import assert from "node:assert/strict";
import test from "node:test";

import { createRecentCoachingEvidenceReader } from "../dist/index.js";

const userId = "00000000-0000-4000-8000-000000000001";
const windowId = "11111111-1111-4111-8111-111111111111";

test("recent coaching evidence fixes an upper cursor and renders window-scoped records chronologically", async () => {
  const calls = [];
  const reader = createRecentCoachingEvidenceReader(
    scriptedSql(calls, [
      [{ upper_cursor: "12" }],
      [
        evidenceRow({ cursor: "11", eventId: "event-11", summary: "Editing the launch plan" }),
        evidenceRow({
          cursor: "12",
          eventId: "event-12",
          artifactType: "ambient_audio_summary",
          summary: "The user said the rollout decision still feels unclear",
          appName: null,
          windowTitle: null,
          ocrText: null,
        }),
      ],
    ]),
  );

  const batch = await reader.read({
    userId,
    windowId,
    afterCursor: 10,
  });

  assert.equal(calls.length, 2);
  assert.match(calls[0].text, /runtime_events/i);
  assert.match(calls[0].text, /JOIN\s+agent_runtime\.perception_records/i);
  assert.match(calls[0].text, /window_id\s*=\s*/i);
  assert.match(calls[0].text, /expires_at\s*>\s*now\(\)/i);
  assert.match(calls[1].text, /ingest_seq\s*>\s*/i);
  assert.match(calls[1].text, /ingest_seq\s*<=\s*/i);
  assert.match(calls[1].text, /ORDER\s+BY\s+event\.ingest_seq\s+ASC/i);
  assert.match(calls[1].text, /event\.dedup_key\s*=\s*projection\.event_id/i);
  assert.match(batch.version, new RegExp(`^${windowId}:11-12:[a-f0-9]{64}$`));
  assert.deepEqual(batch, {
    windowId,
    cursorStart: 11,
    cursorEnd: 12,
    version: batch.version,
    eventIds: ["event-11", "event-12"],
    oldestCapturedAt: new Date("2026-07-26T08:00:00.000Z"),
    rendered: [
      "[11] searchable_screen_record at 2026-07-26T08:00:00.000Z",
      "App: Code",
      "Window: plan.md",
      "Summary: Editing the launch plan",
      "Visible text: Ship the founder preview",
      "",
      "[12] ambient_audio_summary at 2026-07-26T08:00:00.000Z",
      "Summary: The user said the rollout decision still feels unclear",
    ].join("\n"),
  });
});

test("recent coaching evidence returns null when nothing newer is eligible", async () => {
  const reader = createRecentCoachingEvidenceReader(scriptedSql([], [[{ upper_cursor: null }]]));

  assert.equal(await reader.read({ userId, windowId, afterCursor: null }), null);
});

test("recent coaching evidence never exceeds its prompt budget", async () => {
  const reader = createRecentCoachingEvidenceReader(
    scriptedSql(
      [],
      [
        [{ upper_cursor: "1" }],
        [
          evidenceRow({
            cursor: "1",
            eventId: "large",
            summary: "s".repeat(20_000),
            ocrText: "o".repeat(20_000),
          }),
        ],
      ],
    ),
  );

  const batch = await reader.read({
    userId,
    windowId,
    afterCursor: null,
    maxCharacters: 100_000,
  });

  assert.equal(batch.rendered.length <= 12_000, true);
  assert.equal(batch.cursorEnd, 1);
});

test("recent coaching evidence renders only approved artifact signals and keeps redacted screen text absent", async () => {
  const reader = createRecentCoachingEvidenceReader(
    scriptedSql(
      [],
      [
        [{ upper_cursor: "4" }],
        [
          evidenceRow({
            cursor: "1",
            eventId: "focus",
            artifactType: "focus_signal",
            summary: "Focus changed.",
            appName: null,
            windowTitle: null,
            ocrText: null,
            signals: {
              previous_app: "Code",
              current_app: "Safari",
              unapproved_detail: "must not render",
            },
          }),
          evidenceRow({
            cursor: "2",
            eventId: "activity",
            artifactType: "activity_summary",
            summary: "Activity summary.",
            appName: null,
            windowTitle: null,
            ocrText: null,
            signals: { frame_count: 8, app_count: 2 },
          }),
          evidenceRow({
            cursor: "3",
            eventId: "audio",
            artifactType: "ambient_audio_summary",
            summary: "Audio summary.",
            appName: null,
            windowTitle: null,
            ocrText: null,
            signals: {
              audio_source: "microphone",
              transcript_redacted: false,
              transcript_word_count: 11,
              raw_transcript: "must not render",
            },
          }),
          evidenceRow({
            cursor: "4",
            eventId: "redacted-screen",
            summary: "Secret-like content was detected and suppressed.",
            appName: "Terminal",
            windowTitle: null,
            ocrText: null,
            contentRedacted: true,
            sensitivityLabel: "secret_detected",
            signals: {
              content_redacted: true,
              bundle_id: "com.apple.Terminal",
              app_name: "Terminal",
            },
          }),
        ],
      ],
    ),
  );

  const batch = await reader.read({ userId, windowId, afterCursor: null });

  assert.match(batch.rendered, /Previous app: Code/);
  assert.match(batch.rendered, /Current app: Safari/);
  assert.match(batch.rendered, /Frame count: 8/);
  assert.match(batch.rendered, /App count: 2/);
  assert.match(batch.rendered, /Audio source: microphone/);
  assert.match(batch.rendered, /Transcript redacted: false/);
  assert.match(batch.rendered, /Transcript word count: 11/);
  assert.doesNotMatch(batch.rendered, /unapproved_detail|raw_transcript|must not render/);
  assert.doesNotMatch(batch.rendered, /Visible text:[\s\S]*redacted-screen/);
});

test("bound evidence validation rerenders the exact current projection range", async () => {
  const calls = [];
  const original = evidenceRow({
    cursor: "11",
    eventId: "event-11",
    summary: "Editing the launch plan",
  });
  const sameRenderedReplacement = {
    ...original,
    signals: { unapproved_detail: "replacement metadata" },
    sensitivity_label: "sensitive",
    confidence: 0.7,
  };
  const redactedReplacement = evidenceRow({
    cursor: "11",
    eventId: "event-11",
    summary: "Sensitive content was redacted.",
    windowTitle: null,
    ocrText: null,
    contentRedacted: true,
    sensitivityLabel: "secret_detected",
  });
  const reader = createRecentCoachingEvidenceReader(
    scriptedSql(calls, [
      [{ upper_cursor: "11" }],
      [original],
      [sameRenderedReplacement],
      [redactedReplacement],
      [],
    ]),
  );
  const evidence = await reader.read({ userId, windowId, afterCursor: 10 });
  const binding = {
    userId,
    windowId,
    cursorStart: evidence.cursorStart,
    cursorEnd: evidence.cursorEnd,
    version: evidence.version,
  };

  assert.equal(await reader.isCurrent(binding), true);
  assert.equal(await reader.isCurrent(binding), false);
  assert.equal(await reader.isCurrent(binding), false);

  assert.match(calls[2].text, /event\.ingest_seq\s*>=\s*/i);
  assert.match(calls[2].text, /event\.ingest_seq\s*<=\s*/i);
  assert.match(calls[2].text, /projection\.window_id\s*=\s*/i);
  assert.match(calls[2].text, /projection\.expires_at\s*>\s*now\(\)/i);
  assert.match(calls[2].text, /ORDER\s+BY\s+event\.ingest_seq\s+ASC/i);
});

function scriptedSql(calls, results) {
  return (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return Promise.resolve(results.shift() ?? []);
  };
}

function evidenceRow({
  cursor,
  eventId,
  artifactType = "searchable_screen_record",
  summary,
  appName = "Code",
  windowTitle = "plan.md",
  ocrText = "Ship the founder preview",
  contentRedacted = false,
  sensitivityLabel = "normal",
  signals = {},
}) {
  return {
    ingest_seq: cursor,
    event_id: eventId,
    artifact_type: artifactType,
    captured_at: "2026-07-26T08:00:00.000Z",
    period_start: "2026-07-26T07:59:00.000Z",
    period_end: "2026-07-26T08:00:00.000Z",
    summary,
    app_name: appName,
    window_title: windowTitle,
    ocr_text: ocrText,
    signals,
    content_redacted: contentRedacted,
    sensitivity_label: sensitivityLabel,
    confidence: 0.9,
  };
}
