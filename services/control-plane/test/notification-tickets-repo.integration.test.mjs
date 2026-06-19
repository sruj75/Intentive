import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createDevicesRepo } from "../dist/domains/devices/repo/devices.js";
import { createNotificationTicketsRepo } from "../dist/domains/notifications/repo/notification-tickets.js";
import { createUsersRepo } from "../dist/domains/identity/repo/users.js";
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
const usersMigration = path.join(migrationsDir, "0001_users.sql");
const devicesMigration = path.join(migrationsDir, "0003_devices.sql");
const ticketsMigration = path.join(migrationsDir, "0005_notification_tickets.sql");

let branchId;
let tickets;
let devices;
let users;

before(async () => {
  if (skip) return;
  const branch = await createBranch();
  branchId = branch.branchId;
  await applySql(branch.connectionUri, "CREATE SCHEMA IF NOT EXISTS control_plane;");
  await applyMigrationFile(branch.connectionUri, usersMigration);
  await applyMigrationFile(branch.connectionUri, devicesMigration);
  await applyMigrationFile(branch.connectionUri, ticketsMigration);
  const sql = await connect(branch.connectionUri);
  tickets = createNotificationTicketsRepo(sql);
  devices = createDevicesRepo(sql);
  users = createUsersRepo(sql);
});

after(async () => {
  await dropBranch(branchId);
});

test("recordTickets, listUnchecked(limit), and markChecked round-trip", { skip }, async () => {
  const { userId } = await users.resolveUser({ sub: "sub-ticket-1" });
  const { deviceId } = await devices.registerDevice({
    userId,
    deviceFingerprint: "fp-ticket",
    clientKind: "mobile",
    expoPushToken: "ExponentPushToken[ticket]",
  });

  await tickets.recordTickets([
    {
      ticketId: "ticket_1",
      deviceId,
      expoPushToken: "ExponentPushToken[ticket]",
      messageId: "message_1",
    },
    {
      ticketId: "ticket_2",
      deviceId,
      expoPushToken: "ExponentPushToken[ticket]",
      messageId: "message_2",
    },
  ]);

  const first = await tickets.listUnchecked(1);
  assert.equal(first.length, 1);
  assert.equal(first[0].ticketId, "ticket_1");

  await tickets.markChecked([first[0].id]);
  const remaining = await tickets.listUnchecked(10);
  assert.deepEqual(
    remaining.map((row) => row.ticketId),
    ["ticket_2"],
  );
});
