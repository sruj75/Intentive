import type { Sql } from "./sql.js";

export interface HeartbeatDueUser {
  readonly userId: string;
}

export interface HeartbeatUserCandidate {
  readonly userId: string;
  /** The floor anchor: last judgment, otherwise server-side orientation completion. */
  readonly lastActivityAt: Date;
}

export interface HeartbeatScheduleRepo {
  selectDue(input: { now: Date; floorMs: number; limit: number }): Promise<HeartbeatDueUser[]>;
  /** Unbounded boot/resync load: every user plus their last-activity anchor (ADR-0035). */
  listAll(): Promise<readonly HeartbeatUserCandidate[]>;
}

interface HeartbeatDueRow {
  readonly user_id: string;
  readonly last_activity_at: string;
}

export function createHeartbeatScheduleRepo(sql: Sql): HeartbeatScheduleRepo {
  return {
    async selectDue({ now, floorMs, limit }) {
      const rows = await sql<HeartbeatDueRow>`
        SELECT
          user_id,
          COALESCE(last_monitoring_turn_at, orientation_completed_at) AS last_activity_at
        FROM agent_runtime.coaching_windows
        WHERE ended_at IS NULL
          AND orientation_status = 'completed'
          AND ${now}::timestamptz
            - COALESCE(last_monitoring_turn_at, orientation_completed_at)
            >= (${floorMs}::text || ' milliseconds')::interval
        ORDER BY COALESCE(last_monitoring_turn_at, orientation_completed_at) ASC
        LIMIT ${limit}
      `;
      return rows.map((row) => ({ userId: row.user_id }));
    },

    async listAll() {
      const rows = await sql<HeartbeatDueRow>`
        SELECT
          user_id,
          COALESCE(last_monitoring_turn_at, orientation_completed_at) AS last_activity_at
        FROM agent_runtime.coaching_windows
        WHERE ended_at IS NULL
          AND orientation_status = 'completed'
        ORDER BY COALESCE(last_monitoring_turn_at, orientation_completed_at) ASC
      `;
      return rows.map((row) => ({
        userId: row.user_id,
        lastActivityAt: new Date(row.last_activity_at),
      }));
    },
  };
}
