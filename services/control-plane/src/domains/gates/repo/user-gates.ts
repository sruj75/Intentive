/**
 * User-gates repo — the only place that knows the
 * `control_plane.user_gates` SQL.
 *
 * A deep module behind a three-method interface: callers record a gate
 * completion or read a user's gate state, and the table shape, the
 * set-if-null idempotency, and the timestamp→boolean projection all stay hidden
 * in here. The service above reasons in `GateState` booleans and never sees a
 * timestamp or a row.
 *
 * Storage is one row per user with a completion timestamp per gate (not an
 * event log): recording is idempotent via `COALESCE`, which preserves the
 * first-completion time on a re-record.
 *
 * The interface is defined here (the repo tier owns its own contract); the
 * service imports it forward. The implementation lives below.
 */
import type { Sql } from "../../../db/sql.js";
import type { GateState } from "../types/state.js";

export interface UserGatesRepo {
  /**
   * Record that the Consent Primer is complete for `userId`. Idempotent: a
   * repeated call is a no-op that leaves the first-completion timestamp
   * untouched.
   */
  recordConsent(userId: string): Promise<void>;

  /**
   * Record that the Sibling Invitation is resolved (skipped) for `userId`.
   * Idempotent in the same way as {@link recordConsent}.
   */
  recordSiblingSkip(userId: string): Promise<void>;

  /**
   * Return `userId`'s cross-client gate state. A user with no recorded gates
   * (no row) reads as both `false` — nothing completed yet.
   */
  readState(userId: string): Promise<GateState>;
}

export function createUserGatesRepo(sql: Sql): UserGatesRepo {
  return {
    async recordConsent(userId) {
      // Upsert the row, stamping the completion time only on first sight:
      // COALESCE keeps an already-set timestamp, so a re-record is a no-op that
      // preserves the original completion time (idempotency, set-if-null).
      await sql`
        INSERT INTO control_plane.user_gates (user_id, consent_completed_at)
        VALUES (${userId}, now())
        ON CONFLICT (user_id)
        DO UPDATE SET consent_completed_at = COALESCE(control_plane.user_gates.consent_completed_at, now())
      `;
    },

    async recordSiblingSkip(userId) {
      await sql`
        INSERT INTO control_plane.user_gates (user_id, sibling_skip_at)
        VALUES (${userId}, now())
        ON CONFLICT (user_id)
        DO UPDATE SET sibling_skip_at = COALESCE(control_plane.user_gates.sibling_skip_at, now())
      `;
    },

    async readState(userId) {
      // Project the two timestamps to booleans here so the table shape never
      // leaks past the repo. No row → no gates recorded → both false.
      const rows = await sql<{ consent_completed: boolean; sibling_skipped: boolean }>`
        SELECT
          consent_completed_at IS NOT NULL AS consent_completed,
          sibling_skip_at      IS NOT NULL AS sibling_skipped
        FROM control_plane.user_gates
        WHERE user_id = ${userId}
      `;
      const row = rows[0];
      return {
        consentCompleted: row?.consent_completed ?? false,
        siblingSkipped: row?.sibling_skipped ?? false,
      };
    },
  };
}
