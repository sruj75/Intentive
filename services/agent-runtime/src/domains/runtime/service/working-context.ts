import type { PinnedProcedureFloor, TurnTrigger } from "../../bundles/types/floor.js";
import type { RuntimeTurnInput } from "../types/turn.js";

export interface WorkingContextInput {
  readonly userId: string;
  readonly threadId: string;
  readonly body: string;
  readonly trigger: TurnTrigger;
  readonly floor: PinnedProcedureFloor;
  readonly recentPerception?: string | null;
  readonly windowId?: string;
  readonly evidenceCursorStart?: number;
  readonly evidenceCursorEnd?: number;
  readonly evidenceVersion?: string;
  readonly firstRun?: boolean;
}

export type WorkingContext = (input: WorkingContextInput) => Promise<RuntimeTurnInput>;

export function createWorkingContext(deps: {
  readonly readUserProfile: (userId: string) => Promise<string>;
  readonly readRecentPerception?: (userId: string) => Promise<string | null>;
}): WorkingContext {
  return async (input) => {
    const hasFixedPerception = input.recentPerception !== undefined;
    const [userProfile, recentPerception] = await Promise.all([
      deps.readUserProfile(input.userId),
      hasFixedPerception
        ? Promise.resolve(input.recentPerception)
        : deps.readRecentPerception?.(input.userId),
    ]);

    return {
      userId: input.userId,
      threadId: input.threadId,
      body: input.body,
      trigger: input.trigger,
      pinnedFloor: input.floor,
      userProfile,
      ...(hasFixedPerception || deps.readRecentPerception ? { recentPerception } : {}),
      ...(input.windowId !== undefined ? { windowId: input.windowId } : {}),
      ...(input.evidenceCursorStart !== undefined
        ? { evidenceCursorStart: input.evidenceCursorStart }
        : {}),
      ...(input.evidenceCursorEnd !== undefined
        ? { evidenceCursorEnd: input.evidenceCursorEnd }
        : {}),
      ...(input.evidenceVersion !== undefined ? { evidenceVersion: input.evidenceVersion } : {}),
      ...(input.firstRun !== undefined ? { firstRun: input.firstRun } : {}),
    };
  };
}
