import assert from "node:assert/strict";
import test from "node:test";

import { assembleSystemPrompt } from "../dist/index.js";

const floor = {
  version: "test",
  documents: {
    SOUL: "soul rules",
    AGENTS: "agent rules",
    BOOTSTRAP: "bootstrap rules",
    HEARTBEAT: "heartbeat rules",
  },
  langfusePrompts: [],
};

test("user_message prompt includes floor and USER.md profile but excludes HEARTBEAT", () => {
  const prompt = assembleSystemPrompt({
    floor,
    trigger: "user_message",
    userProfile: "likes short replies",
  });

  assert.match(prompt, /# SOUL\nsoul rules/);
  assert.match(prompt, /# AGENTS\nagent rules/);
  assert.match(prompt, /# USER\.md\nlikes short replies/);
  assert.doesNotMatch(prompt, /heartbeat rules/);
});

test("heartbeat prompt includes HEARTBEAT procedure", () => {
  const prompt = assembleSystemPrompt({ floor, trigger: "heartbeat" });

  assert.match(prompt, /# HEARTBEAT\nheartbeat rules/);
});

test("first run prompt includes BOOTSTRAP procedure", () => {
  const prompt = assembleSystemPrompt({ floor, trigger: "user_message", firstRun: true });

  assert.match(prompt, /# BOOTSTRAP\nbootstrap rules/);
});

test("empty profile is not injected", () => {
  const prompt = assembleSystemPrompt({ floor, trigger: "user_message", userProfile: "   " });

  assert.doesNotMatch(prompt, /USER\.md/);
});

test("recent perception is injected after USER.md when present", () => {
  const prompt = assembleSystemPrompt({
    floor,
    trigger: "user_message",
    userProfile: "likes short replies",
    recentPerception: "Most recent perception: writing tests",
  });

  assert.match(
    prompt,
    /# USER\.md\nlikes short replies\n\n# RECENT_PERCEPTION\nMost recent perception: writing tests/,
  );
});

test("empty recent perception is not injected", () => {
  const prompt = assembleSystemPrompt({
    floor,
    trigger: "user_message",
    recentPerception: "   ",
  });

  assert.doesNotMatch(prompt, /RECENT_PERCEPTION/);
});
