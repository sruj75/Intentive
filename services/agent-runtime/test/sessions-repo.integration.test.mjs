import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createAgentInstanceRepo, createEventLedger } from "../dist/index.js";
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
const sessionsMigration = path.join(migrationsDir, "0001_sessions.sql");

let branchId;
let sql;
let instances;
let ledger;

before(async () => {
  if (skip) return;
  const branch = await createBranch();
  branchId = branch.branchId;
  await applySql(branch.connectionUri, "CREATE SCHEMA IF NOT EXISTS agent_runtime;");
  await applyMigrationFile(branch.connectionUri, sessionsMigration);
  sql = await connect(branch.connectionUri);
  instances = createAgentInstanceRepo(sql);
  ledger = createEventLedger(sql);
});

after(async () => {
  await dropBranch(branchId);
});

test("agent_instances loadOrCreate is idempotent per User", { skip }, async () => {
  const userId = randomUUID();

  const first = await instances.loadOrCreate({ authSubject: "sub-repo-1", userId });
  const again = await instances.loadOrCreate({ authSubject: "sub-repo-1", userId });

  assert.equal(again.id, first.id);
  assert.deepEqual(await instances.loadByAuthSubject("sub-repo-1"), first);

  const [{ count }] = await sql`
    SELECT count(*)::int AS count FROM agent_runtime.agent_instances WHERE user_id = ${userId}
  `;
  assert.equal(count, 1);
});

test("runtime_events suppress duplicate keys per User and kind", { skip }, async () => {
  const userId = randomUUID();
  const record = {
    userId,
    kind: "user_message",
    dedupKey: "message_1",
    payload: userMessage("message_1"),
  };

  assert.deepEqual(await ledger.recordIfNew(record), { isNew: true });
  assert.deepEqual(await ledger.recordIfNew(record), { isNew: false });

  const [{ count }] = await sql`
    SELECT count(*)::int AS count FROM agent_runtime.runtime_events WHERE user_id = ${userId}
  `;
  assert.equal(count, 1);
});

test("runtime_events scope idempotency by User", { skip }, async () => {
  const first = {
    userId: randomUUID(),
    kind: "user_message",
    dedupKey: "message_1",
    payload: userMessage("message_1"),
  };
  const second = {
    userId: randomUUID(),
    kind: "user_message",
    dedupKey: "message_1",
    payload: userMessage("message_1"),
  };

  assert.deepEqual(await ledger.recordIfNew(first), { isNew: true });
  assert.deepEqual(await ledger.recordIfNew(second), { isNew: true });
});

function userMessage(messageId) {
  return {
    type: "user_message",
    message_id: messageId,
    body: "hello",
    sent_at: "2026-06-09T00:00:00.000Z",
  };
}
