import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  createCoachingWindowsRepo,
  createConversationRepo,
  createEventLedger,
  createPerUserChannel,
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
let windows;
let channel;

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
  windows = createCoachingWindowsRepo(sql);
  channel = createPerUserChannel({
    sql,
    ledger: createEventLedger(sql),
    conversation: createConversationRepo(sql),
    project: (session, event) =>
      event.type === "coaching_window_started" || event.type === "coaching_window_ended"
        ? windows.projectLifecycle(session.userId, event)
        : [],
  });
});

after(async () => {
  await dropBranch(branchId);
});

test(
  "Window Starts are idempotent and a late older redelivery cannot supersede the active window",
  { skip },
  async () => {
    const userId = randomUUID();
    const session = boundDesktopSession(userId);
    const first = windowStarted(randomUUID(), "2026-07-26T08:00:00.000Z");
    const second = windowStarted(randomUUID(), "2026-07-26T09:00:00.000Z");

    await channel.accept(session, first);
    await channel.accept(session, first);
    await channel.accept(session, second);
    await channel.accept(session, first);
    await channel.accept(session, second);

    const rows = await sql`
      SELECT window_id, end_reason, start_ingest_seq
      FROM agent_runtime.coaching_windows
      WHERE user_id = ${userId}
      ORDER BY start_ingest_seq
    `;
    assert.deepEqual(
      rows.map((row) => [row.window_id, row.end_reason]),
      [
        [first.window_id, "superseded"],
        [second.window_id, null],
      ],
    );

    const [{ count }] = await sql`
      SELECT count(*)::int AS count
      FROM agent_runtime.coaching_windows
      WHERE user_id = ${userId}
        AND ended_at IS NULL
    `;
    assert.equal(count, 1);
  },
);

test(
  "the partial unique constraint permits only one active window per user",
  { skip },
  async () => {
    const userId = randomUUID();
    const session = boundDesktopSession(userId);
    const active = windowStarted(randomUUID(), "2026-07-26T10:00:00.000Z");
    await channel.accept(session, active);

    await assert.rejects(
      sql`
      INSERT INTO agent_runtime.coaching_windows
        (
          user_id,
          window_id,
          started_at,
          start_reason,
          orientation_message_id,
          start_ingest_seq
        )
      VALUES (
        ${userId},
        ${randomUUID()},
        ${"2026-07-26T10:01:00.000Z"},
        ${"app_launch"},
        ${`opening:${randomUUID()}`},
        (
          SELECT start_ingest_seq + 1
          FROM agent_runtime.coaching_windows
          WHERE user_id = ${userId}
            AND window_id = ${active.window_id}
        )
      )
    `,
    );
  },
);

function boundDesktopSession(userId) {
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
    },
    capabilities: ["desktop_coaching_v1"],
  };
}

function windowStarted(windowId, startedAt) {
  return {
    type: "coaching_window_started",
    window_id: windowId,
    started_at: startedAt,
    reason: "app_launch",
  };
}
