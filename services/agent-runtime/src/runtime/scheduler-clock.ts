import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger } from "@intentive/providers/telemetry";

/**
 * An in-memory min-ordered wake clock: one sorted set of due entries plus a
 * single live `setTimeout` always aimed at the earliest due instant. This is the
 * shared wake mechanism for the Cron and Heartbeat schedulers (ADR-0035),
 * replacing their per-domain 60s poll loops. Neon stays the durable source of
 * truth; this structure is a rebuildable cache, repopulated from Neon on boot
 * and kept current via write-path hooks (post-commit), with a coarse periodic
 * resync as a safety net.
 *
 * Lives at the top-level `src/runtime/` seam (alongside `shutdown.ts`) because it
 * is shared across the `cron` and `heartbeat` domains. The architecture
 * layer-direction rule does not apply to non-`domains/` paths, so both domain
 * `runtime/` layers may import it without a cross-domain violation.
 */
export interface SchedulerClockEntry<T> {
  readonly key: string;
  readonly dueAt: Date;
  readonly value: T;
}

export interface SchedulerClock<T> {
  schedule(key: string, dueAt: Date, value: T): void;
  cancel(key: string): void;
  has(key: string): boolean;
  size(): number;
  keys(): readonly string[];
  nextDueAt(): Date | null;
  start(): void;
  stop(): void;
  /** Pop everything due `<= now` and invoke `onDue`. Callable before/after `start`. */
  flushDue(): Promise<void>;
}

interface ClockNode<T> {
  dueAt: number; // epoch ms — mutable so re-scheduling the same key is O(1)
  value: T;
  seq: number; // insertion order, stable tiebreaker so the min scan is deterministic
}

export function createSchedulerClock<T>(params: {
  readonly onDue: (entries: readonly SchedulerClockEntry<T>[]) => Promise<void>;
  readonly clock?: () => Date;
  readonly logger?: Logger;
}): SchedulerClock<T> {
  const clock = params.clock ?? (() => new Date());
  const logger = params.logger ?? createNoopLogger();
  const entries = new Map<string, ClockNode<T>>();
  let seq = 0;
  let timer: NodeJS.Timeout | null = null;
  let stopped = true;
  let firing = false;

  function earliest(): ClockNode<T> | null {
    let min: ClockNode<T> | null = null;
    for (const node of entries.values()) {
      if (
        min === null ||
        node.dueAt < min.dueAt ||
        (node.dueAt === min.dueAt && node.seq < min.seq)
      ) {
        min = node;
      }
    }
    return min;
  }

  function rearm(): void {
    if (stopped || firing) {
      return;
    }
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const min = earliest();
    if (min === null) {
      return;
    }
    const delay = Math.max(0, min.dueAt - clock().getTime());
    timer = setTimeout(() => {
      if (stopped) {
        return;
      }
      void fire();
    }, delay);
  }

  async function fire(): Promise<void> {
    if (firing) {
      return;
    }
    firing = true;
    try {
      const now = clock().getTime();
      const due: SchedulerClockEntry<T>[] = [];
      for (const [key, node] of entries) {
        if (node.dueAt <= now) {
          due.push({ key, dueAt: new Date(node.dueAt), value: node.value });
        }
      }
      for (const entry of due) {
        entries.delete(entry.key);
      }
      if (due.length > 0) {
        await params.onDue(due);
      }
    } catch (error) {
      logger.error("scheduler_clock.fire", error, { status: "failed" });
    } finally {
      firing = false;
      rearm();
    }
  }

  return {
    schedule(key, dueAt, value) {
      entries.set(key, { dueAt: dueAt.getTime(), value, seq: seq++ });
      rearm();
    },
    cancel(key) {
      entries.delete(key);
      rearm();
    },
    has(key) {
      return entries.has(key);
    },
    size() {
      return entries.size;
    },
    keys() {
      return [...entries.keys()];
    },
    nextDueAt() {
      const min = earliest();
      return min === null ? null : new Date(min.dueAt);
    },
    start() {
      if (!stopped) {
        return;
      }
      stopped = false;
      rearm();
    },
    stop() {
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
    flushDue: fire,
  };
}
