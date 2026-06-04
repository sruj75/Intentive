import assert from "node:assert/strict";
import test from "node:test";

import { createDevChatAdapter } from "../dist/domains/chat/runtime/dev-chat-adapter.js";

/**
 * The Dev Chat Adapter (#22) is the canned Chat Primitive Engine backend behind
 * `<CompanionChat/>` — the one seam #33 swaps for the Protocol adapter. These
 * exercise it directly through the vendor `ChatModelAdapter.run` contract (an
 * async generator of result frames), with no React Native, proving the
 * streaming and error-surface behaviour the wrapper relies on.
 */

// Drain the adapter's `run` generator into an array of yielded result frames.
// A fresh AbortController stands in for the runtime's per-run signal.
async function drain(adapter, { signal } = {}) {
  const controller = new AbortController();
  const frames = [];
  for await (const frame of adapter.run({ abortSignal: signal ?? controller.signal })) {
    frames.push(frame);
  }
  return frames;
}

test("reply mode streams the canned chunks as cumulative text frames", async () => {
  const adapter = createDevChatAdapter({ chunks: ["Hello ", "there ", "friend."] });
  const frames = await drain(adapter);

  // One frame per chunk, each carrying the full text so far (streaming proof).
  const texts = frames.map((f) => f.content[0].text);
  assert.deepEqual(texts, ["Hello ", "Hello there ", "Hello there friend."]);
});

test("reply mode emits a text part the assistant row can render", async () => {
  const [frame] = await drain(createDevChatAdapter({ chunks: ["Just one."] }));
  assert.deepEqual(frame.content, [{ type: "text", text: "Just one." }]);
});

test("error mode yields a single error-status frame, not a thrown rejection", async () => {
  const frames = await drain(createDevChatAdapter({ mode: "error" }));

  assert.equal(frames.length, 1);
  assert.equal(frames[0].status.type, "incomplete");
  assert.equal(frames[0].status.reason, "error");
  assert.equal(typeof frames[0].status.error, "string");
});

test("an already-aborted run yields nothing and never rejects", async () => {
  const controller = new AbortController();
  controller.abort();
  const frames = await drain(createDevChatAdapter({ delayMs: 50 }), { signal: controller.signal });

  assert.deepEqual(frames, []);
});
