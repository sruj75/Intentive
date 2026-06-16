import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  createConversationRepo,
  createEventLedger,
  createPerUserChannel,
  createRuntimeTurnsRepo,
  createTurnRunner,
  toConversationEntry,
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
let conversation;
let ledger;
let runtimeTurns;

before(async () => {
  if (skip) return;
  const branch = await createBranch();
  branchId = branch.branchId;
  await applySql(branch.connectionUri, "CREATE SCHEMA IF NOT EXISTS agent_runtime;");
  for (const file of [
    "0001_sessions.sql",
    "0002_conversation.sql",
    "0003_runtime_turns.sql",
    "0004_runtime_turns_bundle_version.sql",
  ]) {
    await applyMigrationFile(branch.connectionUri, path.join(migrationsDir, file));
  }
  sql = await connect(branch.connectionUri);
  conversation = createConversationRepo(sql);
  ledger = createEventLedger(sql);
  runtimeTurns = createRuntimeTurnsRepo(sql);
});

after(async () => {
  await dropBranch(branchId);
});

test(
  "per-user channels keep interleaved Users isolated across ledgers and turns",
  { skip },
  async () => {
    const userA = randomUUID();
    const userB = randomUUID();
    const runTurn = createTurnRunner({
      sql,
      adapter: {
        invoke: async (input) => ({
          reply: `reply:${input.userId}`,
          traceId: `trace:${input.userId}`,
          model: "test-model",
          bundleVersion: input.pinnedFloor.version,
        }),
      },
      conversation,
      runtimeTurns,
      fallbackModel: "test-model",
      newMessageId: () => randomUUID(),
    });
    const channel = createPerUserChannel({
      sql,
      ledger,
      conversation,
      project: (session, event) => {
        const entry = toConversationEntry(session.userId, event);
        return entry ? [conversation.appendQuery(entry)] : [];
      },
      runTurn,
    });

    await Promise.all([
      channel.accept(boundSession(userA), userMessage("a_1", "hello A")),
      channel.accept(boundSession(userB), userMessage("b_1", "hello B")),
    ]);

    const [snapshotA, snapshotB] = await Promise.all([
      conversation.readSnapshot(userA),
      conversation.readSnapshot(userB),
    ]);
    assert.deepEqual(
      snapshotA.messages.map((message) => message.body),
      ["hello A", `reply:${userA}`],
    );
    assert.deepEqual(
      snapshotB.messages.map((message) => message.body),
      ["hello B", `reply:${userB}`],
    );

    const rows = await sql`
    SELECT user_id, count(*)::int AS count
    FROM agent_runtime.runtime_events
    WHERE user_id = ${userA} OR user_id = ${userB}
    GROUP BY user_id
    ORDER BY user_id
  `;
    assert.deepEqual(
      rows,
      [
        { user_id: userA, count: 1 },
        { user_id: userB, count: 1 },
      ].sort((a, b) => a.user_id.localeCompare(b.user_id)),
    );

    const turnRows = await sql`
    SELECT user_id, count(*)::int AS count
    FROM agent_runtime.runtime_turns
    WHERE user_id = ${userA} OR user_id = ${userB}
    GROUP BY user_id
    ORDER BY user_id
  `;
    assert.deepEqual(
      turnRows,
      [
        { user_id: userA, count: 1 },
        { user_id: userB, count: 1 },
      ].sort((a, b) => a.user_id.localeCompare(b.user_id)),
    );
  },
);

function boundSession(userId) {
  return {
    userId,
    clientKind: "mobile",
    agentInstanceId: randomUUID(),
    pinnedFloor: floor("floor_v1"),
  };
}

function userMessage(messageId, body) {
  return {
    type: "user_message",
    message_id: messageId,
    body,
    sent_at: "2026-06-16T00:00:00.000Z",
  };
}

function floor(version) {
  return {
    version,
    documents: {
      SOUL: "soul",
      AGENTS: "agents",
      BOOTSTRAP: "bootstrap",
      HEARTBEAT: "heartbeat",
    },
    langfusePrompts: [],
  };
}
