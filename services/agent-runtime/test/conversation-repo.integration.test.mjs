import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createConversationRepo } from "../dist/index.js";
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
const conversationMigration = path.join(migrationsDir, "0002_conversation.sql");

let branchId;
let sql;
let conversation;

before(async () => {
  if (skip) return;
  const branch = await createBranch();
  branchId = branch.branchId;
  await applySql(branch.connectionUri, "CREATE SCHEMA IF NOT EXISTS agent_runtime;");
  await applyMigrationFile(branch.connectionUri, conversationMigration);
  sql = await connect(branch.connectionUri);
  conversation = createConversationRepo(sql);
});

after(async () => {
  await dropBranch(branchId);
});

test(
  "readSnapshot returns appended entries oldest-first with no older cursor",
  { skip },
  async () => {
    const userId = randomUUID();

    await conversation.append(userEntry(userId, "m1", "first"));
    await conversation.append(userEntry(userId, "m2", "second"));

    const snapshot = await conversation.readSnapshot(userId);

    assert.deepEqual(
      snapshot.messages.map((m) => m.body),
      ["first", "second"],
    );
    assert.equal(snapshot.messages[0].author, "user");
    assert.equal(snapshot.messages[0].via_post_message_back, false);
    assert.equal(snapshot.before_cursor, null);
  },
);

test(
  "readSnapshot windows to the newest N oldest-first with a non-null cursor",
  { skip },
  async () => {
    const userId = randomUUID();
    for (let i = 0; i < 120; i += 1) {
      await conversation.append(userEntry(userId, `m${i}`, `body-${i}`));
    }

    const snapshot = await conversation.readSnapshot(userId, undefined, 50);

    assert.equal(snapshot.messages.length, 50);
    // Newest window oldest-first: the last 50 appended (body-70 .. body-119).
    assert.equal(snapshot.messages[0].body, "body-70");
    assert.equal(snapshot.messages[49].body, "body-119");
    assert.notEqual(snapshot.before_cursor, null);
  },
);

test(
  "readSnapshot before a cursor returns the older page and pages to exhaustion",
  { skip },
  async () => {
    const userId = randomUUID();
    for (let i = 0; i < 120; i += 1) {
      await conversation.append(userEntry(userId, `m${i}`, `body-${i}`));
    }

    const newest = await conversation.readSnapshot(userId, undefined, 50);
    const older = await conversation.readSnapshot(userId, newest.before_cursor, 50);

    assert.equal(older.messages.length, 50);
    // The page strictly older than the newest window: body-20 .. body-69.
    assert.equal(older.messages[0].body, "body-20");
    assert.equal(older.messages[49].body, "body-69");
    assert.notEqual(older.before_cursor, null);

    // The oldest page (20 remaining) exhausts history — no further cursor.
    const oldest = await conversation.readSnapshot(userId, older.before_cursor, 50);
    assert.equal(oldest.messages.length, 20);
    assert.equal(oldest.messages[0].body, "body-0");
    assert.equal(oldest.before_cursor, null);
  },
);

test("append is write-once per (user, message_id)", { skip }, async () => {
  const userId = randomUUID();

  await conversation.append(userEntry(userId, "dup", "original"));
  await conversation.append(userEntry(userId, "dup", "replayed"));

  const snapshot = await conversation.readSnapshot(userId);
  assert.equal(snapshot.messages.length, 1);
  assert.equal(snapshot.messages[0].body, "original");
});

test("append is author-agnostic and interleaves both sides by seq", { skip }, async () => {
  const userId = randomUUID();

  await conversation.append(userEntry(userId, "u1", "hi"));
  await conversation.append({
    userId,
    messageId: "c1",
    author: "companion",
    body: "hello back",
    viaPostMessageBack: true,
  });
  await conversation.append(userEntry(userId, "u2", "how are you"));

  const snapshot = await conversation.readSnapshot(userId);
  assert.deepEqual(
    snapshot.messages.map((m) => [m.author, m.body, m.via_post_message_back]),
    [
      ["user", "hi", false],
      ["companion", "hello back", true],
      ["user", "how are you", false],
    ],
  );
});

function userEntry(userId, messageId, body) {
  return { userId, messageId, author: "user", body, viaPostMessageBack: false };
}
