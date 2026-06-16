import type { TransactionalSql } from "../repo/sql.js";
import type { DeepAgentsAdapter, Turn, TurnExecution } from "../types/turn.js";
import type { WorkingContext } from "./working-context.js";

export function createTurn(deps: {
  readonly sql: Pick<TransactionalSql, "transaction">;
  readonly adapter: Pick<DeepAgentsAdapter, "invoke">;
  readonly workingContext: WorkingContext;
}): Turn {
  return async (execution) => {
    try {
      const input = await deps.workingContext({
        userId: execution.userId,
        threadId: execution.threadId,
        body: execution.body,
        trigger: execution.trigger,
        floor: execution.floor,
        ...(execution.firstRun !== undefined ? { firstRun: execution.firstRun } : {}),
      });
      const output = await deps.adapter.invoke(input);
      await deps.sql.transaction(execution.onSuccess(output));
    } catch (error) {
      const failure = execution.onFailure(error);
      await deps.sql.transaction(failure.queries);
      if (failure.rethrow) {
        throw error;
      }
    }
  };
}
