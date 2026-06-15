import assert from "node:assert/strict";
import test from "node:test";

import { computeNextFireAt, parseSchedule, resolveTz } from "../dist/index.js";

test("schedule math computes every and cron next fire times", () => {
  const from = new Date("2026-06-16T00:00:00.000Z");

  assert.equal(
    computeNextFireAt(parseSchedule("every 5m"), "UTC", from).toISOString(),
    "2026-06-16T00:05:00.000Z",
  );
  assert.equal(
    computeNextFireAt(parseSchedule("cron */5 * * * *"), "UTC", from).toISOString(),
    "2026-06-16T00:05:00.000Z",
  );
});

test("schedule math rejects intervals below the 5 minute floor", () => {
  const from = new Date("2026-06-16T00:00:00.000Z");

  assert.throws(() => computeNextFireAt(parseSchedule("every 2m"), "UTC", from), /5 minutes/);
  assert.throws(() => computeNextFireAt(parseSchedule("cron * * * * *"), "UTC", from), /5 minutes/);
});

test("timezone resolution prefers job override then user timezone then UTC", () => {
  assert.equal(resolveTz("America/New_York", "Asia/Kolkata"), "America/New_York");
  assert.equal(resolveTz(null, "Asia/Kolkata"), "Asia/Kolkata");
  assert.equal(resolveTz(null, null), "UTC");
  assert.throws(() => resolveTz("Not/AZone", null), /Invalid IANA timezone/);
});
