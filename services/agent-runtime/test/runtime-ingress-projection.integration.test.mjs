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
const sessionsMigration = path.join(migrationsDir, "0001_sessions.sql");
const conversationMigration = path.join(migrationsDir, "0002_conversation.sql");
const runtimeTurnsMigration = path.join(migrationsDir, "0003_runtime_turns.sql");

let branchId;
let sql;
let ledger;
let conversation;
let runtimeTurns;

before(async () => {
  if (skip) return;
  const branch = await createBranch();
  branchId = branch.branchId;
  await applySql(branch.connectionUri, "CREATE SCHEMA IF NOT EXISTS agent_runtime;");
  await applyMigrationFile(branch.connectionUri, sessionsMigration);
  await applyMigrationFile(branch.connectionUri, conversationMigration);
  await applyMigrationFile(branch.connectionUri, runtimeTurnsMigration);
  sql = await connect(branch.connectionUri);
  ledger = createEventLedger(sql);
  conversation = createConversationRepo(sql);
  runtimeTurns = createRuntimeTurnsRepo(sql);
});

after(async () => {
  await dropBranch(branchId);
});

test("runtime ingress retries safely when a durable projection write fails", { skip }, async () => {
  const session = boundSession(randomUUID());
  let failProjectionOnce = true;
  const channel = createPerUserChannel({
    sql,
    ledger,
    conversation,
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
  const event = userMessage("message_1");

  await assert.rejects(channel.accept(session, event));
  await channel.accept(session, event);

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
    const channel = createPerUserChannel({
      sql,
      ledger,
      conversation,
      project: (seenSession, event) => {
        const entry = toConversationEntry(seenSession.userId, event);
        return entry ? [conversation.appendQuery(entry)] : [];
      },
    });
    const event = userMessage("message_1");

    await channel.accept(session, event);
    await channel.accept(session, event);

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
    const channel = createPerUserChannel({
      sql,
      ledger,
      conversation,
      project: (seenSession, event) => {
        const entry = toConversationEntry(seenSession.userId, event);
        return entry ? [conversation.appendQuery(entry)] : [];
      },
    });

    await channel.accept(session, {
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

test(
  "user_message produces a reconnect-visible companion reply and ok Runtime Turn",
  { skip },
  async () => {
    const session = boundSession(randomUUID());
    const adapterCalls = [];
    const runTurn = createTurnRunner({
      sql,
      adapter: {
        invoke: async (input) => {
          adapterCalls.push(input);
          return { reply: "companion reply", traceId: "trace_1", model: "test-model" };
        },
      },
      conversation,
      runtimeTurns,
      newMessageId: () => "companion_1",
      fallbackModel: "test-model",
    });
    const channel = createPerUserChannel({
      sql,
      ledger,
      conversation,
      project: projectConversation,
      runTurn,
    });

    await channel.accept(session, userMessage("message_1"));

    const snapshot = await conversation.readSnapshot(session.userId);
    assert.deepEqual(
      snapshot.messages.map((message) => [message.author, message.message_id, message.body]),
      [
        ["user", "message_1", "hello"],
        ["companion", "companion_1", "companion reply"],
      ],
    );
    assert.deepEqual(adapterCalls, [{ threadId: session.userId, body: "hello" }]);

    const rows = await sql`
    SELECT thread_id, trace_id, model, status, error
    FROM agent_runtime.runtime_turns
    WHERE user_id = ${session.userId}
  `;
    assert.deepEqual(rows, [
      {
        thread_id: session.userId,
        trace_id: "trace_1",
        model: "test-model",
        status: "ok",
        error: null,
      },
    ]);
  },
);

test(
  "turn failure is contained after ingress and records a failed Runtime Turn",
  { skip },
  async () => {
    const session = boundSession(randomUUID());
    const runTurn = createTurnRunner({
      sql,
      adapter: {
        invoke: async () => {
          throw new Error("model unavailable");
        },
      },
      conversation,
      runtimeTurns,
      newMessageId: () => "companion_1",
      fallbackModel: "test-model",
    });
    const channel = createPerUserChannel({
      sql,
      ledger,
      conversation,
      project: projectConversation,
      runTurn,
      onTurnError: () => {},
    });

    await assert.doesNotReject(channel.accept(session, userMessage("message_1")));
    await channel.accept(session, {
      type: "context_snapshot",
      snapshot_id: "snapshot_1",
      captured_at: "2026-06-09T00:00:00.000Z",
      period_start: "2026-06-08T23:55:00.000Z",
      period_end: "2026-06-09T00:00:00.000Z",
      summary: "screen summary",
    });

    assert.deepEqual(
      (await conversation.readSnapshot(session.userId)).messages.map((message) => [
        message.author,
        message.message_id,
      ]),
      [["user", "message_1"]],
    );

    const rows = await sql`
    SELECT thread_id, trace_id, model, status, error
    FROM agent_runtime.runtime_turns
    WHERE user_id = ${session.userId}
  `;
    assert.deepEqual(rows, [
      {
        thread_id: session.userId,
        trace_id: null,
        model: "test-model",
        status: "failed",
        error: "model unavailable",
      },
    ]);
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

function projectConversation(seenSession, event) {
  const entry = toConversationEntry(seenSession.userId, event);
  return entry ? [conversation.appendQuery(entry)] : [];
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
