import assert from "node:assert/strict";
import test from "node:test";

import { createCronScheduler } from "../dist/index.js";

const T0 = new Date("2026-06-16T00:00:00.000Z").getTime();

test("cron scheduler resync boot-populates the heap and tick fires only due jobs", async () => {
  const fired = [];
  const due = job("job_due", new Date(T0 - 60_000)); // already due
  const future = job("job_future", new Date(T0 + 60_000)); // not yet
  const scheduler = createCronScheduler({
    cronJobsRepo: {
      listActive: async () => [due, future],
      selectDue: async () => [],
    },
    enqueueCron: async (cronJob, context) => {
      fired.push([cronJob.id, context.firedAt.toISOString()]);
    },
    clock: () => new Date(T0),
  });

  await scheduler.resync();
  await scheduler.tick();

  assert.deepEqual(fired, [["job_due", "2026-06-16T00:00:00.000Z"]]);
});

test("cron scheduler schedule/cancel push directly onto the heap", async () => {
  const fired = [];
  const scheduler = createCronScheduler({
    cronJobsRepo: { listActive: async () => [], selectDue: async () => [] },
    enqueueCron: async (cronJob) => fired.push(cronJob.id),
    clock: () => new Date(T0),
  });

  scheduler.schedule("manual", new Date(T0 - 1), job("manual", new Date(T0 - 1)));
  scheduler.schedule("later", new Date(T0 + 60_000), job("later", new Date(T0 + 60_000)));
  await scheduler.tick();
  assert.deepEqual(fired, ["manual"]);

  scheduler.cancel("later");
  scheduler.schedule("now2", new Date(T0 - 1), job("now2", new Date(T0 - 1)));
  await scheduler.tick();
  assert.deepEqual(fired, ["manual", "now2"]);
});

test("cron scheduler resync cancels heap entries that left the active set", async () => {
  const fired = [];
  let active = [job("kept", new Date(T0 - 1)), job("gone", new Date(T0 - 1))];
  const scheduler = createCronScheduler({
    cronJobsRepo: {
      listActive: async () => active,
      selectDue: async () => [],
    },
    enqueueCron: async (cronJob) => fired.push(cronJob.id),
    clock: () => new Date(T0),
  });

  await scheduler.resync(); // both loaded
  active = [job("kept", new Date(T0 - 1))]; // "gone" was deleted in Neon
  await scheduler.resync(); // reconcile: "gone" removed, "kept" refreshed
  await scheduler.tick();

  assert.deepEqual(fired, ["kept"]);
});

test("cron scheduler resync contains transient repository failures with a warning", async () => {
  const warns = [];
  const errors = [];
  const scheduler = createCronScheduler({
    cronJobsRepo: {
      listActive: async () => {
        throw new Error("Error connecting to database: TypeError: fetch failed");
      },
      selectDue: async () => [],
    },
    enqueueCron: async () => {},
    clock: () => new Date(T0),
    logger: recordingLogger({ errors, warns }),
  });

  await scheduler.resync(); // must not reject

  assert.equal(errors.length, 0);
  assert.equal(warns.length, 1);
  assert.equal(warns[0].event, "cron.resync");
});

test("cron scheduler resync escalates non-transient repository failures to an error", async () => {
  const errors = [];
  const scheduler = createCronScheduler({
    cronJobsRepo: {
      listActive: async () => {
        throw new Error("syntax error in query");
      },
      selectDue: async () => [],
    },
    enqueueCron: async () => {},
    clock: () => new Date(T0),
    logger: recordingLogger({ errors }),
  });

  await scheduler.resync();

  assert.equal(errors.length, 1);
  assert.equal(errors[0].event, "cron.resync");
});

