import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  createEventLedger,
  createPerUserChannel,
  createSensoryBufferReader,
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
const sessionsMigration = path.join(migrationsDir, "0001_sessions.sql");
const eventsIndexMigration = path.join(migrationsDir, "0005_runtime_events_user_created_at.sql");

let branchId;
let sql;
let ledger;
let sensoryBuffer;

before(async () => {
  if (skip) return;
  const branch = await createBranch();
  branchId = branch.branchId;
  await applySql(branch.connectionUri, "CREATE SCHEMA IF NOT EXISTS agent_runtime;");
  await applyMigrationFile(branch.connectionUri, sessionsMigration);
  await applyMigrationFile(branch.connectionUri, eventsIndexMigration);
  sql = await connect(branch.connectionUri);
  ledger = createEventLedger(sql);
  sensoryBuffer = createSensoryBufferReader(sql);
});

after(async () => {
  await dropBranch(branchId);
});

test(
  "Sensory Buffer returns null when no perception events exist for the User",
  { skip },
  async () => {
    assert.equal(await sensoryBuffer.readLatest(randomUUID()), null);
  },
);

test(
  "Sensory Buffer renders the latest Context Snapshot summary and timestamp",
  { skip },
  async () => {
    const session = boundSession(randomUUID());
    const channel = channelFor();

    await channel.accept(
      session,
      contextSnapshot("snapshot_1", "2026-06-09T00:00:00.000Z", "reviewing a design doc"),
    );

    const latest = await sensoryBuffer.readLatest(session.userId);
    assert.match(latest, /reviewing a design doc/);
    assert.match(latest, /2026-06-09T00:00:00.000Z/);
  },
);

test(
  "Sensory Buffer picks whichever perception event arrived most recently",
  { skip },
  async () => {
    const markerWinsSession = boundSession(randomUUID());
    const markerWinsChannel = channelFor();
    await markerWinsChannel.accept(
      markerWinsSession,
      contextSnapshot("snapshot_2", "2026-06-09T00:00:00.000Z", "editing slides"),
    );
    await markerWinsChannel.accept(markerWinsSession, sessionEndMarker("quit"));

    const markerLatest = await sensoryBuffer.readLatest(markerWinsSession.userId);
    assert.match(markerLatest, /Session End Marker/);
    assert.match(markerLatest, /quit/);
    assert.match(markerLatest, /2026-06-09T00:05:00.000Z/);

    const snapshotWinsSession = boundSession(randomUUID());
    const snapshotWinsChannel = channelFor();
    await snapshotWinsChannel.accept(snapshotWinsSession, sessionEndMarker("user_toggle"));
    await snapshotWinsChannel.accept(
      snapshotWinsSession,
      contextSnapshot("snapshot_3", "2026-06-09T00:10:00.000Z", "writing test notes"),
    );

    const snapshotLatest = await sensoryBuffer.readLatest(snapshotWinsSession.userId);
    assert.match(snapshotLatest, /Context Snapshot/);
    assert.match(snapshotLatest, /writing test notes/);
    assert.match(snapshotLatest, /2026-06-09T00:10:00.000Z/);
  },
);

test(
  "latest-perception read resolves via the created_at index without sorting the User's whole event set",
  { skip },
  async () => {
    // Accumulate enough perception events that a sort-the-whole-set plan would
    // be visibly distinct from an index walk (see migration 0005 / #38).
    const session = boundSession(randomUUID());
    const channel = channelFor();
    for (let i = 0; i < 200; i += 1) {
      await channel.accept(
        session,
        contextSnapshot(
          `bulk_${i}`,
          `2026-06-09T00:00:${String(i % 60).padStart(2, "0")}.000Z`,
          `bulk ${i}`,
        ),
      );
    }

    const plan = await sql.query(
      `EXPLAIN (FORMAT JSON)
       SELECT payload
       FROM agent_runtime.runtime_events
       WHERE user_id = $1
         AND kind IN ('context_snapshot', 'session_end_marker')
       ORDER BY created_at DESC
       LIMIT 1`,
      [session.userId],
    );
    const rootPlan = plan[0]["QUERY PLAN"][0].Plan;

    assert.ok(
      planUsesIndex(rootPlan, "runtime_events_user_created_at"),
      "expected the latest-perception read to scan runtime_events_user_created_at",
    );
    assert.ok(
      !planContainsNode(rootPlan, "Sort"),
      "expected no Sort node — the index should make the read order-free",
    );
  },
);

function planNodes(node) {
  return [node, ...(node.Plans ?? []).flatMap(planNodes)];
}

function planUsesIndex(rootPlan, indexName) {
  return planNodes(rootPlan).some((n) => n["Index Name"] === indexName);
}

function planContainsNode(rootPlan, nodeType) {
  return planNodes(rootPlan).some((n) => n["Node Type"] === nodeType);
}

function channelFor() {
  return createPerUserChannel({
    sql,
    ledger,
    conversation: { readSnapshot: async () => ({ messages: [], before_cursor: null }) },
    project: () => [],
  });
}

function boundSession(userId) {
  return {
    userId,
    clientKind: "desktop",
    agentInstanceId: randomUUID(),
    pinnedFloor: {
      version: "floor_v1",
      documents: {
        SOUL: "soul",
        AGENTS: "agents",
        BOOTSTRAP: "bootstrap",
        HEARTBEAT: "heartbeat",
      },
      langfusePrompts: [],
    },
  };
}

function contextSnapshot(snapshotId, capturedAt, summary) {
  return {
    type: "context_snapshot",
    snapshot_id: snapshotId,
    captured_at: capturedAt,
    period_start: "2026-06-08T23:55:00.000Z",
    period_end: capturedAt,
    summary,
  };
}

function sessionEndMarker(reason) {
  return {
    type: "session_end_marker",
    ended_at: "2026-06-09T00:05:00.000Z",
    reason,
  };
}
