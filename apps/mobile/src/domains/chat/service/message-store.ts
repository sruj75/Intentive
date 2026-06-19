/**
 * Message Store — the Runtime Adapter's in-memory, server-truth projection of
 * Conversation History. It is the single stateful interface the adapter talks to
 * for messages: the adapter calls intent-named methods (`replaceServerWindow`,
 * `appendCompanionMessage`, …) instead of constructing reducer events, so the
 * merge/dedupe/Delivery-Status/Agent-State rules stay in one place.
 *
 * `conversation-reducer` remains the pure engine behind this store; nothing here
 * is persisted to disk (Conversation History is owned by the Agent Runtime).
 */
import {
  EMPTY_MESSAGE_STORE,
  reduceConversationState,
  type ConversationEvent,
  type RuntimeSnapshotMessage,
} from "./conversation-reducer.js";
import type { MessageStoreState } from "../types/conversation.js";

export type { RuntimeSnapshotMessage } from "./conversation-reducer.js";

export interface ServerPage {
  readonly messages: readonly RuntimeSnapshotMessage[];
  readonly beforeCursor: string | null;
}

export interface CompanionMessageInput {
  readonly messageId: string;
  readonly body: string;
  readonly emittedAt: string;
  readonly viaPostMessageBack: boolean;
}

export interface PendingUserMessageInput {
  readonly messageId: string;
  readonly body: string;
  readonly sentAt: string;
}

export interface MessageStore {
  getState(): MessageStoreState;
  /** Seed/replace the live server window from a reconnect snapshot (server order wins). */
  replaceServerWindow(page: ServerPage): MessageStoreState;
  /** Prepend an older history window ahead of the current timeline. */
  prependServerPage(page: ServerPage): MessageStoreState;
  /** Apply a live companion message (deduped by `message_id`). */
  appendCompanionMessage(message: CompanionMessageInput): MessageStoreState;
  /** Optimistically append an outbound user message as pending. */
  appendPendingUserMessage(message: PendingUserMessageInput): MessageStoreState;
  /** Return a failed outbound user message to pending for retry. */
  retryFailedUserMessage(messageId: string): MessageStoreState;
  /** Mark every pending outbound user message as failed. */
  markPendingFailed(): MessageStoreState;
}

export function createMessageStore(initial: MessageStoreState = EMPTY_MESSAGE_STORE): MessageStore {
  let state = initial;

  const apply = (event: ConversationEvent): MessageStoreState => {
    state = reduceConversationState(state, event);
    return state;
  };

  return {
    getState: () => state,
    replaceServerWindow: (page) =>
      apply({
        type: "reconnect_snapshot",
        messages: page.messages,
        beforeCursor: page.beforeCursor,
      }),
    prependServerPage: (page) =>
      apply({ type: "history_backfill", messages: page.messages, beforeCursor: page.beforeCursor }),
    appendCompanionMessage: (message) =>
      apply({
        type: "append_companion_message",
        messageId: message.messageId,
        body: message.body,
        emittedAt: message.emittedAt,
        viaPostMessageBack: message.viaPostMessageBack,
      }),
    appendPendingUserMessage: (message) =>
      apply({
        type: "send_user_message",
        messageId: message.messageId,
        body: message.body,
        sentAt: message.sentAt,
      }),
    retryFailedUserMessage: (messageId) => apply({ type: "retry_failed_user_message", messageId }),
    markPendingFailed: () => apply({ type: "mark_pending_failed" }),
  };
}
