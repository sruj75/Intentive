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

test("user queue runs best-effort when idle and collapses concurrent best-effort work", async () => {
  const queue = createUserQueue();
  const seen = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  assert.equal(
    queue.tryBestEffort("00000000-0000-4000-8000-000000000001", async () => {
      seen.push("best:start");
      await gate;
      seen.push("best:end");
    }),
    true,
  );
  await waitFor(() => seen.includes("best:start"));
  assert.equal(
    queue.tryBestEffort("00000000-0000-4000-8000-000000000001", () => {
      seen.push("dropped");
    }),
    false,
  );

  release();
  await waitFor(() => seen.includes("best:end"));

  assert.deepEqual(seen, ["best:start", "best:end"]);
});

test("user queue gives committed work priority over pending best-effort work", async () => {
  const queue = createUserQueue();
  const seen = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const first = queue.submit("00000000-0000-4000-8000-000000000001", async () => {
    seen.push("first:start");
    await firstGate;
    seen.push("first:end");
  });
  await waitFor(() => seen.includes("first:start"));

  assert.equal(
    queue.tryBestEffort("00000000-0000-4000-8000-000000000001", () => {
      seen.push("best");
    }),
    true,
  );
  const second = queue.submit("00000000-0000-4000-8000-000000000001", () => {
    seen.push("second");
  });

  releaseFirst();
  await Promise.all([first, second]);
  await waitFor(() => seen.includes("best"));

  assert.deepEqual(seen, ["first:start", "first:end", "second", "best"]);
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate) {
  for (let i = 0; i < 20; i += 1) {
    if (predicate()) return;
    await delay(1);
  }
  assert.equal(predicate(), true);
}
