import type { BootstrapLifecycleRepo, BootstrapStatus } from "../types/bootstrap.js";
import type { Sql } from "./sql.js";

interface BootstrapStatusRow {
  readonly bootstrap_status: string;
}

export function createBootstrapLifecycleRepo(sql: Sql): BootstrapLifecycleRepo {
  return {
    async readStatus(userId) {
      const rows = await sql<BootstrapStatusRow>`
        SELECT bootstrap_status
        FROM agent_runtime.agent_instances
        WHERE user_id = ${userId}
      `;
      const row = rows[0];
      if (!row) {
        throw new Error("Bootstrap lifecycle requires an Agent Instance");
      }
      return parseBootstrapStatus(row.bootstrap_status);
    },

    markInProgressQuery(userId) {
      return sql`
        UPDATE agent_runtime.agent_instances
        SET
          bootstrap_status = 'in_progress',
          bootstrap_started_at = COALESCE(bootstrap_started_at, now())
        WHERE user_id = ${userId}
          AND bootstrap_status = 'pending'
      `;
    },

    markCompletedQuery(userId) {
      return sql`
        UPDATE agent_runtime.agent_instances
        SET
          bootstrap_status = 'completed',
          bootstrap_completed_at = COALESCE(bootstrap_completed_at, now())
        WHERE user_id = ${userId}
          AND bootstrap_status = 'in_progress'
      `;
    },
  };
}

function parseBootstrapStatus(value: string): BootstrapStatus {
  if (value === "pending" || value === "in_progress" || value === "completed") {
    return value;
  }
  throw new Error("Agent Instance has an invalid bootstrap status");
}
