import type { RuntimeAdapterState } from "../types/conversation.js";

export type ProtectedOpeningStatus = "inactive" | "pending" | "failed";

export interface ChatPresentation {
  readonly protectedOpening: {
    readonly status: ProtectedOpeningStatus;
  };
  readonly canSend: boolean;
  readonly openingRecoveryCopy: string;
  readonly waitingToStartCopy: string;
}

export function deriveChatPresentation(state: RuntimeAdapterState): ChatPresentation {
  const protectedOpeningStatus = deriveProtectedOpeningStatus(state);

  return {
    protectedOpening: {
      status: protectedOpeningStatus,
    },
    canSend: protectedOpeningStatus === "inactive" && state.connectionState !== "error",
    openingRecoveryCopy: "I couldn't start the conversation.",
    waitingToStartCopy: "Waiting for the Companion to start.",
  };
}

function deriveProtectedOpeningStatus(state: RuntimeAdapterState): ProtectedOpeningStatus {
  if (state.messages.length > 0) return "inactive";
  if (state.connectionState === "error" || state.error !== null) return "failed";
  return "pending";
}
