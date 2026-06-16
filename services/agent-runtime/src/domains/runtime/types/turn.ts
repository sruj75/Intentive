import type { RuntimeIngressEvent, BoundSession } from "../../sessions/types/event.js";
import type { PinnedProcedureFloor, TurnTrigger } from "../../bundles/types/floor.js";

export interface RuntimeTurnInput {
  readonly userId: string;
  readonly threadId: string;
  readonly body: string;
  readonly trigger: TurnTrigger;
  readonly pinnedFloor: PinnedProcedureFloor;
  readonly userProfile: string;
  readonly recentPerception?: string | null;
  readonly firstRun?: boolean;
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

export interface RuntimeTurnRecord {
  readonly userId: string;
  readonly threadId: string;
  readonly traceId: string | null;
  readonly model: string;
  readonly bundleVersion: string | null;
  readonly status: RuntimeTurnStatus;
  readonly error: string | null;
}

export type TurnRunner = (session: BoundSession, event: RuntimeIngressEvent) => Promise<void>;

export type Turn = (execution: TurnExecution) => Promise<void>;
