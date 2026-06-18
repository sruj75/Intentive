import assert from "node:assert/strict";
import test from "node:test";

import { deriveChatPresentation } from "../dist/domains/chat/service/chat-presentation.js";

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
