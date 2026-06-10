/**
 * Repo-layer integration test (ADR-0003): the real `0004_agent_instances.sql` +
 * the real upsert, against a disposable Neon branch. Proves the database-enforced
 * invariants a fake repo can't — one-row-per-user idempotency (the PK on
 * `user_id`), the `hasInstance` false→true flip, and the FK to users. Applies
 * `0001_users.sql` first so the FK target exists.
 *
 * Skips when `NEON_API_KEY` / `NEON_PROJECT_ID` are absent so local runs without
 * credentials stay green; CI supplies the secret and runs it for real.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createAgentInstancesRepo } from "../dist/domains/agents/repo/agent-instances.js";
import { createUsersRepo } from "../dist/domains/identity/repo/users.js";
import {
  connect,
  createBranch,
  dropBranch,
  hasNeonBranchCreds,
  applySql,
  applyMigrationFile,
} from "./helpers/neon-branch.mjs";

const skip = !hasNeonBranchCreds();
const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
const usersMigration = path.join(migrationsDir, "0001_users.sql");
const agentInstancesMigration = path.join(migrationsDir, "0004_agent_instances.sql");

let branchId;
let repo;
let users;
let sql;

before(async () => {
  if (skip) return;
  const branch = await createBranch();
  branchId = branch.branchId;
  // The schema + role are #50's job in production; on a throwaway test branch we
  // bootstrap just the schema namespace so the migrations can create their tables.
  await applySql(branch.connectionUri, "CREATE SCHEMA IF NOT EXISTS control_plane;");
  await applyMigrationFile(branch.connectionUri, usersMigration);
  await applyMigrationFile(branch.connectionUri, agentInstancesMigration);
  sql = await connect(branch.connectionUri);
  repo = createAgentInstancesRepo(sql);
  users = createUsersRepo(sql);
});

after(async () => {
  await dropBranch(branchId);
});

test("first recordInstance creates exactly one row and flips hasInstance", { skip }, async () => {
  const { userId } = await users.resolveUser({ sub: "sub-agent-1" });

  assert.equal(await repo.hasInstance(userId), false, "no instance before recording");

  await repo.recordInstance({ userId, agentInstanceId: "agent_1" });

  assert.equal(await repo.hasInstance(userId), true, "hasInstance flips true after recording");
  const [{ count }] = await sql`
    SELECT count(*)::int AS count FROM control_plane.agent_instances WHERE user_id = ${userId}
  `;
  assert.equal(count, 1);
});

test(
  "recording again keeps one row (PK idempotency) and keeps the latest id",
  { skip },
  async () => {
    const { userId } = await users.resolveUser({ sub: "sub-agent-2" });
    await repo.recordInstance({ userId, agentInstanceId: "agent_old" });
    await repo.recordInstance({ userId, agentInstanceId: "agent_new" });

    const rows = await sql`
    SELECT agent_instance_id FROM control_plane.agent_instances WHERE user_id = ${userId}
  `;
    assert.equal(rows.length, 1, "a repeat must not create a second row");
    assert.equal(rows[0].agent_instance_id, "agent_new", "the upsert keeps the latest instance id");
  },
);

test("recording for an unknown user is rejected by the foreign key", { skip }, async () => {
  await assert.rejects(() =>
    repo.recordInstance({
      userId: "00000000-0000-0000-0000-000000000000",
      agentInstanceId: "agent_x",
    }),
  );
});
