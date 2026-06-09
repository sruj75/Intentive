export interface UserQueue {
  /**
   * Run `task` after all earlier tasks for `userId` have settled. Tasks for
   * other users run independently.
   */
  submit<T>(userId: string, task: () => Promise<T> | T): Promise<T>;
}

export function createUserQueue(): UserQueue {
  const chains = new Map<string, Promise<unknown>>();

  return {
    submit(userId, task) {
      const previous = chains.get(userId) ?? Promise.resolve();
      const run = previous.catch(() => undefined).then(task);
      chains.set(userId, run);

      void run
        .finally(() => {
          if (chains.get(userId) === run) {
            chains.delete(userId);
          }
        })
        .catch(() => undefined);

      return run;
    },
  };
}
