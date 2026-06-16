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

export function createUserQueue(): UserQueue {
  const states = new Map<string, UserQueueState>();

  return {
    submit(userId, task) {
      const state = stateFor(states, userId);
      return new Promise((resolve, reject) => {
        state.committed.push(async () => {
          try {
            resolve(await task());
          } catch (error) {
            reject(error);
          }
        });
        drain(states, userId, state);
      });
    },

    tryBestEffort(userId, task) {
      const state = stateFor(states, userId);
      if (state.bestEffort || state.bestEffortRunning) {
        return false;
      }
      state.bestEffort = task;
      drain(states, userId, state);
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

function drain(states: Map<string, UserQueueState>, userId: string, state: UserQueueState): void {
  if (state.running) {
    return;
  }
  state.running = true;
  void runLoop(states, userId, state);
}

async function runLoop(
  states: Map<string, UserQueueState>,
  userId: string,
  state: UserQueueState,
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
      console.error("Best-effort user task failed", { userId, error });
    } finally {
      state.bestEffortRunning = false;
    }
  }

  state.running = false;
  if (state.committed.length > 0 || state.bestEffort) {
    drain(states, userId, state);
    return;
  }
  states.delete(userId);
}
