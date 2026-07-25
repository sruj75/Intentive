import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger, errorMessage } from "@intentive/providers/telemetry";

import type { ProcedureFloorResolver } from "../../bundles/types/floor.js";
import type { Turn } from "../../runtime/types/turn.js";
import { computeNextFireAt, resolveTz } from "../config/schedule.js";
import type { CronJobsRepo } from "../repo/cron-jobs.js";
import type { CronRunsRepo } from "../repo/cron-runs.js";
import type { SqlQuery } from "../repo/sql.js";
import type { CronJob } from "../types/cron.js";

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [60_000, 120_000, 300_000] as const;

export function createCronTurnHandler(params: {
  readonly cronJobs: Pick<CronJobsRepo, "deleteQuery" | "rescheduleQuery">;
  readonly cronRuns: CronRunsRepo;
  readonly floorResolver: ProcedureFloorResolver;
  readonly loadUserTz?: (userId: string) => Promise<string | null>;
  readonly turn: Turn;
  readonly newThreadId?: (job: CronJob, firedAt: Date) => string;
  /**
   * Post-fire heap hooks (ADR-0035). Invoked after the reschedule/delete
   * transaction commits so the in-memory clock mirrors what just landed in Neon.
   * Composition-root wired; this handler stays clock-agnostic.
   */
  readonly onRescheduleCron?: (job: CronJob, nextFireAt: Date) => void;
  readonly onCancelCron?: (id: string) => void;
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
    // Set by the floor thunk before onSuccess/onFailure run; left undefined when
    // resolution itself fails, which `resolveTz` tolerates.
    let userTz: string | null | undefined;
    let turnError: unknown = null;
    await params.turn({
      userId: job.userId,
      threadId,
      body: job.prompt,
      trigger: "cron",
      // Resolve floor and userTz inside the spine's try so resolution failures
      // flow through onFailure (cron_runs + lifecycle + the spine's runtime_turns).
      floor: async () => {
        const [pinnedFloor, tz] = await Promise.all([
          params.floorResolver.resolve("production"),
          params.loadUserTz?.(job.userId),
        ]);
        userTz = tz;
        return pinnedFloor;
      },
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
    // ADR-0035: push the committed lifecycle onto the in-memory clock. The same
    // pure helper that built the SQL row decides the heap mutation, so the two
    // can never drift.
    const lifecycle = computeLifecycle(job, firedAt, userTz, turnError);
    if (lifecycle.kind === "delete") {
      params.onCancelCron?.(job.id);
    } else {
      params.onRescheduleCron?.(job, lifecycle.nextFireAt);
    }
    if (turnError) {
      logger.error("cron.turn", turnError, attrs);
    } else {
      logger.info("cron.turn", attrs);
    }
  };
}

type Lifecycle =
  | { readonly kind: "delete" }
  | { readonly kind: "reschedule"; readonly nextFireAt: Date; readonly attemptCount: number };

/**
 * Pure post-fire lifecycle decision shared by both the SQL row batched into the
 * turn transaction and the in-memory clock hook (ADR-0035), so the two can never
 * drift. Pass `error = null` for the success path; a non-null transient error
 * with attempts remaining reschedules with backoff, otherwise the job advances
 * forward from `firedAt` (recurring) or is deleted (one-shot `at`).
 */
function computeLifecycle(
  job: CronJob,
  firedAt: Date,
  userTz: string | null | undefined,
  error: unknown,
): Lifecycle {
  if (error !== null) {
    const nextAttempt = job.attemptCount + 1;
    if (isTransient(error) && nextAttempt < MAX_ATTEMPTS) {
      return {
        kind: "reschedule",
        nextFireAt: new Date(firedAt.getTime() + backoffMs(job.attemptCount)),
        attemptCount: nextAttempt,
      };
    }
  }
  return job.scheduleKind === "at"
    ? { kind: "delete" }
    : {
        kind: "reschedule",
        nextFireAt: computeNextFireAt(
          { kind: job.scheduleKind, expr: job.scheduleExpr },
          resolveTz(job.tz, userTz),
          firedAt,
        ),
        attemptCount: 0,
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
  const lifecycle = computeLifecycle(job, firedAt, userTz, null);
  return lifecycle.kind === "delete"
    ? params.cronJobs.deleteQuery(job.id)
    : params.cronJobs.rescheduleQuery(job.id, lifecycle.nextFireAt, lifecycle.attemptCount);
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
  const lifecycle = computeLifecycle(job, firedAt, userTz, error);
  return lifecycle.kind === "delete"
    ? params.cronJobs.deleteQuery(job.id)
    : params.cronJobs.rescheduleQuery(job.id, lifecycle.nextFireAt, lifecycle.attemptCount);
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
    "fetch failed",
  ].some((needle) => text.includes(needle));
}

function backoffMs(attemptCount: number): number {
  return BACKOFF_MS[Math.min(attemptCount, BACKOFF_MS.length - 1)] ?? BACKOFF_MS[0];
}
