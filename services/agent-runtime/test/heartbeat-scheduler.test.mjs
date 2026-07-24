import assert from "node:assert/strict";
import test from "node:test";

import { createHeartbeatScheduler } from "../dist/index.js";

const T0 = new Date("2026-06-16T00:00:00.000Z").getTime();
const FLOOR_MS = 60 * 60_000;

test("heartbeat scheduler resync boot-populates the heap at last_activity + floor and tick fires due users", async () => {
  const enqueued = [];
  let active = [
    // last activity 120m ago → due 60m ago (eligible at T0)
    { userId: "due_user", lastActivityAt: new Date(T0 - 120 * 60_000) },
    // last activity 30m ago → due 30m in the future (not yet)
    { userId: "fresh_user", lastActivityAt: new Date(T0 - 30 * 60_000) },
  ];
  const scheduler = createHeartbeatScheduler({
    scheduleRepo: {
      selectDue: async () => [],
      listAll: async () => active,
    },
    enqueueHeartbeat: (userId) => {
      enqueued.push(userId);
      return true;
    },
    floorMs: FLOOR_MS,
    clock: () => new Date(T0),
  });

  await scheduler.resync();
  await scheduler.tick();

  assert.deepEqual(enqueued, ["due_user"]);
});

test("heartbeat scheduler schedule/cancel/has push directly onto the heap", async () => {
  const enqueued = [];
  const scheduler = createHeartbeatScheduler({
    scheduleRepo: { selectDue: async () => [], listAll: async () => [] },
    enqueueHeartbeat: (userId) => {
      enqueued.push(userId);
      return true;
    },
    floorMs: FLOOR_MS,
    clock: () => new Date(T0),
  });

  assert.equal(scheduler.has("new_user"), false);
  scheduler.schedule("new_user", new Date(T0 - 1));
  assert.equal(scheduler.has("new_user"), true);

  await scheduler.tick();
  assert.deepEqual(enqueued, ["new_user"]);

  scheduler.cancel("new_user");
  await scheduler.tick();
  assert.deepEqual(enqueued, ["new_user"]);
});

test("heartbeat scheduler resync cancels users that left the instance set", async () => {
  const enqueued = [];
  let active = [
    { userId: "kept", lastActivityAt: new Date(T0 - 120 * 60_000) },
    { userId: "gone", lastActivityAt: new Date(T0 - 120 * 60_000) },
  ];
  const scheduler = createHeartbeatScheduler({
    scheduleRepo: {
      selectDue: async () => [],
      listAll: async () => active,
    },
    enqueueHeartbeat: (userId) => {
      enqueued.push(userId);
      return true;
    },
    floorMs: FLOOR_MS,
    clock: () => new Date(T0),
  });

  await scheduler.resync();
  active = [{ userId: "kept", lastActivityAt: new Date(T0 - 120 * 60_000) }];
  await scheduler.resync();
  await scheduler.tick();

  assert.deepEqual(enqueued, ["kept"]);
});

test("heartbeat scheduler escalates consecutive resync failures warn→error and resets on success", async () => {
  const warnings = [];
  const errors = [];
  const failures = ["fail", "fail", "fail", "ok", "fail"];
  let i = 0;
  const scheduler = createHeartbeatScheduler({
    scheduleRepo: {
      selectDue: async () => [],
      listAll: async () => {
        if (failures[i] === "fail") {
          i += 1;
          throw new TypeError("fetch failed");
        }
        i += 1;
        return [];
      },
    },
    enqueueHeartbeat: () => true,
    floorMs: FLOOR_MS,
    clock: () => new Date(T0),
    logger: recordingLogger({ errors, warnings }),
  });

  await scheduler.resync(); // warn #1
  await scheduler.resync(); // warn #2
  await scheduler.resync(); // error #3 (escalate)
  await scheduler.resync(); // success — counter reset
  await scheduler.resync(); // warn again (counter back to 1)

  assert.equal(errors.length, 1);
  assert.equal(warnings.length, 3);
  assert.equal(warnings[0].event, "heartbeat.tick");
  assert.equal(warnings[0].attrs.error_type, "TypeError");
  assert.equal(errors[0].event, "heartbeat.tick");
});

function recordingLogger({ errors, warnings } = {}) {
  return {
    info: () => {},
    warn: (event, attrs) => warnings?.push({ event, attrs }),
    error: (event, error) => errors?.push({ event, error }),
    child: () => recordingLogger({ errors, warnings }),
  };
}
