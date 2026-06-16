import type { ProcedureFloorResolver } from "../../bundles/types/floor.js";
import type { RuntimeTurnsRepo } from "../repo/runtime-turns.js";
import type { TransactionalSql } from "../repo/sql.js";
import type { RuntimeTurnRecord, Turn } from "../types/turn.js";

export type MonitoringTurnTrigger = "heartbeat" | "context_snapshot";

export function createMonitoringTurn(params: {
  readonly sql: Pick<TransactionalSql, "transaction">;
  readonly floorResolver: ProcedureFloorResolver;
  readonly runtimeTurns: RuntimeTurnsRepo;
  readonly fallbackModel: string;
  readonly turn: Turn;
}): (userId: string, trigger: MonitoringTurnTrigger) => Promise<void> {
  return async (userId, trigger) => {
    const threadId = userId;
    try {
      const floor = await params.floorResolver.resolve("production");
      await params.turn({
        userId,
        threadId,
        body: `Run a Monitoring Turn for ${trigger}. Decide whether to stay silent or call post_message_back.`,
        trigger,
        floor,
        onSuccess: (output) => [
          params.runtimeTurns.recordQuery({
            userId,
            threadId,
            traceId: output.traceId,
            model: output.model,
            bundleVersion: output.bundleVersion,
            status: "ok",
            error: null,
          }),
        ],
        onFailure: (error) => ({
          queries: [
            params.runtimeTurns.recordQuery(
              failedTurnRecord(userId, threadId, params.fallbackModel, error),
            ),
          ],
          rethrow: false,
        }),
      });
    } catch (error) {
      await params.sql.transaction([
        params.runtimeTurns.recordQuery(
          failedTurnRecord(userId, threadId, params.fallbackModel, error),
        ),
      ]);
    }
  };
}

function failedTurnRecord(
  userId: string,
  threadId: string,
  model: string,
  error: unknown,
): RuntimeTurnRecord {
  return {
    userId,
    threadId,
    traceId: null,
    model,
    bundleVersion: null,
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
  };
}
