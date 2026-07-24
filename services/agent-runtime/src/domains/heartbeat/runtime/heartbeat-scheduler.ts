import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger } from "@intentive/providers/telemetry";

import type { HeartbeatScheduleRepo } from "../repo/heartbeat-schedule.js";
import type { SchedulerClock } from "../../../runtime/scheduler-clock.js";
import { createSchedulerClock } from "../../../runtime/scheduler-clock.js";

/**
 * Event-driven Heartbeat scheduler (ADR-0035). One in-memory `SchedulerClock`
 * per user, armed at the user's floor-due instant (`last_activity + floorMs`).
 * Mirrors the old `selectDue` computation but pushed onto the write side: the
 * heap is rebuilt from Neon on boot and kept current via the Turn Execution
 * spine's `onTurnCommitted` hook (and new-user bootstrap), with a coarse
 * periodic resync as a safety net. Zero stored heartbeat state (ADR-0027) is
 * preserved — the heap is a rebuildable cache, not new durable state.
 */
export interface HeartbeatScheduler {
  schedule(userId: string, dueAt: Date): void;
  cancel(userId: string): void;
  has(userId: string): boolean;
  resync(): Promise<void>;
  /** Pop everything due `<= now` and enqueue it. Deterministic test entry; also the boot catch-up path. */
  tick(): Promise<void>;
  start(): void;
  stop(): void;
}

export function createHeartbeatScheduler(params: {
  readonly scheduleRepo: HeartbeatScheduleRepo;
  readonly enqueueHeartbeat: (userId: string) => boolean;
  readonly clock?: () => Date;
  readonly floorMs?: number;
  readonly resyncIntervalMs?: number;
  readonly logger?: Logger;
}): HeartbeatScheduler {
  const clock = params.clock ?? (() => new Date());
  const floorMs = params.floorMs ?? 60 * 60_000;
  const resyncIntervalMs = params.resyncIntervalMs ?? 30 * 60_000;
  const logger = params.logger ?? createNoopLogger();

  const heap: SchedulerClock<string> = createSchedulerClock<string>({
    onDue: async (entries) => {
      for (const entry of entries) {
        params.enqueueHeartbeat(entry.value);
      }
    },
    clock,
    logger,
  });

  let resyncTimer: NodeJS.Timeout | null = null;
  let stopped = true;
  let lifecycleVersion = 0;
  let consecutiveFailures = 0;
  const escalateAfter = 3;

  function logFailure(error: unknown): void {
    consecutiveFailures += 1;
    if (consecutiveFailures >= escalateAfter) {
      logger.error("heartbeat.tick", error, { status: "failed" });
    } else {
      logger.warn("heartbeat.tick", {
        status: "failed",
        error_type: error instanceof Error ? error.name : typeof error,
      });
    }
  }

  async function reload(shouldApply: () => boolean = () => true): Promise<boolean> {
    const users = await params.scheduleRepo.listAll();
    if (!shouldApply()) {
      return false;
    }
    const activeIds = new Set<string>();
    for (const user of users) {
      activeIds.add(user.userId);
      heap.schedule(user.userId, new Date(user.lastActivityAt.getTime() + floorMs), user.userId);
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
      consecutiveFailures = 0;
      logger.info("heartbeat.resync", { status: "ok" });
    } catch (error) {
      if (!shouldApply()) {
        return;
      }
      logFailure(error);
    }
  }

  return {
    schedule(userId, dueAt) {
      heap.schedule(userId, dueAt, userId);
    },
    cancel(userId) {
      heap.cancel(userId);
    },
    has(userId) {
      return heap.has(userId);
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
        logger.info("heartbeat.scheduler_started", { status: "ok" });
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
          logFailure(error);
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
