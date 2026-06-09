import assert from "node:assert/strict";
import test from "node:test";

import { createUserQueue } from "../dist/index.js";

test("user queue runs tasks for one User in submit order", async () => {
  const queue = createUserQueue();
  const seen = [];

  const first = queue.submit("00000000-0000-4000-8000-000000000001", async () => {
    await delay(20);
    seen.push("first");
  });
  const second = queue.submit("00000000-0000-4000-8000-000000000001", () => {
    seen.push("second");
  });

  await Promise.all([first, second]);

  assert.deepEqual(seen, ["first", "second"]);
});

test("user queue lets different Users progress independently", async () => {
  const queue = createUserQueue();
  const seen = [];
  let releaseSlowUser;
  const slowUserGate = new Promise((resolve) => {
    releaseSlowUser = resolve;
  });

  const slowUser = queue.submit("00000000-0000-4000-8000-000000000001", async () => {
    seen.push("slow-start");
    await slowUserGate;
    seen.push("slow-end");
  });
  const otherUser = queue.submit("00000000-0000-4000-8000-000000000002", () => {
    seen.push("other-user");
  });

  await otherUser;
  assert.deepEqual(seen, ["slow-start", "other-user"]);

  releaseSlowUser();
  await slowUser;
  assert.deepEqual(seen, ["slow-start", "other-user", "slow-end"]);
});

test("user queue continues later work for a User after a rejected task", async () => {
  const queue = createUserQueue();
  const seen = [];

  await assert.rejects(
    queue.submit("00000000-0000-4000-8000-000000000001", async () => {
      seen.push("first");
      throw new Error("boom");
    }),
    /boom/,
  );

  await queue.submit("00000000-0000-4000-8000-000000000001", () => {
    seen.push("second");
  });

  assert.deepEqual(seen, ["first", "second"]);
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
