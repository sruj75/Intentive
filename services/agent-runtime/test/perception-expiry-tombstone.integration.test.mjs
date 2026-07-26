import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  createEventLedger,
  createPerceptionIngressHooks,
  createPerceptionRecordsRepo,
  toPerceptionRecord,
} from "../dist/index.js";
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
let ledger;

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
  "payroll secret": [1, 0, 0],
};

before(async () => {
  if (skip) return;
  const branch = await createBranch();
  branchId = branch.branchId;
  await applySql(branch.connectionUri, "CREATE SCHEMA IF NOT EXISTS agent_runtime;");
  const migrationFiles = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of migrationFiles) {
    await applyMigrationFile(branch.connectionUri, path.join(migrationsDir, file));
  }
  sql = await connect(branch.connectionUri);
  ledger = createEventLedger(sql);
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
  const embeddedEvent = await appendRecord(
    hybridRepo,
    userId,
    "vec_1",
    "invoice reconciliation spreadsheet",
  );
  const embeddedCandidate = await requireEmbeddingCandidate(hybridRepo, userId, embeddedEvent);
  await hybridRepo.storeEmbedding({
    modelId: embedder.modelId,
    vector: [1, 0, 0],
    expectedRecord: embeddedCandidate,
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

test(
  "redacted re-emission invalidates stale semantic recall and rejects a late vector write",
  { skip },
  async () => {
    const repo = createPerceptionRecordsRepo(sql, embedder);
    const userId = randomUUID();
    const permitted = screenEvent("redaction_1", false);
    const redacted = screenEvent("redaction_1", true);

    await projectEvent(repo, userId, permitted);
    const permittedCandidate = await requireEmbeddingCandidate(repo, userId, permitted);
    await repo.storeEmbedding({
      modelId: embedder.modelId,
      vector: [1, 0, 0],
      expectedRecord: permittedCandidate,
    });

    // A transport retry with identical embedding inputs keeps the valid vector.
    await projectEvent(repo, userId, permitted);
    assert.deepEqual(
      (await repo.search({ userId, query: "payroll secret" })).map((row) => row.eventId),
      ["redaction_1"],
    );

    await projectEvent(repo, userId, redacted);
    assert.deepEqual(await repo.search({ userId, query: "payroll secret" }), []);

    // Simulate the original embedding request finishing after the redacted upsert.
    await repo.storeEmbedding({
      modelId: embedder.modelId,
      vector: [1, 0, 0],
      expectedRecord: permittedCandidate,
    });
    assert.deepEqual(await repo.search({ userId, query: "payroll secret" }), []);
  },
);

test(
  "a redaction committed while embedding is in flight rejects the stale vector even when summary and signals are unchanged",
  { skip },
  async () => {
    const repo = createPerceptionRecordsRepo(sql);
    const userId = randomUUID();
    const event = screenEvent("redaction_race_1", false);
    let releaseProvider;
    const providerGate = new Promise((resolve) => {
      releaseProvider = resolve;
    });
    let embeddingStarted;
    const started = new Promise((resolve) => {
      embeddingStarted = resolve;
    });
    let storeFinished;
    const finished = new Promise((resolve) => {
      storeFinished = resolve;
    });
    let embeddingError = null;

    await projectEvent(repo, userId, event);
    const hooks = createPerceptionIngressHooks({
      embedder: {
        modelId: "test-embed",
        dim: 3,
        embed: async (text) => {
          embeddingStarted(text);
          await providerGate;
          return [1, 0, 0];
        },
      },
      loadEmbeddingCandidate: (expectedRecord) => repo.readEmbeddingCandidate(expectedRecord),
      storeEmbedding: async (input) => {
        await repo.storeEmbedding(input);
        storeFinished();
      },
      onEmbeddingError: (error) => {
        embeddingError = error;
        storeFinished();
      },
    });

    hooks.onPerceptionProjected({ userId }, event);
    assert.match(await started, /payroll secret/);

    // Model a privacy redaction/scrub that changes only the structured
    // permitted-text columns. The summary and opaque signals intentionally stay
    // byte-for-byte identical so they cannot accidentally satisfy the CAS.
    await sql`
      UPDATE agent_runtime.perception_records
      SET
        window_title = NULL,
        ocr_text = NULL,
        content_redacted = true
      WHERE user_id = ${userId}
        AND event_id = ${event.event_id}
    `;
    assert.equal(await repo.readEmbeddingCandidate(toPerceptionRecord(userId, event)), null);

    releaseProvider();
    await finished;
    assert.equal(embeddingError, null);

    const rows = await sql`
      SELECT
        summary,
        signals,
        content_redacted,
        embedding_model_id,
        embedding
      FROM agent_runtime.perception_records
      WHERE user_id = ${userId}
        AND event_id = ${event.event_id}
    `;
    assert.deepEqual(rows, [
      {
        summary: event.summary,
        signals: event.signals,
        content_redacted: true,
        embedding_model_id: null,
        embedding: null,
      },
    ]);
  },
);

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
    signals: {
      content_redacted: false,
      bundle_id: "com.microsoft.VSCode",
      app_name: "Code",
      window_title: "editor",
      ocr_text: summary,
    },
    sensitivity_label: "normal",
    retention_class: "screen_memory_30d",
    confidence: 0.91,
    expires_at: overrides.expiresAt ?? "2099-06-09T00:00:00.000Z",
    local_record_ref: `screen-memory://${eventId}`,
  };
  await projectEvent(repo, userId, event);
  return event;
}

async function projectEvent(repo, userId, event) {
  await sql.transaction([
    ledger.recordQuery({
      userId,
      kind: "perception_event",
      dedupKey: event.event_id,
      payload: event,
    }),
    repo.appendQuery(toPerceptionRecord(userId, event)),
  ]);
}

async function requireEmbeddingCandidate(repo, userId, event) {
  const candidate = await repo.readEmbeddingCandidate(toPerceptionRecord(userId, event));
  assert.ok(candidate);
  return candidate;
}

function screenEvent(eventId, contentRedacted) {
  return {
    type: "perception_event",
    event_id: eventId,
    source_client: "desktop",
    captured_at: "2026-06-09T00:00:00.000Z",
    period_start: "2026-06-08T23:55:00.000Z",
    period_end: "2026-06-09T00:00:00.000Z",
    artifact_type: "searchable_screen_record",
    summary: contentRedacted ? "redacted view" : "confidential compensation",
    signals: {
      content_redacted: contentRedacted,
      bundle_id: "com.example.Payroll",
      app_name: "Payroll",
      ...(contentRedacted
        ? {}
        : {
            window_title: "payroll secret",
            ocr_text: "payroll secret",
          }),
    },
    sensitivity_label: "secret_detected",
    retention_class: "screen_memory_30d",
    confidence: 0.91,
    expires_at: "2099-06-09T00:00:00.000Z",
    local_record_ref: `screen-memory://${eventId}`,
  };
}
