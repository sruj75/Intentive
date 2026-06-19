/**
 * Devices repo — the only place that knows the `control_plane.devices` SQL.
 *
 * A deep module behind a two-method interface: callers register a device and get
 * back a stable `device_id`, or list a User's devices for gate composition or
 * push delivery. The table shape, the idempotent upsert, the token-rotation
 * semantics, the UNIQUE-constraint idempotency, and the `created_at →
 * registered_at` mapping are all hidden in here. Crucially, the Expo Push Token
 * column is knowledge that leaves this module only through the delivery-scoped
 * `listExpoPushTargetsForUser` port; the token-free `listDevicesForUser` read
 * used by account/gate composition cannot leak it.
 */
import type { ClientKind } from "@intentive/api-contract";

import type { Sql } from "../../../db/sql.js";

/**
 * The token-free view of a registered device — the only shape that crosses a
 * domain boundary. Mirrors the shared `@intentive/domain-types` `Device`
 * (deliberately no fingerprint, no token); `registered_at` is when the device
 * first appeared (the row's `created_at`).
 */
export interface RegisteredDevice {
  device_id: string;
  user_id: string;
  client_kind: ClientKind;
  registered_at: string;
}

export interface RegisterDeviceInput {
  userId: string;
  deviceFingerprint: string;
  clientKind: ClientKind;
  expoPushToken?: string;
}

export interface ExpoPushTarget {
  deviceId: string;
  expoPushToken: string;
}

export interface DevicesRepo {
  /**
   * Register the device for `userId`, returning its stable `device_id`.
   * Idempotent on `(user_id, device_fingerprint)` (enforced by the UNIQUE
   * constraint, not application logic): the same device always resolves to the
   * same id. Tokens are additive/never-destructive — a provided token rotates
   * in, an omitted token keeps the stored value.
   */
  registerDevice(input: RegisterDeviceInput): Promise<{ deviceId: string }>;

  /**
   * Every device registered for `userId`, token-free. The per-User enumeration
   * push fan-out (#49) and the gate composer (ADR-0005) read. Never exposes
   * tokens.
   */
  listDevicesForUser(userId: string): Promise<RegisteredDevice[]>;

  /**
   * Delivery-scoped token-bearing read. This is the only repo surface that
   * exposes Expo Push Tokens, and only notifications should depend on it.
   */
  listExpoPushTargetsForUser(userId: string): Promise<ExpoPushTarget[]>;

  /**
   * Clear a dead Expo Push Token if the row still holds that exact token. The
   * match guard prevents a stale receipt from clearing a token rotated in later.
   */
  clearExpoPushToken(deviceId: string, expoPushToken: string): Promise<void>;
}

export function createDevicesRepo(sql: Sql): DevicesRepo {
  return {
    async registerDevice({ userId, deviceFingerprint, clientKind, expoPushToken }) {
      // ON CONFLICT … DO UPDATE so a re-register touches the existing row and the
      // RETURNING clause yields the id on both the insert and the conflict path
      // in one round trip. COALESCE(EXCLUDED.token, devices.token) rotates a
      // provided token in but keeps the stored one when the field is omitted, so
      // a plain re-register never destroys a working token (Q5; clearing a token
      // is a separate explicit act, not a side effect of registration).
      const rows = await sql<{ id: string }>`
        INSERT INTO control_plane.devices
          (user_id, device_fingerprint, client_kind, expo_push_token)
        VALUES (
          ${userId},
          ${deviceFingerprint},
          ${clientKind},
          ${expoPushToken ?? null}
        )
        ON CONFLICT (user_id, device_fingerprint) DO UPDATE SET
          client_kind = EXCLUDED.client_kind,
          expo_push_token = COALESCE(
            EXCLUDED.expo_push_token,
            control_plane.devices.expo_push_token
          ),
          updated_at  = now()
        RETURNING id
      `;
      const row = rows[0];
      if (!row) {
        // The upsert always returns exactly one row; a missing row means the
        // query contract was broken (e.g. wrong SQL), not a normal outcome.
        throw new Error("registerDevice: upsert returned no row");
      }
      return { deviceId: row.id };
    },

    async listDevicesForUser(userId) {
      // Token columns are intentionally not selected — the token-free shape is
      // the only thing that may cross a domain boundary.
      return sql<RegisteredDevice>`
        SELECT
          id          AS device_id,
          user_id,
          client_kind,
          created_at  AS registered_at
        FROM control_plane.devices
        WHERE user_id = ${userId}
        ORDER BY created_at
      `;
    },

    async listExpoPushTargetsForUser(userId) {
      return sql<ExpoPushTarget>`
        SELECT
          id              AS "deviceId",
          expo_push_token AS "expoPushToken"
        FROM control_plane.devices
        WHERE user_id = ${userId}
          AND expo_push_token IS NOT NULL
        ORDER BY created_at
      `;
    },

    async clearExpoPushToken(deviceId, expoPushToken) {
      await sql`
        UPDATE control_plane.devices
        SET expo_push_token = NULL,
            updated_at = now()
        WHERE id = ${deviceId}
          AND expo_push_token = ${expoPushToken}
      `;
    },
  };
}
