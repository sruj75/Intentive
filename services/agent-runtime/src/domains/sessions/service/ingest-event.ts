import { randomUUID } from "node:crypto";

import type { EventLedger } from "../repo/event-ledger.js";
import type { SqlQuery } from "../repo/sql.js";
import type { BoundSession, LedgerRecord, RuntimeIngressEvent } from "../types/event.js";

export interface IngestEvent {
  queriesFor(session: BoundSession, event: RuntimeIngressEvent): SqlQuery[];
}

export function createIngestEvent(deps: {
  ledger: EventLedger;
  project?: (session: BoundSession, event: RuntimeIngressEvent) => SqlQuery[];
  newDedupKey?: () => string;
}): IngestEvent {
  const newDedupKey = deps.newDedupKey ?? randomUUID;
  const project = deps.project ?? (() => []);

  return {
    queriesFor(session, event) {
      const record = toLedgerRecord(session, event, newDedupKey);
      return [deps.ledger.recordQuery(record), ...project(session, event)];
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
