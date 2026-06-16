import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createCronJobsRepo, createCronScheduler, createRuntimeTurnsRepo } from "../dist/index.js";
import {
  applyMigrationFile,
  applySql,
  connect,
  createBranch,
  dropBranch,
  hasNeonBranchCreds,
} from "./helpers/neon-branch.mjs";

const skip = !hasNeonBranchCreds();
const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

let branchId;
let connectionUri;

before(async () => {
  if (skip) return;
  const branch = await createBranch();
  branchId = branch.branchId;
  connectionUri = branch.connectionUri;
  await applySql(connectionUri, "CREATE SCHEMA IF NOT EXISTS agent_runtime;");
  for (const file of [
    "0003_runtime_turns.sql",
    "0004_runtime_turns_bundle_version.sql",
    "0006_cron_jobs.sql",
  ]) {
    await applyMigrationFile(connectionUri, path.join(migrationsDir, file));
  }
});

after(async () => {
  await dropBranch(branchId);
});

test("cron due rows and Runtime Turns survive process re-instantiation", { skip }, async () => {
  const userId = randomUUID();
  const firstSql = await connect(connectionUri);
  const firstCronJobs = createCronJobsRepo(firstSql);
  const firstRuntimeTurns = createRuntimeTurnsRepo(firstSql);
  await firstSql.transaction([
    firstCronJobs.upsertQuery({
      userId,
      path: "/wake.md",
      name: "wake",
      scheduleKind: "at",
      scheduleExpr: "2026-06-16T00:00:00.000Z",
      tz: null,
      status: "active",
      nextFireAt: new Date("2026-06-16T00:00:00.000Z"),
      prompt: "wake",
    }),
    firstRuntimeTurns.recordQuery({
      userId,
      threadId: userId,
      traceId: "trace_1",
      model: "test-model",
      bundleVersion: "floor_v1",
      status: "ok",
      error: null,
    }),
  ]);

  const restartedSql = await connect(connectionUri);
  const restartedCronJobs = createCronJobsRepo(restartedSql);
  const due = await restartedCronJobs.selectDue({
    now: new Date("2026-06-16T00:01:00.000Z"),
    limit: 10,
  });
  assert.equal(due.length, 1);
  assert.equal(due[0].userId, userId);

  const enqueued = [];
  const scheduler = createCronScheduler({
    cronJobsRepo: restartedCronJobs,
    clock: () => new Date("2026-06-16T00:01:00.000Z"),
    enqueueCron: async (job) => {
      enqueued.push(job.id);
    },
  });
  await scheduler.tick();
  assert.deepEqual(enqueued, [due[0].id]);

  const turnRows = await restartedSql`
    SELECT trace_id, model, bundle_version, status
    FROM agent_runtime.runtime_turns
    WHERE user_id = ${userId}
  `;
  assert.deepEqual(turnRows, [
    {
      trace_id: "trace_1",
      model: "test-model",
      bundle_version: "floor_v1",
      status: "ok",
    },
  ]);
});
