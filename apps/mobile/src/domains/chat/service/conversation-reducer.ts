import type { AgentState, ConversationMessage, MessageStoreState } from "../types/conversation.js";

export type ConversationEvent =
  | {
      readonly type: "reconnect_snapshot";
      readonly messages: readonly RuntimeSnapshotMessage[];
      readonly beforeCursor: string | null;
    }
  | {
      readonly type: "history_backfill";
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
  | {
      readonly type: "retry_failed_user_message";
      readonly messageId: string;
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
    case "reconnect_snapshot": {
      const messages = mergeServerPage({
        currentMessages: state.messages,
        pageMessages: event.messages,
        placement: "replace_server_window",
      });
      return {
        messages,
        beforeCursor: event.beforeCursor,
        agentState: deriveAgentState(messages, state.agentState),
      };
    }
    case "history_backfill": {
      const messages = mergeServerPage({
        currentMessages: state.messages,
        pageMessages: event.messages,
        placement: "prepend",
      });
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
    case "retry_failed_user_message": {
      let retried = false;
      const messages = state.messages.map((message) => {
        if (
          message.id !== event.messageId ||
          message.author !== "user" ||
          message.delivery !== "failed"
        ) {
          return message;
        }
        retried = true;
        // Retry reuses the original idempotency key; only the local delivery
        // projection returns to pending until server truth confirms it.
        return { ...message, delivery: "pending" as const };
      });
      return retried ? { ...state, messages, agentState: "thinking" } : state;
    }
    case "mark_pending_failed": {
      let failedAny = false;
      const messages = state.messages.map((message) =>
        message.author === "user" && message.delivery === "pending"
          ? ((failedAny = true), { ...message, delivery: "failed" as const })
          : message,
      );
      return failedAny ? { ...state, messages, agentState: "available" } : state;
    }
  }
}

function mergeServerPage({
  currentMessages,
  pageMessages,
  placement,
}: {
  readonly currentMessages: readonly ConversationMessage[];
  readonly pageMessages: readonly RuntimeSnapshotMessage[];
  readonly placement: "replace_server_window" | "prepend";
}): readonly ConversationMessage[] {
  const serverMessages = dedupeServerPage(pageMessages).map((message) => {
    const incoming = fromSnapshotMessage(message);
    const current = currentMessages.find((existing) => existing.id === incoming.id);
    return current ? reconcileMessage(current, incoming) : incoming;
  });
  const serverIds = new Set(serverMessages.map((message) => message.id));

  if (placement === "prepend") {
    return [...serverMessages, ...currentMessages.filter((message) => !serverIds.has(message.id))];
  }

  return [
    ...serverMessages,
    ...currentMessages.filter(
      (message) => !serverIds.has(message.id) && isLocalOnlyOutbound(message),
    ),
  ];
}

function dedupeServerPage(
  messages: readonly RuntimeSnapshotMessage[],
): readonly RuntimeSnapshotMessage[] {
  const seen = new Set<string>();
  const deduped: RuntimeSnapshotMessage[] = [];
  for (const message of messages) {
    if (seen.has(message.message_id)) continue;
    seen.add(message.message_id);
    deduped.push(message);
  }
  return deduped;
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

function isLocalOnlyOutbound(message: ConversationMessage): boolean {
  return (
    message.author === "user" && (message.delivery === "pending" || message.delivery === "failed")
  );
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
