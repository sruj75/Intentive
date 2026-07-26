import type { TurnEffectGuard } from "../types/turn.js";

export function createTurnEffectGuard(): TurnEffectGuard {
  let failure: unknown;
  return {
    fail(error) {
      failure ??= error;
    },
    assertSucceeded() {
      if (failure !== undefined) {
        throw failure instanceof Error ? failure : new Error(String(failure));
      }
    },
  };
}