test("cron scheduler start contains boot-populate failures and never rejects", async () => {
  const unhandled = [];
  const errors = [];
  const onUnhandled = (error) => unhandled.push(error);
  process.on("unhandledRejection", onUnhandled);
  try {
    const scheduler = createCronScheduler({
      cronJobsRepo: {
        listActive: async () => {
          throw new Error("database unavailable");
        },
        selectDue: async () => [],
      },
      enqueueCron: async () => {},
      clock: () => new Date(T0),
      logger: recordingLogger({ errors }),
    });

    scheduler.start(); // fire-and-forget; boot fails async
    await new Promise((resolve) => setTimeout(resolve, 10));
    scheduler.stop();

    assert.deepEqual(unhandled, []);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].event, "cron.boot");
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("cron scheduler retries through coarse resync after boot population fails", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const fired = [];
  let reloads = 0;
  const scheduler = createCronScheduler({
    cronJobsRepo: {
      listActive: async () => {
        reloads += 1;
        if (reloads === 1) {
          throw new Error("database unavailable");
        }
        return [job("recovered", new Date(T0 - 1))];
      },
      selectDue: async () => [],
    },
    enqueueCron: async (cronJob) => fired.push(cronJob.id),
    clock: () => new Date(T0),
    resyncIntervalMs: 1_000,
  });
  t.after(() => scheduler.stop());

  scheduler.start();
  await settleAsyncWork();
  t.mock.timers.tick(1_000);
  await settleAsyncWork();
  await scheduler.tick();

  assert.equal(reloads, 2);
  assert.deepEqual(fired, ["recovered"]);
});

test("cron scheduler does not activate or apply a boot reload after stop", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const fired = [];
  const bootReload = deferred();
  let reloads = 0;
  const scheduler = createCronScheduler({
    cronJobsRepo: {
      listActive: async () => {
        reloads += 1;
        return bootReload.promise;
      },
      selectDue: async () => [],
    },
    enqueueCron: async (cronJob) => fired.push(cronJob.id),
    clock: () => new Date(T0),
    resyncIntervalMs: 1_000,
  });
  t.after(() => scheduler.stop());

  scheduler.start();
  scheduler.stop();
  bootReload.resolve([job("stale", new Date(T0 - 1))]);
  await settleAsyncWork();
  t.mock.timers.tick(10_000);
  await settleAsyncWork();

  assert.equal(reloads, 1);
  assert.deepEqual(fired, []);
});

test("cron scheduler discards a periodic reload from an older lifecycle", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const fired = [];
  const staleReload = deferred();
  let reloads = 0;
  const scheduler = createCronScheduler({
    cronJobsRepo: {
      listActive: async () => {
        reloads += 1;
        if (reloads === 1) return [];
        if (reloads === 2) return staleReload.promise;
        return [job("fresh", new Date(T0 - 1))];
      },
      selectDue: async () => [],
    },
    enqueueCron: async (cronJob) => fired.push(cronJob.id),
    clock: () => new Date(T0),
    resyncIntervalMs: 1_000,
  });
  t.after(() => scheduler.stop());

  scheduler.start();
  await settleAsyncWork();
  t.mock.timers.tick(1_000);
  await settleAsyncWork();
  scheduler.stop();
  scheduler.start();
  await settleAsyncWork();
  staleReload.resolve([job("stale", new Date(T0 - 1))]);
  await settleAsyncWork();
  await scheduler.tick();

  assert.equal(reloads, 3);
  assert.deepEqual(fired, ["fresh"]);
});

function job(id, nextFireAt) {
  return {
    id,
    userId: "user_1",
    path: `/${id}.md`,
    name: id,
    scheduleKind: "at",
    scheduleExpr: "2026-06-16T00:00:00.000Z",
    tz: null,
    status: "active",
    nextFireAt,
    prompt: "wake",
    attemptCount: 0,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function settleAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function recordingLogger({ errors, warns } = {}) {
  return {
    info: () => {},
    warn: (event) => warns?.push({ event }),
    error: (event, error) => errors?.push({ event, error }),
    child: () => recordingLogger({ errors, warns }),
  };
}
