import type {
  ClientKind,
  ClientCapability,
  CoachingWindowEnded,
  CoachingWindowStarted,
  PerceptionEvent,
  PerceptionTombstone,
  SessionEndMarker,
  SessionSnapshot,
  UserMessage,
} from "@intentive/protocol";

import type { PinnedProcedureFloor, TurnTrigger } from "../../bundles/types/floor.js";
import type { ConversationSnapshotAudience } from "../../conversation/types/conversation.js";

// The ledger `kind` set: the turn-triggering ingress events plus
// `perception_tombstone`, a stateful deletion that commits like an ingress but
// never triggers a turn.
export type RuntimeEventKind =
  | Extract<TurnTrigger, "user_message" | "perception_event" | "session_end_marker">
  | "coaching_window_started"
  | "coaching_window_ended"
  | "perception_tombstone";

export interface BoundSession {
  readonly userId: string;
  readonly clientKind: ClientKind | "system";
  readonly agentInstanceId: string;
  readonly pinnedFloor: PinnedProcedureFloor;
  readonly capabilities: readonly ClientCapability[];
}

export type RuntimeIngressEvent =
  | CoachingWindowStarted
  | CoachingWindowEnded
  | UserMessage
  | PerceptionEvent
  | PerceptionTombstone
  | SessionEndMarker;

export type PerceptionArrivedSink = (
  session: BoundSession,
  event: PerceptionEvent | SessionEndMarker,
) => void;

export type PerceptionProjectedSink = (session: BoundSession, event: PerceptionEvent) => void;

export type CoachingWindowLifecycleEvent = CoachingWindowStarted | CoachingWindowEnded;

export type CoachingWindowLifecycleSink = (
  session: BoundSession,
  event: CoachingWindowLifecycleEvent,
) => void;

export type UserMessageCommittedSink = (session: BoundSession, event: UserMessage) => void;

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
  readSnapshot(
    userId: string,
    before?: string,
    limit?: number,
    audience?: ConversationSnapshotAudience,
  ): Promise<SessionSnapshot>;
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
    event.type === "coaching_window_started" ||
    event.type === "coaching_window_ended" ||
    event.type === "perception_event" ||
    event.type === "perception_tombstone" ||
    event.type === "session_end_marker"
  );
}

export function isCoachingWindowLifecycleEvent(
  event: RuntimeIngressEvent,
): event is CoachingWindowLifecycleEvent {
  return event.type === "coaching_window_started" || event.type === "coaching_window_ended";
}
