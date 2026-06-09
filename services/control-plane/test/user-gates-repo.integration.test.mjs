/**
 * Repo-layer integration test (ADR-0003): the real `0002_user_gates.sql` + the
 * real upserts, against a disposable Neon branch. Proves the database-enforced
 * invariants a fake repo can't — that recording a gate is idempotent and
 * preserves the first-completion timestamp, and that gate state can only exist
 * for a known User (the FK).
 *
 * Skips when `NEON_API_KEY` / `NEON_PROJECT_ID` are absent so local runs without
 * credentials stay green; CI supplies the secret and runs it for real.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createUserGatesRepo } from "../dist/domains/gates/repo/user-gates.js";
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

let branchId;
let repo;
let users;
let sql;

before(async () => {
  if (skip) return;
  const branch = await createBranch();
  branchId = branch.branchId;
  await applySql(branch.connectionUri, "CREATE SCHEMA IF NOT EXISTS control_plane;");
  // user_gates FKs into users, so both migrations must be applied, in order.
  await applyMigrationFile(branch.connectionUri, path.join(migrationsDir, "0001_users.sql"));
  await applyMigrationFile(branch.connectionUri, path.join(migrationsDir, "0002_user_gates.sql"));
  sql = await connect(branch.connectionUri);
  repo = createUserGatesRepo(sql);
  users = createUsersRepo(sql);
});

after(async () => {
  await dropBranch(branchId);
});

test("a user with no recorded gates reads as nothing completed", { skip }, async () => {
  const { userId } = await users.resolveUser({ sub: "sub-empty" });

  assert.deepEqual(await repo.readState(userId), {
    consentCompleted: false,
    siblingSkipped: false,
  });
});

test("recording consent makes it read as completed", { skip }, async () => {
  const { userId } = await users.resolveUser({ sub: "sub-consent" });

  await repo.recordConsent(userId);

  assert.deepEqual(await repo.readState(userId), {
    consentCompleted: true,
    siblingSkipped: false,
  });
});

test(
  "re-recording consent is idempotent and keeps the first-completion time",
  { skip },
  async () => {
    const { userId } = await users.resolveUser({ sub: "sub-consent-twice" });

    await repo.recordConsent(userId);
    const [{ consent_completed_at: first }] = await sql`
    SELECT consent_completed_at FROM control_plane.user_gates WHERE user_id = ${userId}
  `;
    await repo.recordConsent(userId);
    const [{ consent_completed_at: second }] = await sql`
    SELECT consent_completed_at FROM control_plane.user_gates WHERE user_id = ${userId}
  `;

    assert.equal(first.getTime(), second.getTime(), "a re-record must not move the timestamp");
  },
);

test("recording a sibling skip makes it read as resolved, idempotently", { skip }, async () => {
  const { userId } = await users.resolveUser({ sub: "sub-sibling" });

  await repo.recordSiblingSkip(userId);
  const [{ sibling_skip_at: first }] = await sql`
    SELECT sibling_skip_at FROM control_plane.user_gates WHERE user_id = ${userId}
  `;
  await repo.recordSiblingSkip(userId);
  const [{ sibling_skip_at: second }] = await sql`
    SELECT sibling_skip_at FROM control_plane.user_gates WHERE user_id = ${userId}
  `;

  assert.deepEqual(await repo.readState(userId), {
    consentCompleted: false,
    siblingSkipped: true,
  });
  assert.equal(first.getTime(), second.getTime(), "a re-record must not move the timestamp");
});

test("recording for an unknown user id fails the foreign key", { skip }, async () => {
  // A random uuid that was never inserted into users.
  const ghost = "00000000-0000-0000-0000-000000000000";
  await assert.rejects(() => repo.recordConsent(ghost), /foreign key|violates|constraint/i);
});
