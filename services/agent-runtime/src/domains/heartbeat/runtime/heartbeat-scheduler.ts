import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger } from "@intentive/providers/telemetry";

import type { HeartbeatScheduleRepo } from "../repo/heartbeat-schedule.js";

export interface HeartbeatScheduler {
  tick(): Promise<void>;
  start(): void;
  stop(): void;
}

export function createHeartbeatScheduler(params: {
  readonly scheduleRepo: HeartbeatScheduleRepo;
  readonly enqueueHeartbeat: (userId: string) => boolean;
  readonly clock?: () => Date;
  readonly pollIntervalMs?: number;
  readonly floorMs?: number;
  readonly batchLimit?: number;
  readonly logger?: Logger;
}): HeartbeatScheduler {
  const clock = params.clock ?? (() => new Date());
  const pollIntervalMs = params.pollIntervalMs ?? 60_000;
  const floorMs = params.floorMs ?? 60 * 60_000;
  const batchLimit = params.batchLimit ?? 50;
  const logger = params.logger ?? createNoopLogger();
  let timer: NodeJS.Timeout | null = null;
  let stopped = true;

  async function tick(): Promise<void> {
    const startedAt = Date.now();
    const due = await params.scheduleRepo.selectDue({ now: clock(), floorMs, limit: batchLimit });
    for (const user of due) {
      params.enqueueHeartbeat(user.userId);
    }
    logger.info("heartbeat.tick", {
      status: "ok",
      scheduler_lag_ms: 0,
      duration_ms: Date.now() - startedAt,
    });
  }

  async function loop(): Promise<void> {
    try {
      await tick();
    } catch (error) {
      logger.error("heartbeat.tick", error, { status: "failed" });
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
