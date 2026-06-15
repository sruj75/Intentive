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
