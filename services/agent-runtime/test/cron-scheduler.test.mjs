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

test("cron scheduler warns instead of erroring on transient database connectivity", async () => {
  const errors = [];
  const warns = [];
  const scheduler = createCronScheduler({
    cronJobsRepo: {
      selectDue: async () => {
        throw new Error("Error connecting to database: TypeError: fetch failed");
      },
    },
    enqueueCron: async () => {},
    pollIntervalMs: 1_000,
    logger: recordingLogger({ errors, warns }),
  });

  try {
    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    scheduler.stop();
  } finally {
    scheduler.stop();
  }

  assert.equal(errors.length, 0);
  assert.equal(warns.length, 1);
  assert.equal(warns[0].event, "cron.tick");
});

test("cron scheduler measures scheduler_lag_ms against the expected poll cadence", async () => {
  const infos = [];
  // clock() is read once at tick entry and once when the next poll is scheduled.
  // First immediate poll -> no prior cadence -> lag 0. Second poll fires at
  // t=1020 against an expected time of 1000+pollInterval(5)=1005 -> lag 15.
  const times = [1000, 1000, 1020];
  const clock = () => new Date(times.length > 1 ? times.shift() : times[0]);
  const scheduler = createCronScheduler({
    cronJobsRepo: { selectDue: async () => [] },
    enqueueCron: async () => {},
    pollIntervalMs: 5,
    clock,
    logger: recordingLogger({ infos }),
  });

  try {
    scheduler.start();
    const deadline = Date.now() + 1_000;
    while (infos.length < 2 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
  } finally {
    scheduler.stop();
  }

  assert.ok(infos.length >= 2, `expected at least two ticks, got ${infos.length}`);
  assert.equal(infos[0].attrs.scheduler_lag_ms, 0);
  assert.equal(infos[1].attrs.scheduler_lag_ms, 15);
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

function recordingLogger({ errors, infos, warns } = {}) {
  return {
    info: (event, attrs) => infos?.push({ event, attrs }),
    warn: (event, attrs) => warns?.push({ event, attrs }),
    error: (event, error, attrs) => errors?.push({ event, error, attrs }),
    child: () => recordingLogger({ errors, infos, warns }),
  };
}
