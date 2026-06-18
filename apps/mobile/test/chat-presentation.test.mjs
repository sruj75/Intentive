import assert from "node:assert/strict";
import test from "node:test";

import {
  MAC_SETUP_BANNER_COPY,
  deriveChatPresentation,
} from "../dist/domains/chat/service/chat-presentation.js";

const baseState = {
  messages: [],
  beforeCursor: null,
  agentState: "available",
  connectionState: "connected",
  error: null,
};

test("empty connected timeline waits for the Protected Opening and blocks send", () => {
  const presentation = deriveChatPresentation(baseState);

  assert.equal(presentation.protectedOpening.status, "pending");
  assert.equal(presentation.canSend, false);
  assert.equal(presentation.waitingToStartCopy, "Waiting for the Companion to start.");
  assert.deepEqual(presentation.agentState, { kind: "available", label: "Available" });
});

test("empty error timeline shows Protected Opening recovery and keeps send blocked", () => {
  const presentation = deriveChatPresentation({
    ...baseState,
    connectionState: "error",
    error: { kind: "network", message: "socket closed" },
  });

  assert.equal(presentation.protectedOpening.status, "failed");
  assert.equal(presentation.canSend, false);
  assert.equal(presentation.openingRecoveryCopy, "I couldn't start the conversation.");
});

test("any server timeline turns Protected Opening off and allows normal sending", () => {
  const presentation = deriveChatPresentation({
    ...baseState,
    messages: [
      {
        id: "opening",
        author: "companion",
        body: "hello",
        at: "2026-06-12T00:00:00.000Z",
        viaPostMessageBack: false,
      },
    ],
  });

  assert.equal(presentation.protectedOpening.status, "inactive");
  assert.equal(presentation.canSend, true);
});

test("pending outbound user messages render Thinking", () => {
  const presentation = deriveChatPresentation({
    ...baseState,
    agentState: "thinking",
    messages: [
      {
        id: "u1",
        author: "user",
        body: "hello",
        at: "2026-06-12T00:00:00.000Z",
        viaPostMessageBack: false,
        delivery: "pending",
      },
    ],
  });

  assert.deepEqual(presentation.agentState, { kind: "thinking", label: "Thinking" });
});

test("post-message-back server truth renders Following up and a continuity cue", () => {
  const presentation = deriveChatPresentation({
    ...baseState,
    agentState: "following_up",
    messages: [
      {
        id: "c1",
        author: "companion",
        body: "A follow-up arrived.",
        at: "2026-06-12T00:00:00.000Z",
        viaPostMessageBack: true,
      },
    ],
  });

  assert.deepEqual(presentation.agentState, { kind: "following_up", label: "Following up" });
  assert.deepEqual(presentation.continuityEvents, [
    { id: "post-message-back-c1", copy: "Follow-up from your Companion" },
  ]);
});

test("Paused is explicit-only and never inferred from connection errors", () => {
  const errorPresentation = deriveChatPresentation({
    ...baseState,
    connectionState: "error",
    error: { kind: "network", message: "offline" },
  });
  const pausedPresentation = deriveChatPresentation(baseState, { agentStateOverride: "paused" });

  assert.equal(errorPresentation.agentState.kind, "available");
  assert.deepEqual(pausedPresentation.agentState, { kind: "paused", label: "Paused" });
});

test("Mac setup banner appears only for explicit no-Desktop account state", () => {
  assert.deepEqual(
    deriveChatPresentation(baseState, {
      accountState: {
        user_id: "u_1",
        next_gate: null,
        has_agent_instance: true,
        has_desktop_client: false,
      },
    }).macSetupBanner,
    { visible: true, copy: MAC_SETUP_BANNER_COPY },
  );

  assert.equal(
    deriveChatPresentation(baseState, {
      accountState: {
        user_id: "u_1",
        next_gate: null,
        has_agent_instance: true,
        has_desktop_client: true,
      },
    }).macSetupBanner.visible,
    false,
  );
  assert.equal(deriveChatPresentation(baseState).macSetupBanner.visible, false);
});

test("Mac setup banner stays suppressed after current-session dismissal", () => {
  const presentation = deriveChatPresentation(baseState, {
    accountState: {
      user_id: "u_1",
      next_gate: null,
      has_agent_instance: true,
      has_desktop_client: false,
    },
    macSetupBannerDismissed: true,
  });

  assert.equal(presentation.macSetupBanner.visible, false);
});
