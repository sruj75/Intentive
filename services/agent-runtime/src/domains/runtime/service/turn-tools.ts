import type { RuntimeTurnInput } from "../types/turn.js";

type TurnToolInput = Pick<
  RuntimeTurnInput,
  "trigger" | "windowId" | "evidenceVersion" | "evidenceCursorStart" | "evidenceCursorEnd"
>;

export function createToolsForTurn<T>(
  input: TurnToolInput,
  factories: {
    readonly ordinaryEgress: () => T;
    readonly coachingEgress: () => T;
    readonly screenContext: () => T;
  },
): T[] {
  if (input.trigger === "opening_orientation") {
    return [];
  }

  if (input.trigger === "heartbeat" || input.trigger === "perception_event") {
    const coachingBounds = [
      input.windowId,
      input.evidenceVersion,
      input.evidenceCursorStart,
      input.evidenceCursorEnd,
    ];
    const hasAnyCoachingBound = coachingBounds.some((value) => value !== undefined);
    const hasEveryCoachingBound = coachingBounds.every((value) => value !== undefined);
    if (hasAnyCoachingBound) {
      return hasEveryCoachingBound ? [factories.coachingEgress()] : [];
    }
  }

  return [factories.ordinaryEgress(), factories.screenContext()];
}
