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

test("heartbeat scheduler preserves an external Opening retry scheduled while resync is loading", async () => {
  const enqueued = [];
  const reload = deferred();
  const scheduler = createHeartbeatScheduler({
    scheduleRepo: {
      selectDue: async () => [],
      listAll: async () => reload.promise,
    },
    enqueueHeartbeat: (userId) => {
      enqueued.push(userId);
      return true;
    },
    floorMs: FLOOR_MS,
    clock: () => new Date(T0),
  });

  const resync = scheduler.resync();
  scheduler.schedule("opening_user", new Date(T0 - 1));
  reload.resolve([]);
  await resync;

  assert.equal(scheduler.has("opening_user"), true);
  await scheduler.tick();
  assert.deepEqual(enqueued, ["opening_user"]);
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

test("heartbeat scheduler retries through coarse resync after boot population fails", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const enqueued = [];
  let reloads = 0;
  const scheduler = createHeartbeatScheduler({
    scheduleRepo: {
      selectDue: async () => [],
      listAll: async () => {
        reloads += 1;
        if (reloads === 1) {
          throw new TypeError("fetch failed");
        }
        return [{ userId: "recovered", lastActivityAt: new Date(T0 - 2 * FLOOR_MS) }];
      },
    },
    enqueueHeartbeat: (userId) => {
      enqueued.push(userId);
      return true;
    },
    floorMs: FLOOR_MS,
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
  assert.deepEqual(enqueued, ["recovered"]);
});

test("heartbeat scheduler does not activate or apply a boot reload after stop", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const enqueued = [];
  const bootReload = deferred();
  let reloads = 0;
  const scheduler = createHeartbeatScheduler({
    scheduleRepo: {
      selectDue: async () => [],
      listAll: async () => {
        reloads += 1;
        return bootReload.promise;
      },
    },
    enqueueHeartbeat: (userId) => {
      enqueued.push(userId);
      return true;
    },
    floorMs: FLOOR_MS,
    clock: () => new Date(T0),
    resyncIntervalMs: 1_000,
  });
  t.after(() => scheduler.stop());

  scheduler.start();
  scheduler.stop();
  bootReload.resolve([{ userId: "stale", lastActivityAt: new Date(T0 - 2 * FLOOR_MS) }]);
  await settleAsyncWork();
  t.mock.timers.tick(10_000);
  await settleAsyncWork();

  assert.equal(reloads, 1);
  assert.deepEqual(enqueued, []);
});

test("heartbeat scheduler discards a periodic reload from an older lifecycle", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const enqueued = [];
  const staleReload = deferred();
  let reloads = 0;
  const scheduler = createHeartbeatScheduler({
    scheduleRepo: {
      selectDue: async () => [],
      listAll: async () => {
        reloads += 1;
        if (reloads === 1) return [];
        if (reloads === 2) return staleReload.promise;
        return [{ userId: "fresh", lastActivityAt: new Date(T0 - 2 * FLOOR_MS) }];
      },
    },
    enqueueHeartbeat: (userId) => {
      enqueued.push(userId);
      return true;
    },
    floorMs: FLOOR_MS,
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
  staleReload.resolve([{ userId: "stale", lastActivityAt: new Date(T0 - 2 * FLOOR_MS) }]);
  await settleAsyncWork();
  await scheduler.tick();

  assert.equal(reloads, 3);
  assert.deepEqual(enqueued, ["fresh"]);
});

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

function recordingLogger({ errors, warnings } = {}) {
  return {
    info: () => {},
    warn: (event, attrs) => warnings?.push({ event, attrs }),
    error: (event, error) => errors?.push({ event, error }),
    child: () => recordingLogger({ errors, warnings }),
  };
}
