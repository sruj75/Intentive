import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger, errorMessage } from "@intentive/providers/telemetry";

import type { RuntimeTurnsRepo } from "../repo/runtime-turns.js";
import type { TransactionalSql } from "../repo/sql.js";
import type {
  DeepAgentsAdapter,
  RuntimeTurnOutput,
  RuntimeTurnRecord,
  Turn,
  TurnExecution,
} from "../types/turn.js";
import type { WorkingContext } from "./working-context.js";

/**
 * The Turn Execution spine. It owns what is universal to every turn: resolving
 * the pinned floor, error stringification, and recording **exactly one**
 * `runtime_turns` anchor per turn (ok or failed), in the same transaction as the
 * caller's trigger-specific rows. Callers supply only their trigger-specific
 * durable rows via `onSuccess`/`onFailure`.
 */
export function createTurn(deps: {
  readonly sql: Pick<TransactionalSql, "transaction">;
  readonly adapter: Pick<DeepAgentsAdapter, "invoke">;
  readonly workingContext: WorkingContext;
  readonly runtimeTurns: RuntimeTurnsRepo;
  readonly fallbackModel: string;
  readonly logger?: Logger;
  readonly clock?: () => number;
}): Turn {
  const logger = deps.logger ?? createNoopLogger();
  const clock = deps.clock ?? Date.now;
  return async (execution) => {
    const startedAt = clock();
    try {
      const floor = await execution.floor();
      const input = await deps.workingContext({
        userId: execution.userId,
        threadId: execution.threadId,
        body: execution.body,
        trigger: execution.trigger,
        floor,
        ...(execution.firstRun !== undefined ? { firstRun: execution.firstRun } : {}),
      });
      const output = await deps.adapter.invoke(input);
      await deps.sql.transaction([
        ...execution.onSuccess(output),
        deps.runtimeTurns.recordQuery(okRecord(execution, output)),
      ]);
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
      await deps.sql.transaction([
        ...failure.queries,
        deps.runtimeTurns.recordQuery(failedTurnRecord(execution, deps.fallbackModel, error)),
      ]);
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

function okRecord(execution: TurnExecution, output: RuntimeTurnOutput): RuntimeTurnRecord {
  return {
    userId: execution.userId,
    threadId: execution.threadId,
    traceId: output.traceId,
    model: output.model,
    bundleVersion: output.bundleVersion,
    status: "ok",
    error: null,
  };
}

function failedTurnRecord(
  execution: TurnExecution,
  model: string,
  error: unknown,
): RuntimeTurnRecord {
  return {
    userId: execution.userId,
    threadId: execution.threadId,
    traceId: null,
    model,
    bundleVersion: null,
    status: "failed",
    error: errorMessage(error),
  };
}
