import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger } from "@intentive/providers/telemetry";

import type { CronJob } from "../types/cron.js";
import type { CronJobsRepo } from "../repo/cron-jobs.js";

export interface CronScheduler {
  tick(): Promise<void>;
  start(): void;
  stop(): void;
}

export function createCronScheduler(params: {
  readonly cronJobsRepo: Pick<CronJobsRepo, "selectDue">;
  readonly enqueueCron: (job: CronJob, context: { firedAt: Date }) => Promise<void>;
  readonly clock?: () => Date;
  readonly pollIntervalMs?: number;
  readonly batchLimit?: number;
  readonly logger?: Logger;
}): CronScheduler {
  const clock = params.clock ?? (() => new Date());
  const pollIntervalMs = params.pollIntervalMs ?? 60_000;
  const batchLimit = params.batchLimit ?? 50;
  const logger = params.logger ?? createNoopLogger();
  let timer: NodeJS.Timeout | null = null;
  let stopped = true;

  async function tick(): Promise<void> {
    const now = clock();
    const startedAt = Date.now();
    const due = await params.cronJobsRepo.selectDue({ now, limit: batchLimit });
    for (const job of due) {
      await params.enqueueCron(job, { firedAt: now });
    }
    logger.info("cron.tick", {
      status: "ok",
      scheduler_lag_ms: 0,
      duration_ms: Date.now() - startedAt,
    });
  }

  async function loop(): Promise<void> {
    try {
      await tick();
    } catch (error) {
      logger.error("cron.tick", error, { status: "failed" });
    } finally {
      if (!stopped) {
        timer = setTimeout(() => void loop(), pollIntervalMs);
      }
    }
  }

  return {
    tick,
    start() {
      if (!stopped) {
        return;
      }
      stopped = false;
      timer = setTimeout(() => void loop(), 0);
    },
    stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
      timer = null;
    },
  };
}
