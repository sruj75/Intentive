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
  const errors = [];
  const onUnhandled = (error) => {
    unhandled.push(error);
  };
  process.on("unhandledRejection", onUnhandled);

  const scheduler = createCronScheduler({
    cronJobsRepo: {
      selectDue: async () => {
        throw new Error("database unavailable");
      },
    },
    enqueueCron: async () => {},
    pollIntervalMs: 1_000,
    logger: recordingLogger({ errors }),
  });

  try {
    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    scheduler.stop();
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }

  assert.deepEqual(unhandled, []);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].event, "cron.tick");
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

function recordingLogger({ errors }) {
  return {
    info: () => {},
    warn: () => {},
    error: (event, error, attrs) => errors.push({ event, error, attrs }),
    child: () => recordingLogger({ errors }),
  };
}
