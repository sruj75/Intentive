import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger } from "@intentive/providers/telemetry";

import type { RuntimeTurnsRepo } from "../repo/runtime-turns.js";
import type { TransactionalSql } from "../repo/sql.js";
import type {
  DeepAgentsAdapter,
  RuntimeTurnErrorType,
  RuntimeTurnOutput,
  RuntimeTurnRecord,
  Turn,
  TurnExecution,
} from "../types/turn.js";
import { createTurnEffectGuard } from "./turn-effect-guard.js";
import type { WorkingContext } from "./working-context.js";

/**
 * The Turn Execution spine. It owns what is universal to every turn: resolving
 * the pinned floor, content-free error classification, and recording **exactly one**
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
  /**
   * Invoked after the `runtime_turns` anchor transaction commits, on both the ok
   * and failed paths (both record an anchor that updates last-activity). Pushes
   * the heartbeat scheduler's per-user due-time onto the write side instead of
   * recomputing it on every poll (ADR-0035). Composition-root wired; the spine
   * stays heartbeat-agnostic.
   */
  readonly onTurnCommitted?: (userId: string) => void;
}): Turn {
  const logger = deps.logger ?? createNoopLogger();
  const clock = deps.clock ?? Date.now;
  return async (execution) => {
    const startedAt = clock();
    try {
      const floor = await execution.floor();
      const workingInput = await deps.workingContext({
        userId: execution.userId,
        threadId: execution.threadId,
        body: execution.body,
        trigger: execution.trigger,
        floor,
        ...(execution.recentPerception !== undefined
          ? { recentPerception: execution.recentPerception }
          : {}),
        ...(execution.windowId !== undefined ? { windowId: execution.windowId } : {}),
        ...(execution.evidenceCursorStart !== undefined
          ? { evidenceCursorStart: execution.evidenceCursorStart }
          : {}),
        ...(execution.evidenceCursorEnd !== undefined
          ? { evidenceCursorEnd: execution.evidenceCursorEnd }
          : {}),
        ...(execution.evidenceVersion !== undefined
          ? { evidenceVersion: execution.evidenceVersion }
          : {}),
        ...(execution.firstRun !== undefined ? { firstRun: execution.firstRun } : {}),
      });
      const effects = createTurnEffectGuard();
      const input = { ...workingInput, effects };
      const output = await deps.adapter.invoke(input);
      // DeepAgents' ToolNode handles thrown tool errors by default. A failed
      // externally visible side effect must still make this shell turn fail so
      // its evidence cursor cannot advance.
      effects.assertSucceeded();
      if (execution.beforeCommit && !(await execution.beforeCommit())) {
        throw new Error("Turn commit suppressed because its coaching window is no longer active");
      }
      await deps.sql.transaction([
        ...execution.onSuccess(output),
        deps.runtimeTurns.recordQuery(okRecord(execution, output)),
      ]);
      deps.onTurnCommitted?.(execution.userId);
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
      return output;
    } catch (error) {
      const failure = execution.onFailure(error);
      await deps.sql.transaction([
        ...failure.queries,
        deps.runtimeTurns.recordQuery(failedTurnRecord(execution, deps.fallbackModel, error)),
      ]);
      deps.onTurnCommitted?.(execution.userId);
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
      return null;
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
    windowId: execution.windowId ?? null,
    trigger: execution.trigger,
    evidenceCursorStart: execution.evidenceCursorStart ?? null,
    evidenceCursorEnd: execution.evidenceCursorEnd ?? null,
    evidenceVersion: execution.evidenceVersion ?? null,
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
    windowId: execution.windowId ?? null,
    trigger: execution.trigger,
    evidenceCursorStart: execution.evidenceCursorStart ?? null,
    evidenceCursorEnd: execution.evidenceCursorEnd ?? null,
    evidenceVersion: execution.evidenceVersion ?? null,
    status: "failed",
    error: classifyRuntimeTurnError(error),
  };
}

/**
 * Returns only a fixed operational type. Never persist Error.message, .code,
 * .cause, stack frames, or an arbitrary custom .name: any of those can contain
 * rendered OCR/audio evidence or prompt content.
 */
function classifyRuntimeTurnError(error: unknown): RuntimeTurnErrorType {
  if (!(error instanceof Error)) {
    return "UnknownThrownValue";
  }

  if (error instanceof AggregateError) return "AggregateError";
  if (error instanceof EvalError) return "EvalError";
  if (error instanceof RangeError) return "RangeError";
  if (error instanceof ReferenceError) return "ReferenceError";
  if (error instanceof SyntaxError) return "SyntaxError";
  if (error instanceof TypeError) return "TypeError";
  if (error instanceof URIError) return "URIError";

  try {
    if (error.name === "AbortError" || error.name === "RuntimeModelResponseError") {
      return error.name;
    }
  } catch {
    // A custom getter must not prevent the failure anchor from being recorded.
  }

  return "Error";
}
