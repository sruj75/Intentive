import type { RuntimeTurnRecord } from "../types/turn.js";
import type { Sql, SqlQuery } from "./sql.js";

export interface RuntimeTurnsRepo {
  /** Returns the composable insert query for the durable Runtime Turn record. */
  recordQuery(record: RuntimeTurnRecord): SqlQuery<{ id: string }>;
}

export function createRuntimeTurnsRepo(sql: Sql): RuntimeTurnsRepo {
  return {
    recordQuery(record) {
      return sql<{ id: string }>`
        INSERT INTO agent_runtime.runtime_turns
          (user_id, thread_id, trace_id, model, status, error)
        VALUES (
          ${record.userId},
          ${record.threadId},
          ${record.traceId},
          ${record.model},
          ${record.status},
          ${record.error}
        )
        RETURNING id
      `;
    },
  };
}
