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

test("heartbeat scheduler start contains tick failures inside the poll loop", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const warnings = [];
  const scheduler = createHeartbeatScheduler({
    pollIntervalMs: 1_000,
    scheduleRepo: {
      selectDue: async () => {
        throw new Error("database unavailable");
      },
    },
    enqueueHeartbeat: () => true,
    logger: recordingLogger({ warnings }),
  });
  t.after(() => scheduler.stop());

  scheduler.start();
  await runNextPoll(t);
  scheduler.stop();

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].event, "heartbeat.tick");
  assert.equal(warnings[0].attrs.status, "failed");
});

test("heartbeat scheduler escalates only after consecutive tick failures", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const warnings = [];
  const errors = [];
  const scheduler = createHeartbeatScheduler({
    pollIntervalMs: 1,
    escalateAfterConsecutiveFailures: 3,
    scheduleRepo: {
      selectDue: async () => {
        throw new TypeError("fetch failed");
      },
    },
    enqueueHeartbeat: () => true,
    logger: recordingLogger({ errors, warnings }),
  });
  t.after(() => scheduler.stop());

  scheduler.start();
  await runNextPoll(t);
  await runNextPoll(t, 1);
  await runNextPoll(t, 1);
  scheduler.stop();

  assert.equal(warnings.length, 2);
  assert.equal(errors.length, 1);
  assert.equal(warnings[0].event, "heartbeat.tick");
  assert.equal(warnings[0].attrs.error_type, "TypeError");
  assert.equal(errors[0].event, "heartbeat.tick");
});

test("heartbeat scheduler success resets consecutive failure escalation", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const warnings = [];
  const errors = [];
  const results = [{ type: "reject" }, { type: "reject" }, { type: "resolve" }, { type: "reject" }];
  const scheduler = createHeartbeatScheduler({
    pollIntervalMs: 1,
    escalateAfterConsecutiveFailures: 3,
    scheduleRepo: {
      selectDue: async () => {
        const result = results.shift();
        if (result?.type === "reject") {
          throw new TypeError("fetch failed");
        }
        return [];
      },
    },
    enqueueHeartbeat: () => true,
    logger: recordingLogger({ errors, warnings }),
  });
  t.after(() => scheduler.stop());

  scheduler.start();
  await runNextPoll(t);
  await runNextPoll(t, 1);
  await runNextPoll(t, 1);
  await runNextPoll(t, 1);
  scheduler.stop();

  assert.equal(errors.length, 0);
  assert.equal(warnings.length, 3);
});

test("heartbeat scheduler measures scheduler_lag_ms against the expected poll cadence", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const infos = [];
  // clock() is read once at tick entry and once when the next poll is scheduled.
  // First immediate poll -> no prior cadence -> lag 0. Second poll fires at
  // t=1020 against an expected time of 1000+pollInterval(5)=1005 -> lag 15.
  const times = [1000, 1000, 1020];
  const clock = () => new Date(times.length > 1 ? times.shift() : times[0]);
  const scheduler = createHeartbeatScheduler({
    scheduleRepo: { selectDue: async () => [] },
    enqueueHeartbeat: () => true,
    pollIntervalMs: 5,
    clock,
    logger: recordingLogger({ infos }),
  });
  t.after(() => scheduler.stop());

  scheduler.start();
  await runNextPoll(t);
  await runNextPoll(t, 5);
  scheduler.stop();

  assert.ok(infos.length >= 2, `expected at least two ticks, got ${infos.length}`);
  assert.equal(infos[0].attrs.scheduler_lag_ms, 0);
  assert.equal(infos[1].attrs.scheduler_lag_ms, 15);
});

async function runNextPoll(t, advanceMs = 0) {
  t.mock.timers.tick(advanceMs);
  // The timer starts an async loop whose tick awaits the repository before its
  // finally block schedules the next poll. Flush that promise chain so each
  // clock advance represents exactly one completed poll.
  for (let step = 0; step < 4; step += 1) {
    await Promise.resolve();
  }
}

function recordingLogger({ errors, infos, warnings } = {}) {
  return {
    info: (event, attrs) => infos?.push({ event, attrs }),
    warn: (event, attrs) => warnings?.push({ event, attrs }),
    error: (event, error, attrs) => errors?.push({ event, error, attrs }),
    child: () => recordingLogger({ errors, infos, warnings }),
  };
}
