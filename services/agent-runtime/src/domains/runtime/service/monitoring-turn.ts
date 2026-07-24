import type { ProcedureFloorResolver } from "../../bundles/types/floor.js";
import type { Turn } from "../types/turn.js";

export type MonitoringTurnTrigger = "heartbeat" | "context_snapshot";

export function createMonitoringTurn(params: {
  readonly floorResolver: ProcedureFloorResolver;
  readonly turn: Turn;
}): (userId: string, trigger: MonitoringTurnTrigger) => Promise<void> {
  return async (userId, trigger) => {
    const threadId = userId;
    await params.turn({
      userId,
      threadId,
      body: `Run a Monitoring Turn for ${trigger}. Decide whether to stay silent or call post_message_back.`,
      trigger,
      // Floor resolution flows through the spine's failure path, so a resolution
      // failure records exactly one `runtime_turns(failed)` row.
      floor: () => params.floorResolver.resolve("production"),
      onSuccess: () => [],
      onFailure: () => ({ queries: [], rethrow: false }),
    });
  };
}
