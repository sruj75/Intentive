import type { RuntimeIngressEvent, BoundSession } from "../../sessions/types/event.js";

export interface RuntimeTurnInput {
  readonly threadId: string;
  readonly body: string;
}

export interface RuntimeTurnOutput {
  readonly reply: string;
  readonly traceId: string | null;
  readonly model: string;
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
  readonly status: RuntimeTurnStatus;
  readonly error: string | null;
}

export type TurnRunner = (session: BoundSession, event: RuntimeIngressEvent) => Promise<void>;
