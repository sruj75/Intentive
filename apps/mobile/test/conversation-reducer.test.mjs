import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_MESSAGE_STORE,
  reduceConversationState,
} from "../dist/domains/chat/service/conversation-reducer.js";

const at = "2026-06-12T00:00:00.000Z";

test("hello_ok snapshot seeds the store oldest-first", () => {
  const state = reduceConversationState(EMPTY_MESSAGE_STORE, {
    type: "reconnect_snapshot",
    beforeCursor: "10",
    messages: [
      {
        message_id: "m1",
        author: "companion",
        body: "opening",
        at,
        via_post_message_back: false,
      },
      {
        message_id: "m2",
        author: "user",
        body: "hello",
        at,
        via_post_message_back: false,
      },
    ],
  });

  assert.deepEqual(
    state.messages.map((message) => message.id),
    ["m1", "m2"],
  );
  assert.equal(state.beforeCursor, "10");
});

test("live companion messages append and duplicate message_id collapses to one entry", () => {
  const first = reduceConversationState(EMPTY_MESSAGE_STORE, {
    type: "companion_message",
    messageId: "opening",
    body: "hello",
    emittedAt: at,
    viaPostMessageBack: false,
  });
  const duplicate = reduceConversationState(first, {
    type: "companion_message",
    messageId: "opening",
    body: "hello again",
    emittedAt: at,
    viaPostMessageBack: false,
  });

  assert.equal(duplicate.messages.length, 1);
  assert.equal(duplicate.messages[0].body, "hello again");
});

test("sending a user message is optimistic and reconciles by message_id", () => {
  const optimistic = reduceConversationState(EMPTY_MESSAGE_STORE, {
    type: "send_user_message",
    messageId: "user-1",
    body: "hi",
    sentAt: at,
  });

  assert.equal(optimistic.messages[0].delivery, "pending");
  assert.equal(optimistic.agentState, "thinking");

  const confirmed = reduceConversationState(optimistic, {
    type: "reconnect_snapshot",
    beforeCursor: null,
    messages: [
      {
        message_id: "user-1",
        author: "user",
        body: "hi",
        at,
        via_post_message_back: false,
      },
    ],
  });

  assert.equal(confirmed.messages.length, 1);
  assert.equal(confirmed.messages[0].delivery, "confirmed");
  assert.equal(confirmed.agentState, "available");
});

test("reconnect_snapshot trusts server order over earlier optimistic position", () => {
  const optimistic = reduceConversationState(EMPTY_MESSAGE_STORE, {
    type: "send_user_message",
    messageId: "user",
    body: "hello",
    sentAt: at,
  });

  const reconnected = reduceConversationState(optimistic, {
    type: "reconnect_snapshot",
    beforeCursor: null,
    messages: [
      snapshotMessage("opening", "companion", "Welcome"),
      snapshotMessage("user", "user", "hello"),
    ],
  });

  assert.deepEqual(
    reconnected.messages.map((message) => `${message.id}:${message.author}`),
    ["opening:companion", "user:user"],
  );
  assert.equal(reconnected.messages[1].delivery, "confirmed");
  assert.equal(reconnected.agentState, "available");
});

test("reconnect_snapshot leaves omitted pending user messages after the server window", () => {
  const optimistic = reduceConversationState(EMPTY_MESSAGE_STORE, {
    type: "send_user_message",
    messageId: "user",
    body: "hello",
    sentAt: at,
  });

  const reconnected = reduceConversationState(optimistic, {
    type: "reconnect_snapshot",
    beforeCursor: null,
    messages: [snapshotMessage("opening", "companion", "Welcome")],
  });

  assert.deepEqual(
    reconnected.messages.map((message) => `${message.id}:${message.delivery ?? "server"}`),
    ["opening:server", "user:pending"],
  );
  assert.equal(reconnected.agentState, "thinking");
});

