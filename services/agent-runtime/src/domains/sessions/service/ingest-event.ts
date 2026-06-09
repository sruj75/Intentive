import { randomUUID } from "node:crypto";

import type { EventLedger } from "../repo/event-ledger.js";
import type {
  BoundSession,
  EventProcessor,
  LedgerRecord,
  RuntimeIngressEvent,
} from "../types/event.js";

export interface IngestEvent {
  recordIfNew(
    session: BoundSession,
    event: RuntimeIngressEvent,
  ): Promise<RecordedRuntimeEvent | null>;
  process(recorded: RecordedRuntimeEvent): Promise<void>;
}

export interface RecordedRuntimeEvent {
  readonly session: BoundSession;
  readonly event: RuntimeIngressEvent;
}

export function createIngestEvent(deps: {
  ledger: EventLedger;
  processor: EventProcessor;
  newDedupKey?: () => string;
}): IngestEvent {
  const newDedupKey = deps.newDedupKey ?? randomUUID;

  return {
    async recordIfNew(session, event) {
      const record = toLedgerRecord(session, event, newDedupKey);
      const { isNew } = await deps.ledger.recordIfNew(record);
      if (!isNew) {
        return null;
      }

      return { session, event };
    },

    async process(recorded) {
      await deps.processor(recorded.session, recorded.event);
    },
  };
}

function toLedgerRecord(
  session: BoundSession,
  event: RuntimeIngressEvent,
  newDedupKey: () => string,
): LedgerRecord {
  return {
    userId: session.userId,
    kind: event.type,
    dedupKey: dedupKeyFor(event, newDedupKey),
    payload: event,
  };
}

function dedupKeyFor(event: RuntimeIngressEvent, newDedupKey: () => string): string {
  switch (event.type) {
    case "user_message":
      return event.message_id;
    case "context_snapshot":
      return event.snapshot_id;
    case "session_end_marker":
      return newDedupKey();
  }
}
