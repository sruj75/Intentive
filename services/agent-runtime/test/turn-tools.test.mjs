import assert from "node:assert/strict";
import test from "node:test";

import { createToolsForTurn } from "../dist/index.js";

const factories = {
  ordinaryEgress: () => "ordinary_post_message_back",
  coachingEgress: () => "coaching_post_message_back",
  screenContext: () => "search_screen_context",
};

test("Opening Orientation receives no perception-search or proactive-egress tool", () => {
  assert.deepEqual(
    createToolsForTurn(
      {
        trigger: "opening_orientation",
        windowId: "11111111-1111-4111-8111-111111111111",
        evidenceVersion: "opening:11111111-1111-4111-8111-111111111111",
      },
      factories,
    ),
    [],
  );
});

test("a bound Monitoring Turn receives only matching-window proactive egress", () => {
  for (const trigger of ["heartbeat", "perception_event"]) {
    assert.deepEqual(
      createToolsForTurn(
        {
          trigger,
          windowId: "11111111-1111-4111-8111-111111111111",
          evidenceVersion: "window:1-3",
          evidenceCursorStart: 1,
          evidenceCursorEnd: 3,
        },
        factories,
      ),
      ["coaching_post_message_back"],
    );
  }
});

test("legacy unbound heartbeat retains ordinary PMB and privacy-filtered search", () => {
  assert.deepEqual(createToolsForTurn({ trigger: "heartbeat" }, factories), [
    "ordinary_post_message_back",
    "search_screen_context",
  ]);
});

test("partial Coaching Turn bounds fail closed instead of gaining ordinary tools", () => {
  assert.deepEqual(
    createToolsForTurn(
      {
        trigger: "heartbeat",
        windowId: "11111111-1111-4111-8111-111111111111",
        evidenceVersion: "window:1-3",
      },
      factories,
    ),
    [],
  );
});

test("ordinary interactive and Cron turns retain PMB plus privacy-filtered search", () => {
  for (const trigger of ["user_message", "cron"]) {
    assert.deepEqual(createToolsForTurn({ trigger }, factories), [
      "ordinary_post_message_back",
      "search_screen_context",
    ]);
  }
});
