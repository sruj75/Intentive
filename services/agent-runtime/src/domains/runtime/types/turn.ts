import type { RuntimeIngressEvent, BoundSession } from "../../sessions/types/event.js";
import type { PinnedProcedureFloor, TurnTrigger } from "../../bundles/types/floor.js";

export interface TurnEffectGuard {
  /** Latches the first side-effect failure for the current turn attempt. */
  fail(error: unknown): void;
  /** Throws the latched failure, if any, before success rows may commit. */
  assertSucceeded(): void;
}

export interface RuntimeTurnInput {
  readonly userId: string;
  readonly threadId: string;
  readonly body: string;
  readonly trigger: TurnTrigger;
  readonly pinnedFloor: PinnedProcedureFloor;
  readonly userProfile: string;
  readonly recentPerception?: string | null;
  readonly windowId?: string;
  readonly evidenceCursorStart?: number;
  readonly evidenceCursorEnd?: number;
  readonly evidenceVersion?: string;
  readonly firstRun?: boolean;
  /**
   * Shell-only side-effect state. The adapter may bind it into tool closures,
   * but it is never included in model messages, configurable values, or traces.
   */
  readonly effects?: TurnEffectGuard;
}

export interface RuntimeTurnOutput {
  readonly reply: string;
  readonly traceId: string | null;
  readonly model: string;
  readonly bundleVersion: string;
}

export type TurnSqlQuery = Promise<unknown[]>;

export interface TurnExecution {
  readonly userId: string;
  readonly threadId: string;
  readonly body: string;
  readonly trigger: TurnTrigger;
  /** Floor source, resolved inside the spine's try so resolution failures become normal failed turns. */
  readonly floor: () => Promise<PinnedProcedureFloor>;
  readonly firstRun?: boolean;
  /** Fixed, privacy-safe coaching evidence selected before model execution. */
  readonly recentPerception?: string | null;
  readonly windowId?: string;
  readonly evidenceCursorStart?: number;
  readonly evidenceCursorEnd?: number;
  readonly evidenceVersion?: string;
  /** Last async lifecycle/attestation check after model execution, before commit. */
  readonly beforeCommit?: () => Promise<boolean>;
  /** Trigger-specific durable rows only; the spine appends the `runtime_turns` anchor. */
  readonly onSuccess: (output: RuntimeTurnOutput) => TurnSqlQuery[];
  /** Trigger-specific durable rows only; the spine appends the `runtime_turns` anchor. */
  readonly onFailure: (error: unknown) => {
    readonly queries: TurnSqlQuery[];
    readonly rethrow: boolean;
  };
}

export interface DeepAgentsAdapter {
  setup(): Promise<void>;
  invoke(input: RuntimeTurnInput): Promise<RuntimeTurnOutput>;
}

export type RuntimeTurnStatus = "ok" | "failed";

/**
 * Fixed, content-free failure types permitted in the durable Runtime Turn
 * anchor. Error messages, codes, causes, and arbitrary custom names may contain
 * user perception or prompt content and must never be persisted here.
 */
export type RuntimeTurnErrorType =
  | "AbortError"
  | "AggregateError"
  | "Error"
  | "EvalError"
  | "RangeError"
  | "ReferenceError"
  | "RuntimeModelResponseError"
  | "SyntaxError"
  | "TypeError"
  | "URIError"
  | "UnknownThrownValue";

export interface RuntimeTurnRecord {
  readonly userId: string;
  readonly threadId: string;
  readonly traceId: string | null;
  readonly model: string;
  readonly bundleVersion: string | null;
  readonly windowId: string | null;
  readonly trigger: TurnTrigger;
  readonly evidenceCursorStart: number | null;
  readonly evidenceCursorEnd: number | null;
  readonly evidenceVersion: string | null;
  readonly status: RuntimeTurnStatus;
  readonly error: RuntimeTurnErrorType | null;
}

export type TurnRunner = (session: BoundSession, event: RuntimeIngressEvent) => Promise<void>;

export type Turn = (execution: TurnExecution) => Promise<RuntimeTurnOutput | null>;
