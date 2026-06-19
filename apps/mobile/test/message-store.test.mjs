import assert from "node:assert/strict";
import test from "node:test";

import { createMessageStore } from "../dist/domains/chat/service/message-store.js";

const at = "2026-06-12T00:00:00.000Z";

function snapshotMessage(message_id, author, body, via_post_message_back = false) {
  return { message_id, author, body, at, via_post_message_back };
}

test("starts empty", () => {
  const store = createMessageStore();
  assert.deepEqual(store.getState().messages, []);
  assert.equal(store.getState().beforeCursor, null);
  assert.equal(store.getState().agentState, "available");
});

test("replaceServerWindow seeds oldest-first and records the cursor", () => {
  const store = createMessageStore();
  const next = store.replaceServerWindow({
    beforeCursor: "10",
    messages: [
      snapshotMessage("m1", "companion", "opening"),
      snapshotMessage("m2", "user", "hello"),
    ],
  });

  assert.deepEqual(
    next.messages.map((message) => message.id),
    ["m1", "m2"],
  );
  assert.equal(next.beforeCursor, "10");
  assert.equal(store.getState(), next);
});

test("appendPendingUserMessage is optimistic and reconciles by message_id", () => {
  const store = createMessageStore();
  const optimistic = store.appendPendingUserMessage({
    messageId: "user-1",
    body: "hi",
    sentAt: at,
  });
  assert.equal(optimistic.messages[0].delivery, "pending");
  assert.equal(optimistic.agentState, "thinking");

  const confirmed = store.replaceServerWindow({
    beforeCursor: null,
    messages: [snapshotMessage("user-1", "user", "hi")],
  });
  assert.equal(confirmed.messages.length, 1);
  assert.equal(confirmed.messages[0].delivery, "confirmed");
  assert.equal(confirmed.agentState, "available");
});

test("appendCompanionMessage dedupes duplicate message_id to one entry", () => {
  const store = createMessageStore();
  store.appendCompanionMessage({
    messageId: "opening",
    body: "hello",
    emittedAt: at,
    viaPostMessageBack: false,
  });
  const duplicate = store.appendCompanionMessage({
    messageId: "opening",
    body: "hello again",
    emittedAt: at,
    viaPostMessageBack: false,
  });

  assert.equal(duplicate.messages.length, 1);
  assert.equal(duplicate.messages[0].body, "hello again");
});

test("appendCompanionMessage with Post-Message-Back drives Following up", () => {
  const store = createMessageStore();
  const proactive = store.appendCompanionMessage({
    messageId: "proactive",
    body: "checking in",
    emittedAt: at,
    viaPostMessageBack: true,
  });

  assert.equal(proactive.agentState, "following_up");
  assert.equal(proactive.messages[0].viaPostMessageBack, true);
});

test("prependServerPage adds older messages ahead of the current timeline", () => {
  const store = createMessageStore();
  store.replaceServerWindow({
    beforeCursor: "before-newer",
    messages: [snapshotMessage("newer", "companion", "Newer")],
  });
  const backfilled = store.prependServerPage({
    beforeCursor: "before-older",
    messages: [
      snapshotMessage("oldest", "companion", "Oldest"),
      snapshotMessage("older-user", "user", "Earlier"),
    ],
  });

  assert.deepEqual(
    backfilled.messages.map((message) => message.id),
    ["oldest", "older-user", "newer"],
  );
  assert.equal(backfilled.beforeCursor, "before-older");
});

test("markPendingFailed only fails pending outbound user messages", () => {
  const store = createMessageStore();
  store.appendPendingUserMessage({ messageId: "user-1", body: "pending", sentAt: at });
  const failed = store.markPendingFailed();

  assert.equal(failed.messages[0].delivery, "failed");
  assert.equal(failed.agentState, "available");
});

test("retryFailedUserMessage returns only a failed local message to pending", () => {
  const store = createMessageStore();
  store.appendPendingUserMessage({ messageId: "user-1", body: "retry me", sentAt: at });
  store.markPendingFailed();

  const retried = store.retryFailedUserMessage("user-1");
  assert.equal(retried.messages[0].delivery, "pending");
  assert.equal(retried.messages[0].body, "retry me");
  assert.equal(retried.agentState, "thinking");

  const unchanged = store.retryFailedUserMessage("missing");
  assert.equal(unchanged, retried);
});
