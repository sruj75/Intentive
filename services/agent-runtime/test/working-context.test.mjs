import assert from "node:assert/strict";
import test from "node:test";

import { createWorkingContext } from "../dist/index.js";

test("working context gathers profile and recent perception in parallel", async () => {
  const order = [];
  let releaseProfile;
  let releasePerception;
  const profileGate = new Promise((resolve) => {
    releaseProfile = resolve;
  });
  const perceptionGate = new Promise((resolve) => {
    releasePerception = resolve;
  });
  const workingContext = createWorkingContext({
    readUserProfile: async () => {
      order.push("profile:start");
      await profileGate;
      order.push("profile:end");
      return "likes direct answers";
    },
    readRecentPerception: async () => {
      order.push("perception:start");
      await perceptionGate;
      order.push("perception:end");
      return "Most recent perception: reviewing a design doc";
    },
  });

  const assembled = workingContext({
    userId: "user_1",
    threadId: "thread_1",
    body: "hello",
    trigger: "user_message",
    floor: floor("floor_v1"),
    firstRun: true,
  });
  await waitFor(() => order.includes("profile:start") && order.includes("perception:start"));

  assert.deepEqual(order, ["profile:start", "perception:start"]);

  releasePerception();
  releaseProfile();

  assert.deepEqual(await assembled, {
    userId: "user_1",
    threadId: "thread_1",
    body: "hello",
    trigger: "user_message",
    pinnedFloor: floor("floor_v1"),
    userProfile: "likes direct answers",
    recentPerception: "Most recent perception: reviewing a design doc",
    firstRun: true,
  });
});

test("working context omits recentPerception when no Sensory Buffer reader is injected", async () => {
  const workingContext = createWorkingContext({
    readUserProfile: async () => "profile",
  });

  const assembled = await workingContext({
    userId: "user_1",
    threadId: "thread_1",
    body: "hello",
    trigger: "user_message",
    floor: floor("floor_v1"),
  });

  assert.equal(Object.hasOwn(assembled, "recentPerception"), false);
});

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail("condition was not met");
}

function floor(version) {
  return {
    version,
    documents: {
      SOUL: "soul",
      AGENTS: "agents",
      BOOTSTRAP: "bootstrap",
      HEARTBEAT: "heartbeat",
    },
    langfusePrompts: [],
  };
}
