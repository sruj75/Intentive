import assert from "node:assert/strict";
import test from "node:test";

import { createQueuedSessionSnapshotReader, createUserQueue } from "../dist/index.js";

test("queued Session Snapshot reads wait behind same-User work while other Users progress", async () => {
  const queue = createUserQueue();
  const seen = [];
  let releasePendingWork;
  const pendingWork = new Promise((resolve) => {
    releasePendingWork = resolve;
  });

  const reader = createQueuedSessionSnapshotReader({
    conversation: {
      readSnapshot: async (userId) => {
        seen.push(`read:${userId}`);
        return { messages: [], before_cursor: null };
      },
    },
    queue,
  });

  const sameUser = "00000000-0000-4000-8000-000000000001";
  const otherUser = "00000000-0000-4000-8000-000000000002";

  const pending = queue.submit(sameUser, async () => {
    seen.push("pending:start");
    await pendingWork;
    seen.push("pending:end");
  });

  await waitFor(() => seen.includes("pending:start"));

  const sameUserRead = reader.readSnapshot(sameUser);
  const otherUserRead = reader.readSnapshot(otherUser);

  await otherUserRead;
  assert.deepEqual(seen, ["pending:start", `read:${otherUser}`]);

  releasePendingWork();
  await Promise.all([pending, sameUserRead]);

  assert.deepEqual(seen, ["pending:start", `read:${otherUser}`, "pending:end", `read:${sameUser}`]);
});

async function waitFor(predicate) {
  for (let i = 0; i < 20; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.equal(predicate(), true);
}
