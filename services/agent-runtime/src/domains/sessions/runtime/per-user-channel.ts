import { randomUUID } from "node:crypto";

import type { SessionSnapshotReader } from "../../conversation/types/conversation.js";
import type { EventLedger } from "../repo/event-ledger.js";
import type { SqlQuery, TransactionalSql } from "../repo/sql.js";
import type {
  BoundSession,
  LedgerRecord,
  PerUserChannel,
  RuntimeIngressEvent,
} from "../types/event.js";
import { createUserQueue } from "./user-queue.js";

/**
 * Builds the single per-`user_id` serialization point. It owns the in-memory
 * ordering queue (ADR-0007) and is the only place stateful ingress and
 * Conversation History reads for a User meet, so reads observe earlier accepted
 * writes (ADR-0006 amendment / candidate 4).
 *
 * `accept` commits the `runtime_events` arrival marker and every durable
 * projection in one Neon array transaction (ADR-0009): either all rows commit or
 * none do, and redelivery stays safe because the inserts are `ON CONFLICT DO
 * NOTHING`. The `sessions` → `conversation` projection is still injected as
 * `project`, so this module never imports the `conversation` repo — the
 * decoupling ADR-0009 protects is preserved while ordering, transaction, and
 * reads become co-located.
 */
export function createPerUserChannel(deps: {
  sql: TransactionalSql;
  ledger: EventLedger;
  conversation: SessionSnapshotReader;
  project: (session: BoundSession, event: RuntimeIngressEvent) => SqlQuery[];
  newDedupKey?: () => string;
}): PerUserChannel {
  const newDedupKey = deps.newDedupKey ?? randomUUID;
  const queue = createUserQueue();

  return {
    accept(session, event) {
      return queue.submit(session.userId, async () => {
        const record = toLedgerRecord(session, event, newDedupKey);
        await deps.sql.transaction([
          deps.ledger.recordQuery(record),
          ...deps.project(session, event),
        ]);
      });
    },

    readSnapshot(userId, before, limit) {
      return queue.submit(userId, () => deps.conversation.readSnapshot(userId, before, limit));
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
