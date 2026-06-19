/**
 * Repo-layer integration test (ADR-0003): the real `0003_devices.sql` + the real
 * upsert, against a disposable Neon branch. Proves the database-enforced
 * invariants a fake repo can't — idempotency on `(user_id, device_fingerprint)`,
 * non-destructive Expo Push Token rotation, token-free and token-bearing reads,
 * match-guarded token clearing, and the FK to users. Applies `0001_users.sql`
 * first so the FK target exists.
 *
 * Skips when `NEON_API_KEY` / `NEON_PROJECT_ID` are absent so local runs without
 * credentials stay green; CI supplies the secret and runs it for real.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createDevicesRepo } from "../dist/domains/devices/repo/devices.js";
import { createUsersRepo } from "../dist/domains/identity/repo/users.js";
import {
  connect,
  createBranch,
  dropBranch,
  hasNeonBranchCreds,
  applySql,
  applyMigrationFile,
} from "./helpers/neon-branch.mjs";

const skip = !hasNeonBranchCreds();
const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
const usersMigration = path.join(migrationsDir, "0001_users.sql");
const devicesMigration = path.join(migrationsDir, "0003_devices.sql");

let branchId;
let repo;
let users;
let sql;

before(async () => {
  if (skip) return;
  const branch = await createBranch();
  branchId = branch.branchId;
  // The schema + role are #50's job in production; on a throwaway test branch we
  // bootstrap just the schema namespace so the migrations can create their tables.
  await applySql(branch.connectionUri, "CREATE SCHEMA IF NOT EXISTS control_plane;");
  await applyMigrationFile(branch.connectionUri, usersMigration);
  await applyMigrationFile(branch.connectionUri, devicesMigration);
  sql = await connect(branch.connectionUri);
  repo = createDevicesRepo(sql);
  users = createUsersRepo(sql);
});

after(async () => {
  await dropBranch(branchId);
});

test("first registration returns a stable device id and creates one row", { skip }, async () => {
  const { userId } = await users.resolveUser({ sub: "sub-dev-1" });
  const { deviceId } = await repo.registerDevice({
    userId,
    deviceFingerprint: "fp-1",
    clientKind: "mobile",
    expoPushToken: "tok-1",
  });

  assert.ok(deviceId, "registration returns a device id");

  const [{ count }] = await sql`
    SELECT count(*)::int AS count FROM control_plane.devices WHERE user_id = ${userId}
  `;
  assert.equal(count, 1);
});

test(
  "re-registering the same device rotates the token without duplicating the row",
  { skip },
  async () => {
    const { userId } = await users.resolveUser({ sub: "sub-dev-2" });
    const first = await repo.registerDevice({
      userId,
      deviceFingerprint: "fp-2",
      clientKind: "mobile",
      expoPushToken: "tok-old",
    });
    const second = await repo.registerDevice({
      userId,
      deviceFingerprint: "fp-2",
      clientKind: "mobile",
      expoPushToken: "tok-new",
    });

    assert.equal(first.deviceId, second.deviceId, "same device must keep its id");

    const rows = await sql`
    SELECT expo_push_token FROM control_plane.devices WHERE user_id = ${userId}
  `;
    assert.equal(rows.length, 1, "a re-register must not create a second row");
    assert.equal(rows[0].expo_push_token, "tok-new", "a provided token rotates in");
  },
);

test(
  "a re-register that omits the token keeps the existing one (never destructive)",
  { skip },
  async () => {
    const { userId } = await users.resolveUser({ sub: "sub-dev-3" });
    await repo.registerDevice({
      userId,
      deviceFingerprint: "fp-3",
      clientKind: "desktop",
      expoPushToken: "tok-keep",
    });
    await repo.registerDevice({ userId, deviceFingerprint: "fp-3", clientKind: "desktop" });

    const [{ expo_push_token }] = await sql`
    SELECT expo_push_token FROM control_plane.devices WHERE user_id = ${userId}
  `;
    assert.equal(expo_push_token, "tok-keep", "an omitted token must not clear the stored value");
  },
);

test("listDevicesForUser enumerates the user's devices token-free", { skip }, async () => {
  const { userId } = await users.resolveUser({ sub: "sub-dev-4" });
  await repo.registerDevice({
    userId,
    deviceFingerprint: "fp-a",
    clientKind: "mobile",
    expoPushToken: "t",
  });
  await repo.registerDevice({
    userId,
    deviceFingerprint: "fp-b",
    clientKind: "desktop",
    expoPushToken: "t",
  });

  const devices = await repo.listDevicesForUser(userId);

  assert.equal(devices.length, 2);
  for (const device of devices) {
    assert.deepEqual(
      Object.keys(device).sort(),
      ["client_kind", "device_id", "registered_at", "user_id"],
      "the enumeration must expose no token columns",
    );
  }
  assert.deepEqual(devices.map((d) => d.client_kind).sort(), ["desktop", "mobile"]);
});

test(
  "listExpoPushTargetsForUser returns only devices with Expo Push Tokens",
  { skip },
  async () => {
    const { userId } = await users.resolveUser({ sub: "sub-dev-5" });
    const withToken = await repo.registerDevice({
      userId,
      deviceFingerprint: "fp-token",
      clientKind: "mobile",
      expoPushToken: "ExponentPushToken[with-token]",
    });
    await repo.registerDevice({
      userId,
      deviceFingerprint: "fp-null",
      clientKind: "desktop",
    });

    const targets = await repo.listExpoPushTargetsForUser(userId);

    assert.deepEqual(targets, [
      {
        deviceId: withToken.deviceId,
        expoPushToken: "ExponentPushToken[with-token]",
      },
    ]);
  },
);

test("clearExpoPushToken clears only when the stored token still matches", { skip }, async () => {
  const { userId } = await users.resolveUser({ sub: "sub-dev-6" });
  const { deviceId } = await repo.registerDevice({
    userId,
    deviceFingerprint: "fp-clear",
    clientKind: "mobile",
    expoPushToken: "old-token",
  });
  await repo.registerDevice({
    userId,
    deviceFingerprint: "fp-clear",
    clientKind: "mobile",
    expoPushToken: "new-token",
  });

  await repo.clearExpoPushToken(deviceId, "old-token");
  let [{ expo_push_token }] = await sql`
    SELECT expo_push_token FROM control_plane.devices WHERE id = ${deviceId}
  `;
  assert.equal(expo_push_token, "new-token", "a stale ticket must not clear a rotated token");

  await repo.clearExpoPushToken(deviceId, "new-token");
  [{ expo_push_token }] = await sql`
    SELECT expo_push_token FROM control_plane.devices WHERE id = ${deviceId}
  `;
  assert.equal(expo_push_token, null, "the matching dead token is cleared");

  const [{ count }] = await sql`
    SELECT count(*)::int AS count FROM control_plane.devices WHERE id = ${deviceId}
  `;
  assert.equal(count, 1, "clearing a token keeps the device row");
});

test("registering for an unknown user is rejected by the foreign key", { skip }, async () => {
  await assert.rejects(() =>
    repo.registerDevice({
      userId: "00000000-0000-0000-0000-000000000000",
      deviceFingerprint: "fp-x",
      clientKind: "mobile",
    }),
  );
});
