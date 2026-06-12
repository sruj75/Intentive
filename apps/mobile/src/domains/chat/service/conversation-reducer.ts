import type { AgentState, ConversationMessage, MessageStoreState } from "../types/conversation.js";

export type ConversationEvent =
  | {
      readonly type: "snapshot";
      readonly messages: readonly RuntimeSnapshotMessage[];
      readonly beforeCursor: string | null;
    }
  | {
      readonly type: "companion_message";
      readonly messageId: string;
      readonly body: string;
      readonly emittedAt: string;
      readonly viaPostMessageBack: boolean;
    }
  | {
      readonly type: "send_user_message";
      readonly messageId: string;
      readonly body: string;
      readonly sentAt: string;
    }
  | { readonly type: "mark_pending_failed" };

export interface RuntimeSnapshotMessage {
  readonly message_id: string;
  readonly author: "user" | "companion";
  readonly body: string;
  readonly at: string;
  readonly via_post_message_back: boolean;
}

export const EMPTY_MESSAGE_STORE: MessageStoreState = {
  messages: [],
  beforeCursor: null,
  agentState: "available",
};

export function reduceConversationState(
  state: MessageStoreState,
  event: ConversationEvent,
): MessageStoreState {
  switch (event.type) {
    case "snapshot": {
      const messages = event.messages.reduce(
        (next, message) => upsertMessage(next, fromSnapshotMessage(message)),
        state.messages,
      );
      return {
        messages,
        beforeCursor: event.beforeCursor,
        agentState: deriveAgentState(messages, state.agentState),
      };
    }
    case "companion_message": {
      const messages = upsertMessage(state.messages, {
        id: event.messageId,
        author: "companion",
        body: event.body,
        at: event.emittedAt,
        viaPostMessageBack: event.viaPostMessageBack,
      });
      return { ...state, messages, agentState: "available" };
    }
    case "send_user_message": {
      const messages = upsertMessage(state.messages, {
        id: event.messageId,
        author: "user",
        body: event.body,
        at: event.sentAt,
        viaPostMessageBack: false,
        delivery: "pending",
      });
      return { ...state, messages, agentState: "thinking" };
    }
    case "mark_pending_failed": {
      const messages = state.messages.map((message) =>
        message.author === "user" && message.delivery === "pending"
          ? { ...message, delivery: "failed" as const }
          : message,
      );
      return { ...state, messages, agentState: "available" };
    }
  }
}

function fromSnapshotMessage(message: RuntimeSnapshotMessage): ConversationMessage {
  return {
    id: message.message_id,
    author: message.author === "companion" ? "companion" : "user",
    body: message.body,
    at: message.at,
    viaPostMessageBack: message.via_post_message_back,
    ...(message.author === "user" ? { delivery: "confirmed" as const } : {}),
  };
}

function upsertMessage(
  messages: readonly ConversationMessage[],
  incoming: ConversationMessage,
): readonly ConversationMessage[] {
  const index = messages.findIndex((message) => message.id === incoming.id);
  if (index === -1) return [...messages, incoming];

  const current = messages[index];
  if (!current) return [...messages, incoming];
  const next = reconcileMessage(current, incoming);
  if (current === next) return messages;

  return messages.map((message, messageIndex) => (messageIndex === index ? next : message));
}

function reconcileMessage(
  current: ConversationMessage,
  incoming: ConversationMessage,
): ConversationMessage {
  if (current.author !== incoming.author) return incoming;
  if (current.author === "user") {
    return {
      ...incoming,
      delivery:
        incoming.delivery === "confirmed" || current.delivery === "confirmed"
          ? "confirmed"
          : (current.delivery ?? incoming.delivery),
    };
  }
  return incoming;
}

function deriveAgentState(
  messages: readonly ConversationMessage[],
  previousAgentState: AgentState,
): AgentState {
  if (previousAgentState !== "thinking") return "available";
  const hasPendingOutbound = messages.some(
    (message) => message.author === "user" && message.delivery === "pending",
  );
  return hasPendingOutbound ? "thinking" : "available";
}
