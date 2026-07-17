import assert from "node:assert/strict";
import test from "node:test";

import { createSchedulerClock } from "../dist/index.js";

test("scheduler clock schedules entries and reports the earliest due instant", () => {
  const clock = makeClock(1000);
  const due = [];
  const c = createSchedulerClock({
    onDue: async (entries) => {
      for (const e of entries) due.push([e.key, e.value]);
    },
    clock,
  });

  c.schedule("a", new Date(3000), "A");
  c.schedule("b", new Date(2000), "B");

  assert.equal(c.size(), 2);
  assert.equal(c.has("a"), true);
  assert.equal(c.has("missing"), false);
  assert.equal(c.nextDueAt().toISOString(), new Date(2000).toISOString());

  c.cancel("b");
  assert.equal(c.size(), 1);
  assert.equal(c.nextDueAt().toISOString(), new Date(3000).toISOString());
});

test("scheduler clock flushDue pops only entries due <= now, in due order", async () => {
  const clock = makeClock(1000);
  const fired = [];
  const c = createSchedulerClock({
    onDue: async (entries) => {
      for (const e of entries) fired.push([e.key, e.value, e.dueAt.getTime()]);
    },
    clock,
  });
  c.schedule("past", new Date(500), "P"); // already due at t=1000
  c.schedule("now", new Date(1000), "N"); // due exactly now
  c.schedule("future", new Date(5000), "F"); // not yet

  await c.flushDue();

  assert.deepEqual(fired, [
    ["past", "P", 500],
    ["now", "N", 1000],
  ]);
  assert.equal(c.size(), 1);
  assert.equal(c.has("future"), true);
});

test("scheduler clock re-scheduling the same key replaces the due instant", async () => {
  const clock = makeClock(1000);
  const fired = [];
  const c = createSchedulerClock({
    onDue: async (entries) => {
      for (const e of entries) fired.push(e.key);
    },
    clock,
  });
  c.schedule("a", new Date(500), "A");
  c.schedule("a", new Date(9000), "A2"); // moved later — no longer due at t=1000

  await c.flushDue();

  assert.deepEqual(fired, []);
  assert.equal(c.size(), 1);
  assert.equal(c.nextDueAt().toISOString(), new Date(9000).toISOString());
});

test("scheduler clock start arms one timer that fires at the earliest due instant", async () => {
  const fired = [];
  const c = createSchedulerClock({
    onDue: async (entries) => {
      for (const e of entries) fired.push(e.key);
    },
  });
  try {
    const now = Date.now();
    c.schedule("due_soon", new Date(now + 20), "V");
    c.schedule("due_later", new Date(now + 60), "V");
    c.start();

    await wait(40);
    assert.deepEqual(fired, ["due_soon"]);

    await wait(40);
    assert.deepEqual(fired, ["due_soon", "due_later"]);
  } finally {
    c.stop();
  }
});

test("scheduler clock contains onDue errors and stays armed for the next entry", async () => {
  const errors = [];
  const fired = [];
  const c = createSchedulerClock({
    onDue: async (entries) => {
      for (const e of entries) {
        if (e.key === "boom") throw new Error("onDue exploded");
        fired.push(e.key);
      }
    },
    logger: recordingLogger({ errors }),
  });
  try {
    const now = Date.now();
    c.schedule("boom", new Date(now + 15), "X");
    c.schedule("ok", new Date(now + 35), "X");
    c.start();

    await wait(60);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].event, "scheduler_clock.fire");
    assert.deepEqual(fired, ["ok"]);
  } finally {
    c.stop();
  }
});

function makeClock(epochMs) {
  let t = epochMs;
  return () => {
    t += 0; // frozen unless advanced externally
    return new Date(t);
  };
}

async function flush() {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function recordingLogger({ errors } = {}) {
  return {
    info: () => {},
    warn: () => {},
    error: (event, error) => errors?.push({ event, error }),
    child: () => recordingLogger({ errors }),
  };
}
