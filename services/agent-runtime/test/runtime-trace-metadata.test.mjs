import assert from "node:assert/strict";
import test from "node:test";

import { buildRuntimeInvocationConfig } from "../dist/index.js";

test("coaching trace metadata carries only content-free window and evidence bounds", () => {
  const config = buildRuntimeInvocationConfig({
    userId: "00000000-0000-4000-8000-000000000001",
    threadId: "00000000-0000-4000-8000-000000000001",
    trigger: "perception_event",
    body: "private turn instruction",
    pinnedFloor: {
      version: "floor_v1",
      documents: {},
      langfusePrompts: ["prompt-handle"],
    },
    userProfile: "private profile",
    recentPerception: "private rendered OCR and audio evidence",
    windowId: "11111111-1111-4111-8111-111111111111",
    evidenceCursorStart: 41,
    evidenceCursorEnd: 52,
    evidenceVersion: "11111111-1111-4111-8111-111111111111:41-52",
  });

  assert.deepEqual(config.configurable, {
    thread_id: "00000000-0000-4000-8000-000000000001",
    user_id: "00000000-0000-4000-8000-000000000001",
    trigger: "perception_event",
    window_id: "11111111-1111-4111-8111-111111111111",
    evidence_version: "11111111-1111-4111-8111-111111111111:41-52",
    evidence_cursor_start: 41,
    evidence_cursor_end: 52,
  });
  assert.deepEqual(config.metadata, {
    langfusePrompt: "prompt-handle",
    langfuseUserId: "00000000-0000-4000-8000-000000000001",
    langfuseSessionId: "00000000-0000-4000-8000-000000000001",
    bundle_version: "floor_v1",
    window_id: "11111111-1111-4111-8111-111111111111",
    evidence_version: "11111111-1111-4111-8111-111111111111:41-52",
    evidence_cursor_start: 41,
    evidence_cursor_end: 52,
  });

  const rendered = JSON.stringify(config);
  assert.doesNotMatch(rendered, /private turn instruction/);
  assert.doesNotMatch(rendered, /private profile/);
  assert.doesNotMatch(rendered, /private rendered OCR/);
});
