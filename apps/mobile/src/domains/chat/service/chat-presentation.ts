import type { AccountState } from "@intentive/api-contract";

import type { AgentState, AgentStateOverride, RuntimeAdapterState } from "../types/conversation.js";

export type ProtectedOpeningStatus = "inactive" | "pending" | "failed";
export type PresentedAgentStateKind = AgentState | AgentStateOverride;

export const MAC_SETUP_BANNER_COPY = "Add Intentive on Mac for richer context";

export interface ChatPresentationOptions {
  readonly agentStateOverride?: AgentStateOverride;
  readonly accountState?: AccountState | null;
  readonly macSetupBannerDismissed?: boolean;
}

export interface PresentedAgentState {
  readonly kind: PresentedAgentStateKind;
  readonly label: string;
}

export interface ContinuityEvent {
  readonly id: string;
  readonly copy: string;
}

export interface ChatPresentation {
  readonly protectedOpening: {
    readonly status: ProtectedOpeningStatus;
  };
  readonly agentState: PresentedAgentState;
  readonly continuityEvents: readonly ContinuityEvent[];
  readonly macSetupBanner: {
    readonly visible: boolean;
    readonly copy: string;
  };
  readonly canSend: boolean;
  readonly openingRecoveryCopy: string;
  readonly waitingToStartCopy: string;
}

export function deriveChatPresentation(
  state: RuntimeAdapterState,
  options: ChatPresentationOptions = {},
): ChatPresentation {
  const protectedOpeningStatus = deriveProtectedOpeningStatus(state);

  return {
    protectedOpening: {
      status: protectedOpeningStatus,
    },
    agentState: presentAgentState(options.agentStateOverride ?? state.agentState),
    continuityEvents: deriveContinuityEvents(state),
    macSetupBanner: deriveMacSetupBanner(options.accountState, options.macSetupBannerDismissed),
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

function presentAgentState(kind: PresentedAgentStateKind): PresentedAgentState {
  switch (kind) {
    case "available":
      return { kind, label: "Available" };
    case "thinking":
      return { kind, label: "Thinking" };
    case "following_up":
      return { kind, label: "Following up" };
    case "paused":
      return { kind, label: "Paused" };
  }
}

function deriveContinuityEvents(state: RuntimeAdapterState): readonly ContinuityEvent[] {
  const latest = state.messages[state.messages.length - 1];
  if (latest?.author !== "companion" || !latest.viaPostMessageBack) return [];

  return [
    {
      id: `post-message-back-${latest.id}`,
      copy: "Follow-up from your Companion",
    },
  ];
}

function deriveMacSetupBanner(
  accountState: AccountState | null | undefined,
  dismissed: boolean | undefined,
): ChatPresentation["macSetupBanner"] {
  if (dismissed === true || accountState?.has_desktop_client !== false) {
    return { visible: false, copy: MAC_SETUP_BANNER_COPY };
  }
  return { visible: true, copy: MAC_SETUP_BANNER_COPY };
}