test("history_backfill prepends older server messages before newer timeline", () => {
  const current = reduceConversationState(EMPTY_MESSAGE_STORE, {
    type: "reconnect_snapshot",
    beforeCursor: "before-newer",
    messages: [snapshotMessage("newer", "companion", "Newer")],
  });

  const backfilled = reduceConversationState(current, {
    type: "history_backfill",
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

test("history_backfill deduplicates by server ID without moving local-only outbound ahead", () => {
  const current = {
    ...EMPTY_MESSAGE_STORE,
    agentState: "thinking",
    messages: [
      {
        id: "already-rendered",
        author: "companion",
        body: "stale",
        at,
        viaPostMessageBack: false,
      },
      {
        id: "pending-user",
        author: "user",
        body: "still local",
        at,
        viaPostMessageBack: false,
        delivery: "pending",
      },
    ],
  };

  const backfilled = reduceConversationState(current, {
    type: "history_backfill",
    beforeCursor: null,
    messages: [
      snapshotMessage("older", "companion", "Older"),
      snapshotMessage("already-rendered", "companion", "authoritative"),
    ],
  });

  assert.deepEqual(
    backfilled.messages.map((message) => `${message.id}:${message.body}`),
    ["older:Older", "already-rendered:authoritative", "pending-user:still local"],
  );
  assert.equal(backfilled.agentState, "thinking");
});

test("Agent State returns following_up when a Post-Message-Back companion message arrives", () => {
  const proactive = reduceConversationState(EMPTY_MESSAGE_STORE, {
    type: "companion_message",
    messageId: "proactive",
    body: "checking in",
    emittedAt: at,
    viaPostMessageBack: true,
  });

  assert.equal(proactive.agentState, "following_up");
  assert.equal(proactive.messages[0].viaPostMessageBack, true);
});

test("pending outbound delivery keeps Thinking when a Post-Message-Back companion message races it", () => {
  const pending = reduceConversationState(EMPTY_MESSAGE_STORE, {
    type: "send_user_message",
    messageId: "user-1",
    body: "one more thing",
    sentAt: at,
  });

  const raced = reduceConversationState(pending, {
    type: "companion_message",
    messageId: "proactive",
    body: "checking in",
    emittedAt: at,
    viaPostMessageBack: true,
  });

  assert.equal(raced.messages[0].delivery, "pending");
  assert.equal(raced.messages[1].viaPostMessageBack, true);
  assert.equal(raced.agentState, "thinking");
});

test("mark_pending_failed only affects pending user messages", () => {
  const withMessages = {
    ...EMPTY_MESSAGE_STORE,
    agentState: "thinking",
    messages: [
      {
        id: "pending-user",
        author: "user",
        body: "pending",
        at,
        viaPostMessageBack: false,
        delivery: "pending",
      },
      {
        id: "confirmed-user",
        author: "user",
        body: "confirmed",
        at,
        viaPostMessageBack: false,
        delivery: "confirmed",
      },
      {
        id: "companion",
        author: "companion",
        body: "hello",
        at,
        viaPostMessageBack: false,
      },
    ],
  };

  const failed = reduceConversationState(withMessages, { type: "mark_pending_failed" });

  assert.equal(failed.messages[0].delivery, "failed");
  assert.equal(failed.messages[1].delivery, "confirmed");
  assert.equal(failed.messages[2].delivery, undefined);
  assert.equal(failed.agentState, "available");
});

test("mark_pending_failed preserves Following up when the latest message is a Post-Message-Back follow-up", () => {
  const pending = reduceConversationState(EMPTY_MESSAGE_STORE, {
    type: "send_user_message",
    messageId: "user-1",
    body: "one more thing",
    sentAt: at,
  });
  const raced = reduceConversationState(pending, {
    type: "companion_message",
    messageId: "proactive",
    body: "checking in",
    emittedAt: at,
    viaPostMessageBack: true,
  });

  const failed = reduceConversationState(raced, { type: "mark_pending_failed" });

  assert.equal(failed.messages[0].delivery, "failed");
  assert.equal(failed.messages[1].viaPostMessageBack, true);
  assert.equal(failed.agentState, "following_up");
});

test("retry_failed_user_message only returns failed local user messages to pending", () => {
  const withMessages = {
    ...EMPTY_MESSAGE_STORE,
    messages: [
      {
        id: "failed-user",
        author: "user",
        body: "retry me",
        at,
        viaPostMessageBack: false,
        delivery: "failed",
      },
      {
        id: "confirmed-user",
        author: "user",
        body: "leave me",
        at,
        viaPostMessageBack: false,
        delivery: "confirmed",
      },
    ],
  };

  const retried = reduceConversationState(withMessages, {
    type: "retry_failed_user_message",
    messageId: "failed-user",
  });
  const unchanged = reduceConversationState(retried, {
    type: "retry_failed_user_message",
    messageId: "missing-user",
  });

  assert.equal(retried.messages[0].delivery, "pending");
  assert.equal(retried.messages[0].id, "failed-user");
  assert.equal(retried.messages[0].body, "retry me");
  assert.equal(retried.messages[0].at, at);
  assert.equal(retried.messages[1].delivery, "confirmed");
  assert.equal(retried.agentState, "thinking");
  assert.equal(unchanged, retried);
});

function snapshotMessage(message_id, author, body) {
  return {
    message_id,
    author,
    body,
    at,
    via_post_message_back: false,
  };
}
