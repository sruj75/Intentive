import type { CronJob, CronJobStatus, ScheduleKind } from "../types/cron.js";
import type { Sql, SqlQuery } from "./sql.js";

export interface CronJobsRepo {
  upsertQuery(job: CronJobUpsert): SqlQuery<CronJobRow>;
  loadByPath(userId: string, path: string): Promise<CronJob | null>;
  loadById(id: string): Promise<CronJob | null>;
  listByUser(userId: string): Promise<CronJob[]>;
  selectDue(input: { now: Date; limit: number }): Promise<CronJob[]>;
  deleteQuery(id: string): SqlQuery<{ id: string }>;
  rescheduleQuery(id: string, nextFireAt: Date, attemptCount?: number): SqlQuery<{ id: string }>;
}

export interface CronJobUpsert {
  readonly userId: string;
  readonly path: string;
  readonly name: string;
  readonly scheduleKind: ScheduleKind;
  readonly scheduleExpr: string;
  readonly tz: string | null;
  readonly status: CronJobStatus;
  readonly nextFireAt: Date | null;
  readonly prompt: string;
}

interface CronJobRow {
  readonly id: string;
  readonly user_id: string;
  readonly path: string;
  readonly name: string;
  readonly schedule_kind: ScheduleKind;
  readonly schedule_expr: string;
  readonly tz: string | null;
  readonly status: CronJobStatus;
  readonly next_fire_at: string | null;
  readonly prompt: string;
  readonly attempt_count: number;
  readonly created_at?: string;
  readonly updated_at?: string;
}

export function createCronJobsRepo(sql: Sql): CronJobsRepo {
  return {
    upsertQuery(job) {
      return sql<CronJobRow>`
        INSERT INTO agent_runtime.cron_jobs
          (user_id, path, name, schedule_kind, schedule_expr, tz, status, next_fire_at, prompt, attempt_count)
        VALUES (
          ${job.userId},
          ${job.path},
          ${job.name},
          ${job.scheduleKind},
          ${job.scheduleExpr},
          ${job.tz},
          ${job.status},
          ${job.nextFireAt},
          ${job.prompt},
          0
        )
        ON CONFLICT (user_id, path) DO UPDATE SET
          name = EXCLUDED.name,
          schedule_kind = EXCLUDED.schedule_kind,
          schedule_expr = EXCLUDED.schedule_expr,
          tz = EXCLUDED.tz,
          status = EXCLUDED.status,
          next_fire_at = EXCLUDED.next_fire_at,
          prompt = EXCLUDED.prompt,
          attempt_count = 0,
          updated_at = now()
        RETURNING *
      `;
    },

    async loadByPath(userId, path) {
      const rows = await sql<CronJobRow>`
        SELECT *
        FROM agent_runtime.cron_jobs
        WHERE user_id = ${userId} AND path = ${path}
      `;
      return rows[0] ? toCronJob(rows[0]) : null;
    },

    async loadById(id) {
      const rows = await sql<CronJobRow>`
        SELECT *
        FROM agent_runtime.cron_jobs
        WHERE id = ${id}
      `;
      return rows[0] ? toCronJob(rows[0]) : null;
    },

    async listByUser(userId) {
      const rows = await sql<CronJobRow>`
        SELECT *
        FROM agent_runtime.cron_jobs
        WHERE user_id = ${userId}
        ORDER BY path ASC
      `;
      return rows.map(toCronJob);
    },

    async selectDue({ now, limit }) {
      const rows = await sql<CronJobRow>`
        SELECT *
        FROM agent_runtime.cron_jobs
        WHERE status = 'active' AND next_fire_at <= ${now}
        ORDER BY next_fire_at ASC, updated_at ASC
        LIMIT ${limit}
      `;
      return rows.map(toCronJob);
    },

    deleteQuery(id) {
      return sql<{ id: string }>`
        DELETE FROM agent_runtime.cron_jobs
        WHERE id = ${id}
        RETURNING id
      `;
    },

    rescheduleQuery(id, nextFireAt, attemptCount = 0) {
      return sql<{ id: string }>`
        UPDATE agent_runtime.cron_jobs
        SET next_fire_at = ${nextFireAt}, attempt_count = ${attemptCount}, updated_at = now()
        WHERE id = ${id}
        RETURNING id
      `;
    },
  };
}

function toCronJob(row: CronJobRow): CronJob {
  return Object.freeze({
    id: row.id,
    userId: row.user_id,
    path: row.path,
    name: row.name,
    scheduleKind: row.schedule_kind,
    scheduleExpr: row.schedule_expr,
    tz: row.tz,
    status: row.status,
    nextFireAt: row.next_fire_at ? new Date(row.next_fire_at) : null,
    prompt: row.prompt,
    attemptCount: row.attempt_count,
    createdAt: row.created_at ? new Date(row.created_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
  });
}
