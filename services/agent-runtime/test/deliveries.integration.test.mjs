import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createDeliveriesRepo } from "../dist/index.js";
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
const deliveriesMigration = path.join(migrationsDir, "0009_deliveries.sql");

let branchId;
let sql;
let deliveries;

before(async () => {
  if (skip) return;
  const branch = await createBranch();
  branchId = branch.branchId;
  await applySql(branch.connectionUri, "CREATE SCHEMA IF NOT EXISTS agent_runtime;");
  await applyMigrationFile(branch.connectionUri, deliveriesMigration);
  sql = await connect(branch.connectionUri);
  deliveries = createDeliveriesRepo(sql);
});

after(async () => {
  await dropBranch(branchId);
});

test("deliveries repo records stream and push attempts for one message", { skip }, async () => {
  const userId = randomUUID();
  await deliveries.recordQuery({
    userId,
    messageId: "message_1",
    path: "stream",
    clientKind: "mobile",
    status: "ok",
    error: null,
    attemptedAt: new Date("2026-06-16T00:00:00.000Z"),
  });
  await deliveries.recordQuery({
    userId,
    messageId: "message_1",
    path: "push",
    clientKind: null,
    status: "failed",
    error: "cp unavailable",
    attemptedAt: new Date("2026-06-16T00:01:00.000Z"),
  });

  const rows = await sql`
    SELECT path, client_kind, status, error
    FROM agent_runtime.deliveries
    WHERE user_id = ${userId} AND message_id = 'message_1'
    ORDER BY attempted_at ASC
  `;

  assert.deepEqual(rows, [
    { path: "stream", client_kind: "mobile", status: "ok", error: null },
    { path: "push", client_kind: null, status: "failed", error: "cp unavailable" },
  ]);
});
