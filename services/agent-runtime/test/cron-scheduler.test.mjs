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
    fireCron: async (cronJob, context) => {
      fired.push([cronJob.id, context.firedAt.toISOString()]);
    },
    clock: () => new Date("2026-06-16T00:00:00.000Z"),
    batchLimit: 1,
  });

  await scheduler.tick();

  assert.deepEqual(fired, [["job_1", "2026-06-16T00:00:00.000Z"]]);
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
