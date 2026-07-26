import type {
  ClientCapability,
  ClientKind,
  CoachingWindowPresenceState,
  RuntimeToClientEvent,
} from "@intentive/protocol";

export type DeliveryPath = "stream" | "push";
export type DeliveryStatus = "ok" | "failed";

interface DeliveryMessageBase {
  readonly userId: string;
  readonly messageId: string;
  readonly body: string;
}

export interface ReplyDeliveryMessage extends DeliveryMessageBase {
  readonly windowId?: never;
}

export interface OrdinaryProactiveDeliveryMessage extends DeliveryMessageBase {
  readonly windowId?: never;
}

export interface CoachingProactiveDeliveryMessage extends DeliveryMessageBase {
  /** Required for Desktop Coaching Window proactive delivery. */
  readonly windowId: string;
}

export type DeliveryMessage =
  | ReplyDeliveryMessage
  | OrdinaryProactiveDeliveryMessage
  | CoachingProactiveDeliveryMessage;

export interface DeliveryRecord {
  readonly userId: string;
  readonly messageId: string;
  readonly windowId: string | null;
  readonly path: DeliveryPath;
  readonly clientKind: ClientKind | null;
  readonly status: DeliveryStatus;
  readonly error: string | null;
  readonly attemptedAt: Date;
}

export interface DeliveriesRepo {
  recordQuery(record: DeliveryRecord): Promise<unknown[]>;
}

export interface RegisteredConnection {
  readonly clientKind: ClientKind;
  readonly capabilities: readonly ClientCapability[];
  foreground: boolean;
  coachingWindowId: string | null;
  coachingPresence: CoachingWindowPresenceState | null;
}

export interface CoachingPresencePreflight {
  readonly windowId: string;
  readonly changedAt: string;
  readonly generation: number;
}

export interface ConnectionHandle {
  setForeground(foreground: boolean): void;
  /**
   * Reserves this active frame's server arrival generation before asynchronous
   * durable admission. A later frame invalidates the returned preflight.
   */
  prepareActiveCoachingPresence(
    windowId: string,
    changedAt: string,
  ): CoachingPresencePreflight | null;
  /**
   * Locks always fail closed. Active transitions apply only when `changedAt`
   * clears the window's non-terminal high-water mark and its preflight remains
   * the newest server-arrived frame.
   */
  setCoachingPresence(
    windowId: string,
    state: CoachingWindowPresenceState,
    changedAt: string,
    preflight?: CoachingPresencePreflight,
  ): boolean;
  clearCoachingPresence(windowId: string, endedAt: string): void;
  unregister(): void;
}

export interface ConnectionRegistry {
  send(
    userId: string,
    predicate: (connection: RegisteredConnection) => boolean,
    event: RuntimeToClientEvent,
  ): ClientKind[];
  /**
   * Attempts matching sockets in registration order until one send succeeds.
   * Broken sockets are removed and do not prevent a later healthy match.
   */
  sendFirstSuccessful(
    userId: string,
    predicate: (connection: RegisteredConnection) => boolean,
    event: RuntimeToClientEvent,
  ): ClientKind | null;
  hasActiveCoachingWindow(userId: string, windowId: string): boolean;
  /** Conservatively locks every socket for this exact window despite clock skew. */
  lockCoachingWindow(userId: string, windowId: string, changedAt: string): boolean;
  /** Clears every socket and retains a terminal high-water for this window. */
  clearCoachingWindow(userId: string, windowId: string, endedAt: string): void;
}

export interface CpPushClient {
  push(input: { userId: string; previewText: string; messageId: string }): Promise<void>;
}

export interface DeliveryPort {
  /** True only when at least one eligible live client accepted the reply. */
  deliverReply(message: ReplyDeliveryMessage): Promise<boolean>;
  /**
   * Ordinary Post-Message-Back routing: foreground chat stream, then Control
   * Plane push when no eligible foreground connection exists.
   */
  deliverOrdinaryProactive(message: OrdinaryProactiveDeliveryMessage): Promise<boolean>;
  /**
   * Coaching routing: matching active Desktop only, with no Mobile or push
   * fallback.
   */
  deliverCoachingProactive(message: CoachingProactiveDeliveryMessage): Promise<boolean>;
}

export interface ProactiveDeliveryMetricSink {
  onProactiveDelivered(input: {
    readonly userId: string;
    readonly windowId: string;
    readonly messageId: string;
    readonly kind: "orientation" | "intervention";
  }): void;
}

export interface ProactiveDeliveryContext {
  readonly windowId: string;
  readonly evidenceVersion: string;
  readonly evidenceCursorStart: number;
  readonly evidenceCursorEnd: number;
}

export type PostMessageBack = (userId: string, body: string) => Promise<{ messageId: string }>;

export type CoachingPostMessageBack = (
  userId: string,
  body: string,
  context: ProactiveDeliveryContext,
) => Promise<{ messageId: string }>;
