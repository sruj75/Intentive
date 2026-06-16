import type { PinnedProcedureFloor, TurnTrigger } from "../../bundles/types/floor.js";
import type { RuntimeTurnInput } from "../types/turn.js";

export interface WorkingContextInput {
  readonly userId: string;
  readonly threadId: string;
  readonly body: string;
  readonly trigger: TurnTrigger;
  readonly floor: PinnedProcedureFloor;
  readonly firstRun?: boolean;
}

export type WorkingContext = (input: WorkingContextInput) => Promise<RuntimeTurnInput>;

export function createWorkingContext(deps: {
  readonly readUserProfile: (userId: string) => Promise<string>;
  readonly readRecentPerception?: (userId: string) => Promise<string | null>;
}): WorkingContext {
  return async (input) => {
    const [userProfile, recentPerception] = await Promise.all([
      deps.readUserProfile(input.userId),
      deps.readRecentPerception?.(input.userId),
    ]);

    return {
      userId: input.userId,
      threadId: input.threadId,
      body: input.body,
      trigger: input.trigger,
      pinnedFloor: input.floor,
      userProfile,
      ...(deps.readRecentPerception ? { recentPerception } : {}),
      ...(input.firstRun !== undefined ? { firstRun: input.firstRun } : {}),
    };
  };
}
