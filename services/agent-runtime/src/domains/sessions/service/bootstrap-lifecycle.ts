import type {
  BootstrapLifecycle,
  BootstrapLifecycleRepo,
  BootstrapSqlQuery,
  BootstrapTurn,
} from "../types/bootstrap.js";

const NO_BOOTSTRAP: BootstrapTurn = {
  firstRun: false,
  transitionOnSuccessQuery: () => null,
};

export function createBootstrapLifecycle(repo: BootstrapLifecycleRepo): BootstrapLifecycle {
  return {
    async prepareOpening(userId) {
      const status = await repo.readStatus(userId);
      if (status === "completed") {
        return NO_BOOTSTRAP;
      }
      return {
        firstRun: true,
        transitionOnSuccessQuery:
          status === "pending" ? () => repo.markInProgressQuery(userId) : noTransition,
      };
    },

    async prepareInteractive(userId, eligible) {
      if (!eligible) {
        return NO_BOOTSTRAP;
      }
      const status = await repo.readStatus(userId);
      if (status !== "in_progress") {
        return NO_BOOTSTRAP;
      }
      return {
        firstRun: true,
        transitionOnSuccessQuery: () => repo.markCompletedQuery(userId),
      };
    },
  };
}

function noTransition(): BootstrapSqlQuery | null {
  return null;
}
