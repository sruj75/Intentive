export const PROCEDURE_FLOOR_DOCUMENTS = ["SOUL", "AGENTS", "BOOTSTRAP", "HEARTBEAT"] as const;

export type ProcedureFloorDocument = (typeof PROCEDURE_FLOOR_DOCUMENTS)[number];

export type ProcedureFloorDocuments = Record<ProcedureFloorDocument, string>;

export interface PinnedProcedureFloor {
  readonly version: string;
  readonly documents: ProcedureFloorDocuments;
  readonly langfusePrompts: readonly unknown[];
}

export interface FloorSource {
  fetch(label: string): Promise<PinnedProcedureFloor | null>;
}

export interface ProcedureFloorResolver {
  resolve(label: string): Promise<PinnedProcedureFloor>;
}

export type TurnTrigger =
  | "user_message"
  | "context_snapshot"
  | "session_end_marker"
  | "conversation_start"
  | "cron"
  | "heartbeat";
