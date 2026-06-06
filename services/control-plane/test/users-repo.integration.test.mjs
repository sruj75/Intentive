/**
 * Repo-layer integration test (ADR-0003): the real `0001_users.sql` + the real
 * upsert, against a disposable Neon branch. Proves the database-enforced
 * invariant a fake repo can't — that create-or-resolve is idempotent on `sub`.
 *
 * Skips when `NEON_API_KEY` / `NEON_PROJECT_ID` are absent so local runs without
 * credentials stay green; CI supplies the secret and runs it for real.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
const migration = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../migrations/0001_users.sql",
);

let branchId;
let repo;
let sql;

before(async () => {
  if (skip) return;
  const branch = await createBranch();
  branchId = branch.branchId;
  // The schema + role are #50's job in production; on a throwaway test branch we
  // bootstrap just the schema namespace so the migration can create its table.
  await applySql(branch.connectionUri, "CREATE SCHEMA IF NOT EXISTS control_plane;");
  await applyMigrationFile(branch.connectionUri, migration);
  sql = await connect(branch.connectionUri);
  repo = createUsersRepo(sql);
});

after(async () => {
  await dropBranch(branchId);
});

test("the same sub resolves to one row and a stable user id", { skip }, async () => {
  const first = await repo.resolveUser({ sub: "sub-alice" });
  const second = await repo.resolveUser({ sub: "sub-alice" });

  assert.equal(first.userId, second.userId, "same sub must map to the same user id");

  const [{ count }] = await sql`
    SELECT count(*)::int AS count FROM control_plane.users WHERE sub = 'sub-alice'
  `;
  assert.equal(count, 1, "a repeated sign-in must not create a second row");
});

test("different subs get distinct user ids and rows", { skip }, async () => {
  const a = await repo.resolveUser({ sub: "sub-bob" });
  const b = await repo.resolveUser({ sub: "sub-carol" });

  assert.notEqual(a.userId, b.userId);

  const [{ count }] = await sql`
    SELECT count(*)::int AS count
    FROM control_plane.users
    WHERE sub IN ('sub-bob', 'sub-carol')
  `;
  assert.equal(count, 2);
});
