import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createHeartbeatScheduleRepo } from "../dist/index.js";
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
let sql;
let schedule;

before(async () => {
  if (skip) return;
  const branch = await createBranch();
  branchId = branch.branchId;
  await applySql(branch.connectionUri, "CREATE SCHEMA IF NOT EXISTS agent_runtime;");
  await applyMigrationFile(branch.connectionUri, path.join(migrationsDir, "0001_sessions.sql"));
  await applyMigrationFile(
    branch.connectionUri,
    path.join(migrationsDir, "0003_runtime_turns.sql"),
  );
  sql = await connect(branch.connectionUri);
  schedule = createHeartbeatScheduleRepo(sql);
});

after(async () => {
  await dropBranch(branchId);
});

test(
  "heartbeat schedule computes due users from instance baseline and latest Runtime Turn",
  { skip },
  async () => {
    const dueUser = randomUUID();
    const freshUser = randomUUID();
    const turnedUser = randomUUID();
    await sql`
    INSERT INTO agent_runtime.agent_instances (user_id, auth_subject, created_at)
    VALUES
      (${dueUser}, ${`auth_${dueUser}`}, '2026-06-16T00:00:00.000Z'),
      (${freshUser}, ${`auth_${freshUser}`}, '2026-06-16T01:30:00.000Z'),
      (${turnedUser}, ${`auth_${turnedUser}`}, '2026-06-16T00:00:00.000Z')
  `;
    await sql`
    INSERT INTO agent_runtime.runtime_turns (user_id, thread_id, trace_id, model, status, error, created_at)
    VALUES (${turnedUser}, ${turnedUser}, null, 'model', 'ok', null, '2026-06-16T01:30:00.000Z')
  `;

    const due = await schedule.selectDue({
      now: new Date("2026-06-16T02:00:00.000Z"),
      floorMs: 60 * 60_000,
      limit: 10,
    });

    assert.deepEqual(
      due.map((row) => row.userId),
      [dueUser],
    );
  },
);
