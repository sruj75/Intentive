import type {
  ClientKind,
  ContextSnapshot,
  SessionEndMarker,
  SessionSnapshot,
  UserMessage,
} from "@intentive/protocol";

import type { PinnedProcedureFloor, TurnTrigger } from "../../bundles/types/floor.js";

export type RuntimeEventKind = Extract<
  TurnTrigger,
  "user_message" | "context_snapshot" | "session_end_marker"
>;

export interface BoundSession {
  readonly userId: string;
  readonly clientKind: ClientKind | "system";
  readonly agentInstanceId: string;
  readonly pinnedFloor: PinnedProcedureFloor;
}

export type RuntimeIngressEvent = UserMessage | ContextSnapshot | SessionEndMarker;

export type PerceptionArrivedSink = (
  session: BoundSession,
  event: ContextSnapshot | SessionEndMarker,
) => void;

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

/**
 * The single per-`user_id` serialization point in the always-alive Runtime
 * process. Every stateful ingress (`accept`) and every Conversation History read
 * (`readSnapshot`) for a User passes through it, so reads observe earlier
 * accepted writes. The interface lives in `types` as the public contract; the
 * implementation (`createPerUserChannel`) lives in `sessions/runtime` and wraps
 * the in-memory ordering queue (ADR-0007). See ADR-0009.
 */
export interface PerUserChannel {
  /** Serialized write: ledger marker + injected projection in one Neon array transaction. */
  accept(session: BoundSession, event: RuntimeIngressEvent): Promise<void>;
  /** Serialized read: observes earlier accepted writes for this User. */
  readSnapshot(userId: string, before?: string, limit?: number): Promise<SessionSnapshot>;
}

export function isRuntimeIngressEvent(event: {
  readonly type: string;
}): event is RuntimeIngressEvent {
  return (
    event.type === "user_message" ||
    event.type === "context_snapshot" ||
    event.type === "session_end_marker"
  );
}
