import type {
  ClientKind,
  PerceptionEvent,
  PerceptionTombstone,
  SessionEndMarker,
  SessionSnapshot,
  UserMessage,
} from "@intentive/protocol";

import type { PinnedProcedureFloor, TurnTrigger } from "../../bundles/types/floor.js";

// The ledger `kind` set: the turn-triggering ingress events plus
// `perception_tombstone`, a stateful deletion that commits like an ingress but
// never triggers a turn.
export type RuntimeEventKind =
  | Extract<TurnTrigger, "user_message" | "perception_event" | "session_end_marker">
  | "perception_tombstone";

export interface BoundSession {
  readonly userId: string;
  readonly clientKind: ClientKind | "system";
  readonly agentInstanceId: string;
  readonly pinnedFloor: PinnedProcedureFloor;
}

export type RuntimeIngressEvent =
  | UserMessage
  | PerceptionEvent
  | PerceptionTombstone
  | SessionEndMarker;

export type PerceptionArrivedSink = (
  session: BoundSession,
  event: PerceptionEvent | SessionEndMarker,
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
  /** Serialized committed work such as a due Cron fire. */
  enqueueCommitted(userId: string, run: () => Promise<void> | void): Promise<void>;
  /** Collapsible best-effort Monitoring Turn work such as Heartbeat or perception. */
  enqueueBestEffort(userId: string, run: () => Promise<void> | void): boolean;
}

export function isRuntimeIngressEvent(event: {
  readonly type: string;
}): event is RuntimeIngressEvent {
  return (
    event.type === "user_message" ||
    event.type === "perception_event" ||
    event.type === "perception_tombstone" ||
    event.type === "session_end_marker"
  );
}
