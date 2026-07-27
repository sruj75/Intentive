import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  createConversationRepo,
  createEventLedger,
  createPerceptionRecordsRepo,
  createPerUserChannel,
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
let channel;
let perception;

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
  perception = createPerceptionRecordsRepo(sql);
  channel = createPerUserChannel({
    sql,
    ledger: createEventLedger(sql),
    conversation: createConversationRepo(sql),
    project: (session, event) => {
      if (event.type === "perception_event") {
        return [perception.appendQuery(toPerceptionRecord(session.userId, event))];
      }
      if (event.type === "perception_tombstone") {
        return [perception.tombstoneQuery(session.userId, event)];
      }
      return [];
    },
  });
});

after(async () => {
  await dropBranch(branchId);
});

test(
  "a late permitted duplicate cannot undo the current redacted projection",
  { skip },
  async () => {
    const userId = randomUUID();
    const eventId = randomUUID();
    const session = boundDesktopSession(userId);
    const permitted = screenEvent(eventId, false);
    const redacted = screenEvent(eventId, true);

    await channel.accept(session, permitted);
    await channel.accept(session, redacted);
    await channel.accept(session, permitted);

    assert.equal(
      await perception.readEmbeddingCandidate(toPerceptionRecord(userId, permitted)),
      null,
    );
    const rows = await sql`
      SELECT
        summary,
        signals,
        content_redacted,
        sensitivity_label,
        window_title,
        ocr_text
      FROM agent_runtime.perception_records
      WHERE user_id = ${userId}
        AND event_id = ${eventId}
    `;
    assert.deepEqual(rows, [
      {
        summary: "redacted payroll application",
        signals: {
          content_redacted: true,
          bundle_id: "com.example.Payroll",
          app_name: "Payroll",
        },
        content_redacted: true,
        sensitivity_label: "secret_detected",
        window_title: null,
        ocr_text: null,
      },
    ]);
  },
);

test(
  "a targeted tombstone prevents a late duplicate from recreating its projection",
  { skip },
  async () => {
    const userId = randomUUID();
    const eventId = randomUUID();
    const session = boundDesktopSession(userId);
    const event = screenEvent(eventId, false);

    await channel.accept(session, event);
    await channel.accept(session, {
      type: "perception_tombstone",
      tombstone_id: randomUUID(),
      reason: "manual_delete",
      event_refs: [eventId],
      emitted_at: "2026-07-26T10:01:00.000Z",
    });
    await channel.accept(session, event);

    assert.equal(await perception.readEmbeddingCandidate(toPerceptionRecord(userId, event)), null);
    assert.equal(await projectionCount(userId, eventId), 0);
  },
);

test("clear_all prevents an older duplicate from recreating its projection", { skip }, async () => {
  const userId = randomUUID();
  const eventId = randomUUID();
  const session = boundDesktopSession(userId);
  const event = screenEvent(eventId, false);

  await channel.accept(session, event);
  await channel.accept(session, {
    type: "perception_tombstone",
    tombstone_id: randomUUID(),
    reason: "clear_all",
    event_refs: [],
    emitted_at: "2026-07-26T10:01:00.000Z",
  });
  await channel.accept(session, event);

  assert.equal(await perception.readEmbeddingCandidate(toPerceptionRecord(userId, event)), null);
  assert.equal(await projectionCount(userId, eventId), 0);
});

async function projectionCount(userId, eventId) {
  const [{ count }] = await sql`
    SELECT count(*)::int AS count
    FROM agent_runtime.perception_records
    WHERE user_id = ${userId}
      AND event_id = ${eventId}
  `;
  return count;
}

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

function screenEvent(eventId, contentRedacted) {
  return {
    type: "perception_event",
    event_id: eventId,
    window_id: "11111111-1111-4111-8111-111111111111",
    source_client: "desktop",
    captured_at: "2026-07-26T10:00:00.000Z",
    period_start: "2026-07-26T09:59:00.000Z",
    period_end: "2026-07-26T10:00:00.000Z",
    artifact_type: "searchable_screen_record",
    summary: contentRedacted ? "redacted payroll application" : "payroll secret 1234",
    signals: {
      content_redacted: contentRedacted,
      bundle_id: "com.example.Payroll",
      app_name: "Payroll",
      ...(contentRedacted
        ? {}
        : {
            window_title: "payroll secret 1234",
            ocr_text: "payroll secret 1234",
          }),
    },
    sensitivity_label: contentRedacted ? "secret_detected" : "sensitive",
    retention_class: "screen_memory_30d",
    confidence: 0.9,
    expires_at: "2099-07-26T10:00:00.000Z",
    local_record_ref: randomUUID(),
  };
}
