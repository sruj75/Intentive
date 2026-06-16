import assert from "node:assert/strict";
import test from "node:test";

import { createCronScheduler } from "../dist/index.js";

test("cron scheduler tick fires due rows once and respects batch limit", async () => {
  const fired = [];
  const due = [job("job_1"), job("job_2")];
  const scheduler = createCronScheduler({
    cronJobsRepo: {
      selectDue: async ({ limit }) => due.slice(0, limit),
    },
    enqueueCron: async (cronJob, context) => {
      fired.push([cronJob.id, context.firedAt.toISOString()]);
    },
    clock: () => new Date("2026-06-16T00:00:00.000Z"),
    batchLimit: 1,
  });

  await scheduler.tick();

  assert.deepEqual(fired, [["job_1", "2026-06-16T00:00:00.000Z"]]);
});

test("cron scheduler start contains tick failures inside the poll loop", async () => {
  const unhandled = [];
  const logged = [];
  const onUnhandled = (error) => {
    unhandled.push(error);
  };
  process.on("unhandledRejection", onUnhandled);
  const originalError = console.error;
  console.error = (...args) => {
    logged.push(args);
  };

  const scheduler = createCronScheduler({
    cronJobsRepo: {
      selectDue: async () => {
        throw new Error("database unavailable");
      },
    },
    enqueueCron: async () => {},
    pollIntervalMs: 1_000,
  });

  try {
    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    scheduler.stop();
  } finally {
    process.off("unhandledRejection", onUnhandled);
    console.error = originalError;
  }

  assert.deepEqual(unhandled, []);
  assert.equal(logged.length, 1);
});

function job(id) {
  return {
    id,
    userId: "user_1",
    path: `/${id}.md`,
    name: id,
    scheduleKind: "at",
    scheduleExpr: "2026-06-16T00:00:00.000Z",
    tz: null,
    status: "active",
    nextFireAt: new Date("2026-06-16T00:00:00.000Z"),
    prompt: "wake",
    attemptCount: 0,
  };
}
