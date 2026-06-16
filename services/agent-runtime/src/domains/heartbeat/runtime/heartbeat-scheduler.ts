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
  // The wall-clock time the next poll was scheduled to fire, used to measure
  // scheduler lag (event-loop drift). null before the first, immediate poll.
  let expectedTickAt: number | null = null;

  async function tick(): Promise<void> {
    const now = clock();
    const startedAt = Date.now();
    const schedulerLagMs =
      expectedTickAt === null ? 0 : Math.max(0, now.getTime() - expectedTickAt);
    const due = await params.scheduleRepo.selectDue({ now, floorMs, limit: batchLimit });
    for (const user of due) {
      params.enqueueHeartbeat(user.userId);
    }
    logger.info("heartbeat.tick", {
      status: "ok",
      scheduler_lag_ms: schedulerLagMs,
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
        expectedTickAt = clock().getTime() + pollIntervalMs;
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
      expectedTickAt = null;
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
