// Evidence correlator for the signed-in Capture Session smoke (#35).
//
// Reads three independent records and proves the joints held:
//   1. Snapshot Store rows (local SQLite, the local truth)   — store invariant
//   2. Gateway receipts (JSONL, real-parser-validated frames) — emission
//   3. Structured smoke log (SMOKE {json} lines)              — ordering
// then prints a PASS/FAIL table mapping each Acceptance Criterion to evidence.
//
// Run standalone after a smoke run (`node assert.mjs`) or imported by
// `run-smoke.mjs`. The Snapshot Store path is resolved from `tauri.conf.json`,
// never hardcoded (the identifier — and thus the path — is bundle-specific).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Resolve the Snapshot Store path from the Tauri identifier (AppLocalData). */
export function resolveSnapshotDbPath() {
  const confPath = resolve(HERE, "../src-tauri/tauri.conf.json");
  const identifier = JSON.parse(readFileSync(confPath, "utf8")).identifier;
  return join(homedir(), "Library", "Application Support", identifier, "intentive.db");
}

function readReceipts(receiptsPath) {
  if (!existsSync(receiptsPath)) return [];
  return readFileSync(receiptsPath, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function readSmokeEvents(smokeLogPath) {
  if (!existsSync(smokeLogPath)) return [];
  return readFileSync(smokeLogPath, "utf8")
    .split("\n")
    .filter((line) => line.startsWith("SMOKE "))
    .map((line) => JSON.parse(line.slice("SMOKE ".length)));
}

function readSnapshotRows(dbPath) {
  if (!existsSync(dbPath)) return [];
  // `-json` returns [] for an empty result set. sqlite3 ships with macOS.
  const out = execFileSync(
    "sqlite3",
    ["-json", dbPath, "SELECT id, summary, pushed_at FROM snapshots;"],
    { encoding: "utf8" },
  ).trim();
  return out.length === 0 ? [] : JSON.parse(out);
}

/**
 * Correlate the three evidence sources.
 *
 * @returns {{ ok: boolean, results: Array<{ ac: string, pass: boolean, detail: string }> }}
 */
export function runAssertions({ receiptsPath, smokeLogPath, dbPath }) {
  const receipts = readReceipts(receiptsPath);
  const events = readSmokeEvents(smokeLogPath);
  const rows = readSnapshotRows(dbPath);

  const rejected = receipts.filter((r) => r.ok === false);
  const snapshotReceipts = receipts.filter((r) => r.type === "context_snapshot" && r.ok);
  const markerReceipts = receipts.filter((r) => r.type === "session_end_marker" && r.ok);
  const rowsById = new Map(rows.map((row) => [row.id, row]));

  const results = [];
  const push = (ac, pass, detail) => results.push({ ac, pass, detail });

  // AC: every frame the gateway saw passed the real @intentive/protocol parser.
  push(
    "Emitted frames satisfy the real Protocol schema",
    rejected.length === 0 && receipts.length > 0,
    rejected.length === 0
      ? `${receipts.length} frame(s), 0 rejected`
      : `${rejected.length} rejected: ${rejected.map((r) => r.error).join("; ")}`,
  );

  // AC: capture auto-started → at least one Context Snapshot was emitted.
  push(
    "Capture ran → ≥1 context_snapshot emitted",
    snapshotReceipts.length >= 1,
    `${snapshotReceipts.length} context_snapshot receipt(s)`,
  );

  // AC: each emitted snapshot was written to the Snapshot Store before delivery
  // (row exists) and stamped delivered (pushed_at non-null).
  const missing = snapshotReceipts.filter((r) => !rowsById.has(r.snapshot_id));
  const unpushed = snapshotReceipts.filter((r) => {
    const row = rowsById.get(r.snapshot_id);
    return row && (row.pushed_at === null || row.pushed_at === undefined);
  });
  push(
    "Each emitted snapshot has a Store row stamped pushed_at",
    snapshotReceipts.length >= 1 && missing.length === 0 && unpushed.length === 0,
    missing.length === 0 && unpushed.length === 0
      ? `${snapshotReceipts.length} receipt(s) all matched a pushed row (${rows.length} row(s) total)`
      : `missing rows: ${missing.length}, rows with null pushed_at: ${unpushed.length}`,
  );

  // AC: snapshots carry a sanitized summary (no raw ScreenPipe smuggled).
  const summarized = snapshotReceipts.every((r) => {
    const row = rowsById.get(r.snapshot_id);
    return row && typeof row.summary === "string" && row.summary.length > 0;
  });
  push(
    "Stored snapshots carry a non-empty sanitized summary",
    snapshotReceipts.length >= 1 && summarized,
    summarized ? "all matched rows have a summary" : "a matched row had an empty summary",
  );

  // AC: Stop emits exactly one session_end_marker.
  push(
    "Stop emits exactly one session_end_marker",
    markerReceipts.length === 1,
    `${markerReceipts.length} session_end_marker receipt(s)`,
  );

  // AC (the #35 fix): the marker is received before ScreenPipe exits.
  const marker = markerReceipts[0];
  const exits = events.filter((e) => e.event === "screenpipe_exited");
  const lastExit = exits.at(-1);
  let orderingPass = false;
  let orderingDetail = "missing marker receipt or screenpipe_exited event";
  if (marker && lastExit) {
    const markerAt = Date.parse(marker.received_at);
    const exitAt = Date.parse(lastExit.at);
    orderingPass = markerAt <= exitAt;
    orderingDetail = `marker received ${marker.received_at} ${orderingPass ? "≤" : ">"} screenpipe_exited ${lastExit.at}`;
  }
  push(
    "Session End Marker leaves before ScreenPipe shutdown (ADR-0022)",
    orderingPass,
    orderingDetail,
  );

  const ok = results.every((r) => r.pass);
  return { ok, results };
}

function printTable({ ok, results }) {
  const width = Math.max(...results.map((r) => r.ac.length), 20);
  console.log("\n===== Signed-in Capture Session smoke (#35) — AC → evidence =====");
  for (const r of results) {
    console.log(`${r.pass ? "✅ PASS" : "❌ FAIL"}  ${r.ac.padEnd(width)}  ${r.detail}`);
  }
  console.log("================================================================");
  console.log(ok ? "✅ SMOKE PASSED" : "❌ SMOKE FAILED");
}

// Standalone entry point.
if (import.meta.url === `file://${process.argv[1]}`) {
  const receiptsPath = process.env.INTENTIVE_SMOKE_RECEIPTS ?? join(HERE, ".out", "receipts.jsonl");
  const smokeLogPath = process.env.INTENTIVE_SMOKE_LOG ?? join(HERE, ".out", "smoke.log");
  const dbPath = process.env.INTENTIVE_SMOKE_DB ?? resolveSnapshotDbPath();
  const outcome = runAssertions({ receiptsPath, smokeLogPath, dbPath });
  printTable(outcome);
  process.exit(outcome.ok ? 0 : 1);
}

export { printTable };
