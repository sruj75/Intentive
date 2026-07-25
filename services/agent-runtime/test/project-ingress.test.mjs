import assert from "node:assert/strict";
import test from "node:test";

import { toConversationEntry } from "../dist/index.js";

const userId = "00000000-0000-4000-8000-000000000001";

test("a user_message projects to a user-authored conversation entry", () => {
  const entry = toConversationEntry(userId, {
    type: "user_message",
    message_id: "m1",
    body: "hello",
    sent_at: "2026-06-10T00:00:00.000Z",
  });

  assert.deepEqual(entry, {
    userId,
    messageId: "m1",
    author: "user",
    body: "hello",
    viaPostMessageBack: false,
  });
});

test("non-chat inbound events do not project to a transcript entry", () => {
  const perception = toConversationEntry(userId, {
    type: "perception_event",
    event_id: "p1",
    source_client: "desktop",
    captured_at: "2026-06-10T00:00:00.000Z",
    period_start: "2026-06-10T00:00:00.000Z",
    period_end: "2026-06-10T01:00:00.000Z",
    artifact_type: "searchable_screen_record",
    summary: "did things",
    signals: {},
    sensitivity_label: "normal",
    retention_class: "screen_memory_30d",
    confidence: 0.8,
    local_record_ref: "screen-memory://p1",
  });
  assert.equal(perception, null);

  const sessionEnd = toConversationEntry(userId, {
    type: "session_end_marker",
    ended_at: "2026-06-10T00:00:00.000Z",
    reason: "quit",
  });
  assert.equal(sessionEnd, null);
});
