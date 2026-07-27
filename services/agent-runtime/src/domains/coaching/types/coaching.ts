import type { CoachingWindowEnded, CoachingWindowStarted } from "@intentive/protocol";

export type CoachingWindowLifecycleEvent = CoachingWindowStarted | CoachingWindowEnded;

export interface ClaimedOpening {
  readonly userId: string;
  readonly windowId: string;
  readonly messageId: string;
  /** Present when model work already committed and only live delivery remains. */
  readonly body: string | null;
}

export interface CoachingMonitoringState {
  readonly userId: string;
  readonly windowId: string;
  /** Client-reported lifecycle time, retained for diagnostics only. */
  readonly startedAt: Date;
  /** Server-authored boundary for the first monitoring judgment floor. */
  readonly orientationCompletedAt: Date;
  readonly evidenceCursor: number | null;
  readonly evidenceVersion: string | null;
  readonly lastMonitoringTurnAt: Date | null;
}

export interface AdvanceCoachingEvidenceInput {
  readonly userId: string;
  readonly windowId: string;
  readonly cursorEnd: number;
  readonly evidenceVersion: string;
  readonly completedAt: Date;
}

export interface RecordCoachingJudgmentAttemptInput {
  readonly userId: string;
  readonly windowId: string;
  readonly attemptedAt: Date;
}

export type CoachingWindowQuery = Promise<unknown[]>;

export interface CoachingWindowsRepo {
  /**
   * Composable lifecycle projection queries. The Per-User Channel commits these
   * beside the ingress ledger marker, preserving ADR-0009 atomicity.
   */
  projectLifecycle(userId: string, event: CoachingWindowLifecycleEvent): CoachingWindowQuery[];
  /** Reuse ready delivery work or atomically move pending model work to running. */
  claimOpening(userId: string, windowId: string): Promise<ClaimedOpening | null>;
  markOpeningReadyQuery(userId: string, windowId: string): CoachingWindowQuery;
  /**
   * Complete the user/message-scoped ready opening after Desktop acknowledges
   * presentation. A duplicate acknowledgement returns the same completed
   * monitoring state so scheduler recovery stays idempotent.
   */
  acknowledgeOpening(userId: string, messageId: string): Promise<CoachingMonitoringState | null>;
  releaseOpeningQuery(userId: string, windowId: string): CoachingWindowQuery;
  /** Revalidate durable lifecycle truth immediately before proactive effects. */
  isActive(userId: string, windowId: string): Promise<boolean>;
  readMonitoringState(userId: string): Promise<CoachingMonitoringState | null>;
  advanceEvidenceQuery(input: AdvanceCoachingEvidenceInput): CoachingWindowQuery;
  recordJudgmentAttemptQuery(input: RecordCoachingJudgmentAttemptInput): CoachingWindowQuery;
}

export interface RecentCoachingEvidence {
  readonly windowId: string;
  readonly cursorStart: number;
  readonly cursorEnd: number;
  readonly version: string;
  readonly eventIds: readonly string[];
  readonly oldestCapturedAt: Date;
  readonly rendered: string;
}

export interface RecentCoachingEvidenceInput {
  readonly userId: string;
  readonly windowId: string;
  readonly afterCursor: number | null;
  readonly limit?: number;
  readonly maxCharacters?: number;
}

export interface BoundCoachingEvidenceInput {
  readonly userId: string;
  readonly windowId: string;
  readonly cursorStart: number;
  readonly cursorEnd: number;
  readonly version: string;
}

export interface RecentCoachingEvidenceReader {
  read(input: RecentCoachingEvidenceInput): Promise<RecentCoachingEvidence | null>;
  /**
   * Re-renders one previously bound cursor range from the current projection.
   * Expiry, tombstones, and redaction/replacement re-emits therefore invalidate
   * stale model work before it can cause an external effect or cursor advance.
   */
  isCurrent(input: BoundCoachingEvidenceInput): Promise<boolean>;
}
