import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createPerceptionRecordsRepo, toPerceptionRecord } from "../dist/index.js";
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
const migrations = [
  "0001_sessions.sql",
  "0010_perception_records.sql",
  "0011_perception_expiry_tombstone.sql",
];

let branchId;
let sql;

// A deterministic embedder: only the query strings we care about map to vectors,
// so the vector-recall path is exercised without a live model.
const embedder = {
  modelId: "test-embed",
  dim: 3,
  embed: async (text) => queryVectors[text.trim()] ?? null,
};
const degradedEmbedder = { modelId: "test-embed", dim: 3, embed: async () => null };
const queryVectors = {
  "accounts payable ledger": [1, 0, 0],
};

before(async () => {
  if (skip) return;
  const branch = await createBranch();
  branchId = branch.branchId;
  await applySql(branch.connectionUri, "CREATE SCHEMA IF NOT EXISTS agent_runtime;");
  for (const file of migrations) {
    await applyMigrationFile(branch.connectionUri, path.join(migrationsDir, file));
  }
  sql = await connect(branch.connectionUri);
});

after(async () => {
  if (branchId) await dropBranch(branchId);
});

test("search never returns a row past its expiry", { skip }, async () => {
  const repo = createPerceptionRecordsRepo(sql);
  const userId = randomUUID();
  await appendRecord(repo, userId, "fresh_1", "renovation plan review", {
    expiresAt: "2099-01-01T00:00:00.000Z",
  });
  await appendRecord(repo, userId, "stale_1", "renovation plan review", {
    expiresAt: "2000-01-01T00:00:00.000Z",
  });

  const results = await repo.search({ userId, query: "renovation" });
  assert.deepEqual(
    results.map((r) => r.eventId),
    ["fresh_1"],
  );
});

test("a record tombstone drops exactly the named rows and is idempotent", { skip }, async () => {
  const repo = createPerceptionRecordsRepo(sql);
  const userId = randomUUID();
  await appendRecord(repo, userId, "keep_1", "budget planning");
  await appendRecord(repo, userId, "drop_1", "budget planning");

  const tombstone = {
    type: "perception_tombstone",
    tombstone_id: randomUUID(),
    reason: "manual_delete",
    event_refs: ["drop_1"],
    emitted_at: "2026-07-05T11:00:00.000Z",
  };
  await sql.transaction([repo.tombstoneQuery(userId, tombstone)]);
  // Redelivery is a harmless no-op.
  await sql.transaction([repo.tombstoneQuery(userId, tombstone)]);

  const results = await repo.search({ userId, query: "budget" });
  assert.deepEqual(
    results.map((r) => r.eventId),
    ["keep_1"],
  );
});

test("clear_all and search are tenant-scoped", { skip }, async () => {
  const repo = createPerceptionRecordsRepo(sql);
  const userA = randomUUID();
  const userB = randomUUID();
  await appendRecord(repo, userA, "a_1", "shared keyword invoice");
  await appendRecord(repo, userB, "b_1", "shared keyword invoice");

  // A never sees B's row.
  const beforeA = await repo.search({ userId: userA, query: "invoice" });
  assert.deepEqual(
    beforeA.map((r) => r.eventId),
    ["a_1"],
  );

  await sql.transaction([
    repo.tombstoneQuery(userA, {
      type: "perception_tombstone",
      tombstone_id: randomUUID(),
      reason: "clear_all",
      event_refs: [],
      emitted_at: "2026-07-05T11:00:00.000Z",
    }),
  ]);

  assert.deepEqual(await repo.search({ userId: userA, query: "invoice" }), []);
  const survivingB = await repo.search({ userId: userB, query: "invoice" });
  assert.deepEqual(
    survivingB.map((r) => r.eventId),
    ["b_1"],
  );
});

test("hybrid search recalls a term-disjoint neighbour, and degrades to FTS", { skip }, async () => {
  const hybridRepo = createPerceptionRecordsRepo(sql, embedder);
  const ftsOnlyRepo = createPerceptionRecordsRepo(sql, degradedEmbedder);
  const userId = randomUUID();
  await appendRecord(hybridRepo, userId, "vec_1", "invoice reconciliation spreadsheet");
  await hybridRepo.storeEmbedding({
    userId,
    eventId: "vec_1",
    modelId: embedder.modelId,
    vector: [1, 0, 0],
  });

  // The query shares no literal tokens with the summary, so FTS returns nothing.
  assert.deepEqual(await ftsOnlyRepo.search({ userId, query: "accounts payable ledger" }), []);

  // With the embedder available, the vector neighbour is recalled.
  const hybrid = await hybridRepo.search({ userId, query: "accounts payable ledger" });
  assert.deepEqual(
    hybrid.map((r) => r.eventId),
    ["vec_1"],
  );
});

async function appendRecord(repo, userId, eventId, summary, overrides = {}) {
  const event = {
    type: "perception_event",
    event_id: eventId,
    source_client: "desktop",
    captured_at: "2026-06-09T00:00:00.000Z",
    period_start: "2026-06-08T23:55:00.000Z",
    period_end: "2026-06-09T00:00:00.000Z",
    artifact_type: "searchable_screen_record",
    summary,
    signals: { app: "Code" },
    sensitivity_label: "normal",
    retention_class: "screen_memory_30d",
    confidence: 0.91,
    expires_at: overrides.expiresAt ?? "2099-06-09T00:00:00.000Z",
    local_record_ref: `screen-memory://${eventId}`,
  };
  await sql.transaction([repo.appendQuery(toPerceptionRecord(userId, event))]);
}
