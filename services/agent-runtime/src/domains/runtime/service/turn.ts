import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger } from "@intentive/providers/telemetry";

import type { TransactionalSql } from "../repo/sql.js";
import type { DeepAgentsAdapter, Turn, TurnExecution } from "../types/turn.js";
import type { WorkingContext } from "./working-context.js";

export function createTurn(deps: {
  readonly sql: Pick<TransactionalSql, "transaction">;
  readonly adapter: Pick<DeepAgentsAdapter, "invoke">;
  readonly workingContext: WorkingContext;
  readonly logger?: Logger;
  readonly clock?: () => number;
}): Turn {
  const logger = deps.logger ?? createNoopLogger();
  const clock = deps.clock ?? Date.now;
  return async (execution) => {
    const startedAt = clock();
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
      logger.info("turn.completed", {
        user_id: execution.userId,
        thread_id: execution.threadId,
        trace_id: output.traceId,
        trigger: execution.trigger,
        model: output.model,
        bundle_version: output.bundleVersion,
        status: "ok",
        duration_ms: clock() - startedAt,
      });
    } catch (error) {
      const failure = execution.onFailure(error);
      await deps.sql.transaction(failure.queries);
      logger.error("turn.failed", error, {
        user_id: execution.userId,
        thread_id: execution.threadId,
        trigger: execution.trigger,
        status: "failed",
        duration_ms: clock() - startedAt,
      });
      if (failure.rethrow) {
        throw error;
      }
    }
  };
}
