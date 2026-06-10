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
  const contextSnapshot = toConversationEntry(userId, {
    type: "context_snapshot",
    snapshot_id: "s1",
    captured_at: "2026-06-10T00:00:00.000Z",
    period_start: "2026-06-10T00:00:00.000Z",
    period_end: "2026-06-10T01:00:00.000Z",
    summary: "did things",
  });
  assert.equal(contextSnapshot, null);

  const sessionEnd = toConversationEntry(userId, {
    type: "session_end_marker",
    ended_at: "2026-06-10T00:00:00.000Z",
    reason: "quit",
  });
  assert.equal(sessionEnd, null);
});
