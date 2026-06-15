import { randomUUID } from "node:crypto";

import type { ProcedureFloorResolver } from "../../bundles/types/floor.js";
import type { DeepAgentsAdapter } from "../../runtime/types/turn.js";
import { computeNextFireAt, resolveTz } from "../config/schedule.js";
import type { CronJobsRepo } from "../repo/cron-jobs.js";
import type { CronRunsRepo } from "../repo/cron-runs.js";
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
  readonly readUserProfile?: (userId: string) => Promise<string>;
  readonly readRecentPerception?: (userId: string) => Promise<string | null>;
  readonly newThreadId?: (job: CronJob, firedAt: Date) => string;
}): (job: CronJob, context: { firedAt: Date }) => Promise<void> {
  const newThreadId =
    params.newThreadId ??
    ((job, firedAt) => `cron:${job.id}:${firedAt.toISOString()}:${randomUUID()}`);

  return async (job, { firedAt }) => {
    if (job.status !== "active") {
      return;
    }

    const threadId = newThreadId(job, firedAt);
    try {
      const [pinnedFloor, userProfile, recentPerception] = await Promise.all([
        params.floorResolver.resolve("production"),
        params.readUserProfile?.(job.userId) ?? Promise.resolve(""),
        params.readRecentPerception?.(job.userId) ?? Promise.resolve(null),
      ]);
      await params.adapter.invoke({
        userId: job.userId,
        threadId,
        body: job.prompt,
        trigger: "cron",
        pinnedFloor,
        userProfile,
        recentPerception,
      });
      const lifecycleQuery =
        job.scheduleKind === "at"
          ? params.cronJobs.deleteQuery(job.id)
          : params.cronJobs.rescheduleQuery(
              job.id,
              computeNextFireAt(
                { kind: job.scheduleKind, expr: job.scheduleExpr },
                resolveTz(job.tz, await params.loadUserTz?.(job.userId)),
                firedAt,
              ),
              0,
            );
      await params.sql.transaction([
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
        lifecycleQuery,
      ]);
    } catch (error) {
      const message = errorMessage(error);
      const nextAttempt = job.attemptCount + 1;
      const retry =
        isTransient(error) && nextAttempt < MAX_ATTEMPTS
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
                  resolveTz(job.tz, await params.loadUserTz?.(job.userId)),
                  firedAt,
                ),
                0,
              );
      await params.sql.transaction([
        params.cronRuns.recordQuery({
          userId: job.userId,
          cronJobId: job.id,
          threadId,
          trigger: "cron",
          status: "failed",
          error: message,
          attempt: job.attemptCount,
          firedAt,
        }),
        retry,
      ]);
    }
  };
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
