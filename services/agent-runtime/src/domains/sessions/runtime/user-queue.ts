import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger } from "@intentive/providers/telemetry";

export interface UserQueue {
  /**
   * Run `task` after all earlier committed tasks for `userId` have settled.
   * Tasks for other users run independently.
   */
  submit<T>(userId: string, task: () => Promise<T> | T): Promise<T>;

  /**
   * Queue one collapsible best-effort task for `userId`. Returns false when a
   * best-effort task is already pending or running for that user.
   */
  tryBestEffort(userId: string, task: () => Promise<void> | void): boolean;
}

export function createUserQueue(
  params: {
    readonly logger?: Logger;
    readonly clock?: () => number;
  } = {},
): UserQueue {
  const states = new Map<string, UserQueueState>();
  const logger = params.logger ?? createNoopLogger();
  const clock = params.clock ?? Date.now;

  return {
    submit(userId, task) {
      const state = stateFor(states, userId);
      const enqueuedAt = clock();
      return new Promise((resolve, reject) => {
        state.committed.push(async () => {
          const startedAt = clock();
          try {
            resolve(await task());
            logger.info("queue.task_done", {
              user_id: userId,
              status: "ok",
              queue_latency_ms: startedAt - enqueuedAt,
              duration_ms: clock() - startedAt,
            });
          } catch (error) {
            logger.error("queue.task_done", error, {
              user_id: userId,
              status: "failed",
              queue_latency_ms: startedAt - enqueuedAt,
              duration_ms: clock() - startedAt,
            });
            reject(error);
          }
        });
        drain(states, userId, state, logger);
      });
    },

    tryBestEffort(userId, task) {
      const state = stateFor(states, userId);
      if (state.bestEffort || state.bestEffortRunning) {
        return false;
      }
      const enqueuedAt = clock();
      state.bestEffort = async () => {
        const startedAt = clock();
        await task();
        logger.info("queue.task_done", {
          user_id: userId,
          status: "ok",
          queue_latency_ms: startedAt - enqueuedAt,
          duration_ms: clock() - startedAt,
        });
      };
      drain(states, userId, state, logger);
      return true;
    },
  };
}

interface UserQueueState {
  running: boolean;
  bestEffortRunning: boolean;
  committed: Array<() => Promise<void>>;
  bestEffort: (() => Promise<void> | void) | null;
}

function stateFor(states: Map<string, UserQueueState>, userId: string): UserQueueState {
  const existing = states.get(userId);
  if (existing) {
    return existing;
  }
  const created: UserQueueState = {
    running: false,
    bestEffortRunning: false,
    committed: [],
    bestEffort: null,
  };
  states.set(userId, created);
  return created;
}

function drain(
  states: Map<string, UserQueueState>,
  userId: string,
  state: UserQueueState,
  logger: Logger,
): void {
  if (state.running) {
    return;
  }
  state.running = true;
  void runLoop(states, userId, state, logger);
}

async function runLoop(
  states: Map<string, UserQueueState>,
  userId: string,
  state: UserQueueState,
  logger: Logger,
): Promise<void> {
  while (state.committed.length > 0 || state.bestEffort) {
    const committed = state.committed.shift();
    if (committed) {
      await committed();
      continue;
    }

    const bestEffort = state.bestEffort;
    state.bestEffort = null;
    state.bestEffortRunning = true;
    try {
      await bestEffort?.();
    } catch (error) {
      logger.error("queue.task_done", error, { user_id: userId, status: "failed" });
    } finally {
      state.bestEffortRunning = false;
    }
  }

  state.running = false;
  if (state.committed.length > 0 || state.bestEffort) {
    drain(states, userId, state, logger);
    return;
  }
  states.delete(userId);
}
