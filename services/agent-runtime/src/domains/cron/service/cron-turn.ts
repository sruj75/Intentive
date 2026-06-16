import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger } from "@intentive/providers/telemetry";

import type { PinnedProcedureFloor, ProcedureFloorResolver } from "../../bundles/types/floor.js";
import type { DeepAgentsAdapter, Turn } from "../../runtime/types/turn.js";
import { computeNextFireAt, resolveTz } from "../config/schedule.js";
import type { CronJobsRepo } from "../repo/cron-jobs.js";
import type { CronRunsRepo } from "../repo/cron-runs.js";
import type { SqlQuery } from "../repo/sql.js";
import type { TransactionalSql } from "../repo/sql.js";
import type { CronJob } from "../types/cron.js";

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [60_000, 120_000, 300_000] as const;

export function createCronTurnHandler(params: {
  readonly sql: Pick<TransactionalSql, "transaction">;
  readonly adapter: Pick<DeepAgentsAdapter, "invoke">;
  readonly cronJobs: Pick<CronJobsRepo, "deleteQuery" | "rescheduleQuery">;
  readonly cronRuns: CronRunsRepo;
  readonly floorResolver: ProcedureFloorResolver;
  readonly loadUserTz?: (userId: string) => Promise<string | null>;
  readonly turn: Turn;
  readonly readUserProfile?: (userId: string) => Promise<string>;
  readonly readRecentPerception?: (userId: string) => Promise<string | null>;
  readonly newThreadId?: (job: CronJob, firedAt: Date) => string;
  readonly logger?: Logger;
}): (job: CronJob, context: { firedAt: Date }) => Promise<void> {
  const newThreadId = params.newThreadId ?? ((job) => job.userId);
  const logger = params.logger ?? createNoopLogger();

  return async (job, { firedAt }) => {
    if (job.status !== "active") {
      return;
    }

    const startedAt = Date.now();
    const threadId = newThreadId(job, firedAt);
    let pinnedFloor: PinnedProcedureFloor;
    let userTz: string | null | undefined;
    try {
      [pinnedFloor, userTz] = await Promise.all([
        params.floorResolver.resolve("production"),
        params.loadUserTz?.(job.userId),
      ]);
    } catch (error) {
      await params.sql.transaction(failureQueries(params, job, threadId, firedAt, userTz, error));
      logger.error("cron.turn", error, {
        user_id: job.userId,
        cron_job_id: job.id,
        thread_id: threadId,
        status: "failed",
        duration_ms: Date.now() - startedAt,
      });
      return;
    }

    let turnError: unknown = null;
    await params.turn({
      userId: job.userId,
      threadId,
      body: job.prompt,
      trigger: "cron",
      floor: pinnedFloor,
      onSuccess: () => [
        params.cronRuns.recordQuery({
          userId: job.userId,
          cronJobId: job.id,
          threadId,
          trigger: "cron",
          status: "ok",
          error: null,
          attempt: job.attemptCount,
          firedAt,
        }),
        successLifecycleQuery(params, job, firedAt, userTz),
      ],
      onFailure: (error) => ({
        queries: failureQueries(params, job, threadId, firedAt, userTz, (turnError = error)),
        rethrow: false,
      }),
    });
    const attrs = {
      user_id: job.userId,
      cron_job_id: job.id,
      thread_id: threadId,
      status: turnError ? "failed" : "ok",
      duration_ms: Date.now() - startedAt,
    } as const;
    if (turnError) {
      logger.error("cron.turn", turnError, attrs);
    } else {
      logger.info("cron.turn", attrs);
    }
  };
}

function successLifecycleQuery(
  params: {
    readonly cronJobs: Pick<CronJobsRepo, "deleteQuery" | "rescheduleQuery">;
  },
  job: CronJob,
  firedAt: Date,
  userTz: string | null | undefined,
): SqlQuery {
  return job.scheduleKind === "at"
    ? params.cronJobs.deleteQuery(job.id)
    : params.cronJobs.rescheduleQuery(
        job.id,
        computeNextFireAt(
          { kind: job.scheduleKind, expr: job.scheduleExpr },
          resolveTz(job.tz, userTz),
          firedAt,
        ),
        0,
      );
}

function failureQueries(
  params: {
    readonly cronJobs: Pick<CronJobsRepo, "deleteQuery" | "rescheduleQuery">;
    readonly cronRuns: CronRunsRepo;
  },
  job: CronJob,
  threadId: string,
  firedAt: Date,
  userTz: string | null | undefined,
  error: unknown,
): SqlQuery[] {
  return [
    params.cronRuns.recordQuery({
      userId: job.userId,
      cronJobId: job.id,
      threadId,
      trigger: "cron",
      status: "failed",
      error: errorMessage(error),
      attempt: job.attemptCount,
      firedAt,
    }),
    failureLifecycleQuery(params, job, firedAt, userTz, error),
  ];
}

function failureLifecycleQuery(
  params: {
    readonly cronJobs: Pick<CronJobsRepo, "deleteQuery" | "rescheduleQuery">;
  },
  job: CronJob,
  firedAt: Date,
  userTz: string | null | undefined,
  error: unknown,
): SqlQuery {
  const nextAttempt = job.attemptCount + 1;
  return isTransient(error) && nextAttempt < MAX_ATTEMPTS
    ? params.cronJobs.rescheduleQuery(
        job.id,
        new Date(firedAt.getTime() + backoffMs(job.attemptCount)),
        nextAttempt,
      )
    : job.scheduleKind === "at"
      ? params.cronJobs.deleteQuery(job.id)
      : params.cronJobs.rescheduleQuery(
          job.id,
          computeNextFireAt(
            { kind: job.scheduleKind, expr: job.scheduleExpr },
            resolveTz(job.tz, userTz),
            firedAt,
          ),
          0,
        );
}

export function isTransient(error: unknown): boolean {
  const text = errorMessage(error).toLowerCase();
  return [
    "rate_limit",
    "rate limit",
    "overloaded",
    "network",
    "server_error",
    "server error",
    "timeout",
  ].some((needle) => text.includes(needle));
}

function backoffMs(attemptCount: number): number {
  return BACKOFF_MS[Math.min(attemptCount, BACKOFF_MS.length - 1)] ?? BACKOFF_MS[0];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
