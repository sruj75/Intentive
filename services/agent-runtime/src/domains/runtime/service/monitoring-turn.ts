import type { PinnedProcedureFloor } from "../../bundles/types/floor.js";
import type { Turn, TurnSqlQuery } from "../types/turn.js";

export type MonitoringTurnTrigger = "heartbeat" | "perception_event";

export interface MonitoringTurnContext {
  readonly windowId: string;
  readonly floor: PinnedProcedureFloor;
  readonly evidence: {
    readonly cursorStart: number;
    readonly cursorEnd: number;
    readonly version: string;
    readonly rendered: string;
  };
  readonly beforeCommit: () => Promise<boolean>;
  readonly onSuccessQueries: () => TurnSqlQuery[];
  readonly onFailureQueries: () => TurnSqlQuery[];
}

export function createMonitoringTurn(params: {
  readonly turn: Turn;
}): (
  userId: string,
  trigger: MonitoringTurnTrigger,
  context: MonitoringTurnContext,
) => Promise<boolean> {
  return async (userId, trigger, context) => {
    const threadId = userId;
    const output = await params.turn({
      userId,
      threadId,
      body: `Run a Monitoring Turn for ${trigger}. Decide whether to stay silent or call post_message_back.`,
      trigger,
      windowId: context.windowId,
      recentPerception: context.evidence.rendered,
      evidenceCursorStart: context.evidence.cursorStart,
      evidenceCursorEnd: context.evidence.cursorEnd,
      evidenceVersion: context.evidence.version,
      beforeCommit: context.beforeCommit,
      // Coaching behavior is pinned by the matching authenticated Desktop
      // connection. Only reconnect may replace this resolved floor.
      floor: () => Promise.resolve(context.floor),
      onSuccess: () => context.onSuccessQueries(),
      onFailure: () => ({
        queries: context.onFailureQueries(),
        rethrow: false,
      }),
    });
    return output !== null;
  };
}
