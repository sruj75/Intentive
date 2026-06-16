import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  createConnectHandler,
  createConversationRepo,
  createEventLedger,
  createPerUserChannel,
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

before(async () => {
  if (skip) return;
  const branch = await createBranch();
  branchId = branch.branchId;
  await applySql(branch.connectionUri, "CREATE SCHEMA IF NOT EXISTS agent_runtime;");
  await applyMigrationFile(branch.connectionUri, path.join(migrationsDir, "0001_sessions.sql"));
  await applyMigrationFile(branch.connectionUri, path.join(migrationsDir, "0002_conversation.sql"));
  sql = await connect(branch.connectionUri);
  conversation = createConversationRepo(sql);
  ledger = createEventLedger(sql);
});

after(async () => {
  await dropBranch(branchId);
});

test(
  "connect rebuilds hello_ok Session Snapshot from Neon after in-memory state is dropped",
  { skip },
  async () => {
    const userId = randomUUID();
    const session = boundSession(userId);
    const channel = createPerUserChannel({
      sql,
      ledger,
      conversation,
      project: (seenSession, event) => {
        const entry = toConversationEntry(seenSession.userId, event);
        return entry ? [conversation.appendQuery(entry)] : [];
      },
    });
    await channel.accept(session, userMessage("message_1"));

    const rehydratedChannel = createPerUserChannel({
      sql,
      ledger,
      conversation,
      project: () => [],
    });
    const connectHandler = createConnectHandler({
      verifier: { verify: async () => ({ user_id: "auth_subject_1" }) },
      floorResolver: { resolve: async () => floor("floor_v2") },
      conversation: rehydratedChannel,
      sessions: {
        loadSessionByAuthSubject: async () => ({
          userId,
          clientKind: "mobile",
          agentInstanceId: session.agentInstanceId,
        }),
      },
    });

    const result = await connectHandler.handle({
      type: "connect",
      auth_token: "token",
      client_kind: "mobile",
    });

    assert.equal(result.closeSocket, false);
    assert.equal(result.response.type, "hello_ok");
    assert.deepEqual(
      result.response.session_snapshot.messages.map((message) => [
        message.message_id,
        message.body,
      ]),
      [["message_1", "hello"]],
    );
    assert.equal(result.session.pinnedFloor.version, "floor_v2");
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

function userMessage(messageId) {
  return {
    type: "user_message",
    message_id: messageId,
    body: "hello",
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
