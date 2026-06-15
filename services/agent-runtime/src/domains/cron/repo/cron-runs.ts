import type { CronRunRecord } from "../types/cron.js";
import type { Sql, SqlQuery } from "./sql.js";

export interface CronRunsRepo {
  recordQuery(record: CronRunRecord): SqlQuery<{ id: string }>;
}

export function createCronRunsRepo(sql: Sql): CronRunsRepo {
  return {
    recordQuery(record) {
      return sql<{ id: string }>`
        INSERT INTO agent_runtime.cron_runs
          (user_id, cron_job_id, thread_id, trigger, status, error, attempt, fired_at)
        VALUES (
          ${record.userId},
          ${record.cronJobId},
          ${record.threadId},
          ${record.trigger},
          ${record.status},
          ${record.error},
          ${record.attempt},
          ${record.firedAt}
        )
        RETURNING id
      `;
    },
  };
}
