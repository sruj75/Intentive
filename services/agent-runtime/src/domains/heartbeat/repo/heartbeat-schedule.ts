import type { Sql } from "./sql.js";

export interface HeartbeatDueUser {
  readonly userId: string;
}

export interface HeartbeatScheduleRepo {
  selectDue(input: { now: Date; floorMs: number; limit: number }): Promise<HeartbeatDueUser[]>;
}

interface HeartbeatDueRow {
  readonly user_id: string;
}

export function createHeartbeatScheduleRepo(sql: Sql): HeartbeatScheduleRepo {
  return {
    async selectDue({ now, floorMs, limit }) {
      const rows = await sql<HeartbeatDueRow>`
        SELECT ai.user_id
        FROM agent_runtime.agent_instances ai
        LEFT JOIN (
          SELECT user_id, max(created_at) AS last_turn_at
          FROM agent_runtime.runtime_turns
          GROUP BY user_id
        ) rt ON rt.user_id = ai.user_id
        WHERE ${now}::timestamptz - COALESCE(rt.last_turn_at, ai.created_at) >= (${floorMs}::text || ' milliseconds')::interval
        ORDER BY COALESCE(rt.last_turn_at, ai.created_at) ASC
        LIMIT ${limit}
      `;
      return rows.map((row) => ({ userId: row.user_id }));
    },
  };
}
