import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger } from "@intentive/providers/telemetry";

import type { CronJob } from "../types/cron.js";
import type { CronJobsRepo } from "../repo/cron-jobs.js";
import { isTransient } from "../service/cron-turn.js";
import type { SchedulerClock } from "../../../runtime/scheduler-clock.js";
import { createSchedulerClock } from "../../../runtime/scheduler-clock.js";

/**
 * Event-driven Cron scheduler (ADR-0035). Holds one in-memory `SchedulerClock`
 * per active cron job, armed at the job's `next_fire_at`. Neon stays the durable
 * source of truth: the heap is rebuilt from Neon on boot and reconciled on a
 * coarse periodic resync; write-path hooks keep it current between resyncs. There
 * is no fixed-interval poll — between real events Neon receives zero
 * scheduler-driven queries.
 */
export interface CronScheduler {
  schedule(key: string, dueAt: Date, value: CronJob): void;
  cancel(key: string): void;
  resync(): Promise<void>;
  /** Pop everything due `<= now` and fire it. Deterministic test entry; also the boot catch-up path. */
  tick(): Promise<void>;
  start(): void;
  stop(): void;
}

export function createCronScheduler(params: {
  readonly cronJobsRepo: Pick<CronJobsRepo, "selectDue" | "listActive">;
  readonly enqueueCron: (job: CronJob, context: { firedAt: Date }) => Promise<void>;
  readonly clock?: () => Date;
  readonly resyncIntervalMs?: number;
  readonly logger?: Logger;
}): CronScheduler {
  const clock = params.clock ?? (() => new Date());
  const resyncIntervalMs = params.resyncIntervalMs ?? 30 * 60_000;
  const logger = params.logger ?? createNoopLogger();

  const heap: SchedulerClock<CronJob> = createSchedulerClock<CronJob>({
    onDue: async (entries) => {
      const firedAt = clock();
      for (const entry of entries) {
        await params.enqueueCron(entry.value, { firedAt });
      }
    },
    clock,
    logger,
  });

  let resyncTimer: NodeJS.Timeout | null = null;
  let stopped = true;
  let lifecycleVersion = 0;

  async function reload(shouldApply: () => boolean = () => true): Promise<boolean> {
    const jobs = await params.cronJobsRepo.listActive();
    if (!shouldApply()) {
      return false;
    }
    const activeIds = new Set<string>();
    for (const job of jobs) {
      if (job.nextFireAt) {
        activeIds.add(job.id);
        heap.schedule(job.id, job.nextFireAt, job);
      }
    }
    for (const key of heap.keys()) {
      if (!activeIds.has(key)) {
        heap.cancel(key);
      }
    }
    return true;
  }

  async function runResync(shouldApply: () => boolean = () => true): Promise<void> {
    try {
      const applied = await reload(shouldApply);
      if (!applied) {
        return;
      }
      logger.info("cron.resync", { status: "ok" });
    } catch (error) {
      if (!shouldApply()) {
        return;
      }
      if (isTransient(error)) {
        logger.warn("cron.resync", { status: "failed" });
      } else {
        logger.error("cron.resync", error, { status: "failed" });
      }
    }
  }

  return {
    schedule(key, dueAt, value) {
      heap.schedule(key, dueAt, value);
    },
    cancel(key) {
      heap.cancel(key);
    },
    resync: runResync,
    tick() {
      return heap.flushDue();
    },
    start() {
      if (!stopped) {
        return;
      }
      stopped = false;
      const version = ++lifecycleVersion;
      const isCurrent = () => !stopped && lifecycleVersion === version;
      const activate = () => {
        if (!isCurrent()) {
          return;
        }
        heap.start();
        logger.info("cron.scheduler_started", { status: "ok" });
        if (resyncIntervalMs > 0 && Number.isFinite(resyncIntervalMs)) {
          resyncTimer = setInterval(() => void runResync(isCurrent), resyncIntervalMs);
        }
      };
      void reload(isCurrent)
        .then((applied) => {
          if (!applied) {
            return;
          }
          activate();
        })
        .catch((error) => {
          if (!isCurrent()) {
            return;
          }
          if (isTransient(error)) {
            logger.warn("cron.boot", { status: "failed" });
          } else {
            logger.error("cron.boot", error, { status: "failed" });
          }
          // Keep the event-driven clock and coarse reconciliation alive so a
          // transient boot outage can recover without a process restart.
          activate();
        });
    },
    stop() {
      stopped = true;
      lifecycleVersion += 1;
      heap.stop();
      if (resyncTimer !== null) {
        clearInterval(resyncTimer);
        resyncTimer = null;
      }
    },
  };
}
