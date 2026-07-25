import type { ConnectionState, DeliveryStatus, RuntimeAdapterError } from "./conversation.js";

export type ChatPhase = "idle" | "user_sent" | "thinking" | "composing" | "replied";

export type ConversationTimelineItem =
  | {
      readonly id: string;
      readonly kind: "capability_card";
      readonly title: string;
      readonly body: string;
      readonly actionLabel: string;
      readonly disabled: true;
    }
  | {
      readonly id: string;
      readonly kind: "suggestion_group";
      readonly suggestions: readonly string[];
    }
  | {
      readonly id: string;
      readonly kind: "user_message";
      readonly text: string;
      readonly delivery?: DeliveryStatus;
    }
  | { readonly id: string; readonly kind: "companion_message"; readonly text: string }
  | {
      readonly id: string;
      readonly kind: "activity";
      readonly phase: "thinking" | "composing";
    };

export interface ConversationSessionSnapshot {
  readonly timeline: readonly ConversationTimelineItem[];
  readonly phase: ChatPhase;
  readonly connectionState: ConnectionState;
  readonly error: RuntimeAdapterError | null;
}

export interface ConversationSession {
  getSnapshot(): ConversationSessionSnapshot;
  subscribe(listener: () => void): () => void;
  send(message: string): void;
  retryUserMessage(messageId: string): void;
  retryConnection(): void;
  dispose(): void;
}
