import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_MESSAGE_STORE,
  reduceConversationState,
} from "../dist/domains/chat/service/conversation-reducer.js";

const at = "2026-06-12T00:00:00.000Z";

test("hello_ok snapshot seeds the store oldest-first", () => {
  const state = reduceConversationState(EMPTY_MESSAGE_STORE, {
    type: "snapshot",
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
    type: "snapshot",
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

test("Agent State returns available when a proactive companion message arrives", () => {
  const proactive = reduceConversationState(EMPTY_MESSAGE_STORE, {
    type: "companion_message",
    messageId: "proactive",
    body: "checking in",
    emittedAt: at,
    viaPostMessageBack: true,
  });

  assert.equal(proactive.agentState, "available");
  assert.equal(proactive.messages[0].viaPostMessageBack, true);
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
