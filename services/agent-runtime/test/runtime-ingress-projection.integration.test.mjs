import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  createConversationRepo,
  createEventLedger,
  createIngestEvent,
  createRuntimeIngressHandler,
  createUserQueue,
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
const sessionsMigration = path.join(migrationsDir, "0001_sessions.sql");
const conversationMigration = path.join(migrationsDir, "0002_conversation.sql");

let branchId;
let sql;
let ledger;
let conversation;

before(async () => {
  if (skip) return;
  const branch = await createBranch();
  branchId = branch.branchId;
  await applySql(branch.connectionUri, "CREATE SCHEMA IF NOT EXISTS agent_runtime;");
  await applyMigrationFile(branch.connectionUri, sessionsMigration);
  await applyMigrationFile(branch.connectionUri, conversationMigration);
  sql = await connect(branch.connectionUri);
  ledger = createEventLedger(sql);
  conversation = createConversationRepo(sql);
});

after(async () => {
  await dropBranch(branchId);
});

test("runtime ingress retries safely when a durable projection write fails", { skip }, async () => {
  const session = boundSession(randomUUID());
  let failProjectionOnce = true;
  const ingest = createIngestEvent({
    ledger,
    project: (seenSession, event) => {
      const entry = toConversationEntry(seenSession.userId, event);
      if (!entry) return [];
      if (failProjectionOnce) {
        failProjectionOnce = false;
        return [invalidConversationInsert(entry)];
      }
      return [conversation.appendQuery(entry)];
    },
  });
  const handleRuntimeIngress = createRuntimeIngressHandler({
    queue: createUserQueue(),
    commit: async (seenSession, event) => {
      await sql.transaction(ingest.queriesFor(seenSession, event));
    },
  });
  const event = userMessage("message_1");

  await assert.rejects(handleRuntimeIngress(session, event));
  await handleRuntimeIngress(session, event);

  const snapshot = await conversation.readSnapshot(session.userId);
  assert.deepEqual(
    snapshot.messages.map((message) => [message.message_id, message.body]),
    [["message_1", "hello"]],
  );

  const [{ count }] = await sql`
    SELECT count(*)::int AS count
    FROM agent_runtime.runtime_events
    WHERE user_id = ${session.userId}
  `;
  assert.equal(count, 1);
});

test(
  "runtime ingress keeps duplicate user messages idempotent across ledger and transcript",
  { skip },
  async () => {
    const session = boundSession(randomUUID());
    const ingest = createIngestEvent({
      ledger,
      project: (seenSession, event) => {
        const entry = toConversationEntry(seenSession.userId, event);
        return entry ? [conversation.appendQuery(entry)] : [];
      },
    });
    const handleRuntimeIngress = createRuntimeIngressHandler({
      queue: createUserQueue(),
      commit: async (seenSession, event) => {
        await sql.transaction(ingest.queriesFor(seenSession, event));
      },
    });
    const event = userMessage("message_1");

    await handleRuntimeIngress(session, event);
    await handleRuntimeIngress(session, event);

    const snapshot = await conversation.readSnapshot(session.userId);
    assert.equal(snapshot.messages.length, 1);
    assert.equal(snapshot.messages[0].message_id, "message_1");

    const [{ count }] = await sql`
    SELECT count(*)::int AS count
    FROM agent_runtime.runtime_events
    WHERE user_id = ${session.userId}
  `;
    assert.equal(count, 1);
  },
);

test(
  "runtime ingress records non-projecting events without transcript rows",
  { skip },
  async () => {
    const session = boundSession(randomUUID());
    const ingest = createIngestEvent({
      ledger,
      project: (seenSession, event) => {
        const entry = toConversationEntry(seenSession.userId, event);
        return entry ? [conversation.appendQuery(entry)] : [];
      },
    });
    const handleRuntimeIngress = createRuntimeIngressHandler({
      queue: createUserQueue(),
      commit: async (seenSession, event) => {
        await sql.transaction(ingest.queriesFor(seenSession, event));
      },
    });

    await handleRuntimeIngress(session, {
      type: "context_snapshot",
      snapshot_id: "snapshot_1",
      captured_at: "2026-06-09T00:00:00.000Z",
      period_start: "2026-06-08T23:55:00.000Z",
      period_end: "2026-06-09T00:00:00.000Z",
      summary: "screen summary",
    });

    assert.deepEqual(await conversation.readSnapshot(session.userId), {
      messages: [],
      before_cursor: null,
    });

    const [{ count }] = await sql`
    SELECT count(*)::int AS count
    FROM agent_runtime.runtime_events
    WHERE user_id = ${session.userId}
  `;
    assert.equal(count, 1);
  },
);

function invalidConversationInsert(entry) {
  return sql`
    INSERT INTO agent_runtime.conversation_messages
      (user_id, message_id, author, body, via_post_message_back)
    VALUES (
      ${entry.userId},
      ${entry.messageId},
      ${"invalid-author"},
      ${entry.body},
      ${entry.viaPostMessageBack}
    )
  `;
}

function boundSession(userId) {
  return {
    userId,
    clientKind: "mobile",
    agentInstanceId: randomUUID(),
  };
}

function userMessage(messageId) {
  return {
    type: "user_message",
    message_id: messageId,
    body: "hello",
    sent_at: "2026-06-09T00:00:00.000Z",
  };
}
