import type {
  ClientKind,
  ContextSnapshot,
  SessionEndMarker,
  UserMessage,
} from "@intentive/protocol";

export type RuntimeEventKind =
  | "user_message"
  | "context_snapshot"
  | "session_end_marker"
  | "conversation_start"
  | "cron"
  | "heartbeat";

export interface BoundSession {
  readonly userId: string;
  readonly clientKind: ClientKind;
  readonly agentInstanceId: string;
}

export type RuntimeIngressEvent = UserMessage | ContextSnapshot | SessionEndMarker;

export interface LedgerRecord {
  readonly userId: string;
  readonly kind: RuntimeEventKind;
  readonly dedupKey: string;
  readonly payload: RuntimeIngressEvent;
}

export type EventProcessor = (
  session: BoundSession,
  event: RuntimeIngressEvent,
) => Promise<void> | void;

export function isRuntimeIngressEvent(event: {
  readonly type: string;
}): event is RuntimeIngressEvent {
  return (
    event.type === "user_message" ||
    event.type === "context_snapshot" ||
    event.type === "session_end_marker"
  );
}
