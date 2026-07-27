import assert from "node:assert/strict";
import test from "node:test";

import {
  classificationCountsQuery,
  executePerceptionLedgerScrub,
  guardedScrubQuery,
  parsePerceptionLedgerScrubArgs,
} from "../scripts/lib/perception-ledger-scrub.mjs";

const safeCounts = {
  detailed_candidates: "3",
  projection_backed: "1",
  expired_exclusions: "1",
  tombstone_exclusions: "1",
  unsafe_missing_projection: "0",
};

test("scrub CLI is dry-run by default and never constructs a mutation transaction", async () => {
  const db = fakeSql({ dryRunCounts: safeCounts });
  const output = [];

  const result = await executePerceptionLedgerScrub({
    sql: db,
    apply: parsePerceptionLedgerScrubArgs([]).apply,
    write: (line) => output.push(line),
  });

  assert.equal(db.transactionCalls.length, 0);
  assert.equal(
    db.calls.some((call) => /UPDATE agent_runtime\.runtime_events/i.test(call)),
    false,
  );
  assert.equal(result.scrubbed, 0);
  assert.match(output.at(-1), /Dry run only/);
});

test("--apply aborts without mutation when preflight finds an unsafe missing projection", async () => {
  const unsafeCounts = { ...safeCounts, unsafe_missing_projection: "1" };
  const db = fakeSql({
    transactionResult: [[], [unsafeCounts], []],
  });

  await assert.rejects(executePerceptionLedgerScrub({ sql: db, apply: true }), /Refusing to scrub/);
  assert.equal(db.transactionCalls.length, 1);
  assert.match(db.transactionCalls[0][0], /LOCK TABLE/i);
  assert.match(db.transactionCalls[0][2], /NOT EXISTS \(SELECT 1 FROM invalid\)/i);
});

test("apply clears payload because ordering and dedupe identity are typed ledger columns", async () => {
  const db = fakeSql();
  const query = guardedScrubQuery(db);

  assert.match(query, /SET payload = '\{\}'::jsonb/i);
  assert.doesNotMatch(query, /jsonb_build_object/i);
  assert.doesNotMatch(query, /'event_id'\s*,/);
  assert.doesNotMatch(query, /'window_id'\s*,/);
  assert.doesNotMatch(query, /'summary'\s*,/);
  assert.doesNotMatch(query, /'signals'\s*,/);
  assert.doesNotMatch(query, /'embedding_ref'\s*,/);
  assert.match(query, /perception_records/i);
  assert.match(query, /perception_tombstone/i);
  assert.match(query, /is_expired/i);
});

test("same-timestamp tombstones are ordered only by the total ingest cursor", () => {
  const db = (strings) => strings.join("?");
  for (const query of [classificationCountsQuery(db), guardedScrubQuery(db)]) {
    assert.match(query, /tombstone\.ingest_seq\s*>\s*event\.ingest_seq/i);
    assert.doesNotMatch(query, /tombstone\.created_at\s*>=\s*event\.created_at/i);
  }
});

function fakeSql({ dryRunCounts = safeCounts, transactionResult } = {}) {
  const calls = [];
  const transactionCalls = [];
  const db = (strings) => {
    const text = strings.join("?");
    calls.push(text);
    if (/SELECT\s+count\(\*\)\s+AS detailed_candidates/is.test(text)) {
      return Promise.resolve([dryRunCounts]);
    }
    return text;
  };
  db.calls = calls;
  db.transactionCalls = transactionCalls;
  db.transaction = async (queries) => {
    transactionCalls.push(queries);
    return transactionResult ?? [[], [safeCounts], [{ id: "event_1" }]];
  };
  return db;
}
