import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  createConversationRepo,
  createEventLedger,
  createPerUserChannel,
  createPerceptionRecordsRepo,
  createRuntimeTurnsRepo,
  createTurnRunner,
  toConversationEntry,
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
const sessionsMigration = path.join(migrationsDir, "0001_sessions.sql");
const conversationMigration = path.join(migrationsDir, "0002_conversation.sql");
const runtimeTurnsMigration = path.join(migrationsDir, "0003_runtime_turns.sql");
const runtimeTurnsBundleVersionMigration = path.join(
  migrationsDir,
  "0004_runtime_turns_bundle_version.sql",
);
const perceptionRecordsMigration = path.join(migrationsDir, "0010_perception_records.sql");
const perceptionExpiryMigration = path.join(migrationsDir, "0011_perception_expiry_tombstone.sql");

let branchId;
let sql;
let ledger;
let conversation;
let runtimeTurns;
let perceptionRecords;

before(async () => {
  if (skip) return;
  const branch = await createBranch();
  branchId = branch.branchId;
  await applySql(branch.connectionUri, "CREATE SCHEMA IF NOT EXISTS agent_runtime;");
  await applyMigrationFile(branch.connectionUri, sessionsMigration);
  await applyMigrationFile(branch.connectionUri, conversationMigration);
  await applyMigrationFile(branch.connectionUri, runtimeTurnsMigration);
  await applyMigrationFile(branch.connectionUri, runtimeTurnsBundleVersionMigration);
  await applyMigrationFile(branch.connectionUri, perceptionRecordsMigration);
  await applyMigrationFile(branch.connectionUri, perceptionExpiryMigration);
  sql = await connect(branch.connectionUri);
  ledger = createEventLedger(sql);
  conversation = createConversationRepo(sql);
  runtimeTurns = createRuntimeTurnsRepo(sql);
  perceptionRecords = createPerceptionRecordsRepo(sql);
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
  "runtime ingress records perception events without transcript rows and projects searchable records",
  { skip },
  async () => {
    const session = boundSession(randomUUID());
    const channel = createPerUserChannel({
      sql,
      ledger,
      conversation,
      project: projectIngress,
    });

    await channel.accept(session, perceptionEvent("perception_1", "screen summary"));

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

    const records = await perceptionRecords.search({
      userId: session.userId,
      query: "screen",
    });
    assert.deepEqual(
      records.map((record) => [record.eventId, record.summary]),
      [["perception_1", "screen summary"]],
    );
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
          return {
            reply: "companion reply",
            traceId: "trace_1",
            model: "test-model",
            bundleVersion: "floor_v1",
          };
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
    assert.deepEqual(adapterCalls, [
      {
        userId: session.userId,
        threadId: session.userId,
        body: "hello",
        trigger: "user_message",
        pinnedFloor: floor("floor_v1"),
        userProfile: "",
      },
    ]);

    const rows = await sql`
    SELECT thread_id, trace_id, model, bundle_version, status, error
    FROM agent_runtime.runtime_turns
    WHERE user_id = ${session.userId}
  `;
    assert.deepEqual(rows, [
      {
        thread_id: session.userId,
        trace_id: "trace_1",
        model: "test-model",
        bundle_version: "floor_v1",
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
    await channel.accept(session, perceptionEvent("perception_1", "screen summary"));

    assert.deepEqual(
      (await conversation.readSnapshot(session.userId)).messages.map((message) => [
        message.author,
        message.message_id,
      ]),
      [["user", "message_1"]],
    );

    const rows = await sql`
    SELECT thread_id, trace_id, model, bundle_version, status, error
    FROM agent_runtime.runtime_turns
    WHERE user_id = ${session.userId}
  `;
    assert.deepEqual(rows, [
      {
        thread_id: session.userId,
        trace_id: null,
        model: "test-model",
        bundle_version: null,
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

function projectIngress(seenSession, event) {
  const queries = [];
  const entry = toConversationEntry(seenSession.userId, event);
  if (entry) {
    queries.push(conversation.appendQuery(entry));
  }
  if (event.type === "perception_event") {
    queries.push(perceptionRecords.appendQuery(toPerceptionRecord(seenSession.userId, event)));
  }
  return queries;
}

function boundSession(userId) {
  return {
    userId,
    clientKind: "mobile",
    agentInstanceId: randomUUID(),
    pinnedFloor: floor("floor_v1"),
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

function perceptionEvent(eventId, summary) {
  return {
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
    expires_at: "2099-06-09T00:00:00.000Z",
    local_record_ref: `screen-memory://${eventId}`,
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
