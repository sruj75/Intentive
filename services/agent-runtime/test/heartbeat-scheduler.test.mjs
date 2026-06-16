import assert from "node:assert/strict";
import test from "node:test";

import { createHeartbeatScheduler } from "../dist/index.js";

test("heartbeat scheduler tick enqueues due users with floor and batch limit", async () => {
  const selectArgs = [];
  const enqueued = [];
  const scheduler = createHeartbeatScheduler({
    clock: () => new Date("2026-06-16T00:00:00.000Z"),
    floorMs: 3_600_000,
    batchLimit: 2,
    scheduleRepo: {
      selectDue: async (input) => {
        selectArgs.push(input);
        return [{ userId: "user_1" }, { userId: "user_2" }];
      },
    },
    enqueueHeartbeat: (userId) => {
      enqueued.push(userId);
      return true;
    },
  });

  await scheduler.tick();

  assert.equal(selectArgs[0].now.toISOString(), "2026-06-16T00:00:00.000Z");
  assert.equal(selectArgs[0].floorMs, 3_600_000);
  assert.equal(selectArgs[0].limit, 2);
  assert.deepEqual(enqueued, ["user_1", "user_2"]);
});

test("heartbeat scheduler start contains tick failures inside the poll loop", async () => {
  const logged = [];
  const originalError = console.error;
  console.error = (...args) => logged.push(args);
  const scheduler = createHeartbeatScheduler({
    pollIntervalMs: 1_000,
    scheduleRepo: {
      selectDue: async () => {
        throw new Error("database unavailable");
      },
    },
    enqueueHeartbeat: () => true,
  });

  try {
    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    scheduler.stop();
  } finally {
    console.error = originalError;
  }

  assert.equal(logged.length, 1);
});
