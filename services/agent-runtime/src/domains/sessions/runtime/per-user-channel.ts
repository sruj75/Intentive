import { randomUUID } from "node:crypto";

import type { SessionSnapshotReader } from "../../conversation/types/conversation.js";
import type { TurnRunner } from "../../runtime/types/turn.js";
import type { EventLedger } from "../repo/event-ledger.js";
import type { SqlQuery, TransactionalSql } from "../repo/sql.js";
import type {
  BoundSession,
  LedgerRecord,
  PerUserChannel,
  PerceptionArrivedSink,
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
  runTurn?: TurnRunner;
  onPerceptionArrived?: PerceptionArrivedSink;
  onTurnError?: (error: unknown, context: { userId: string; messageId: string }) => void;
  newDedupKey?: () => string;
}): PerUserChannel {
  const newDedupKey = deps.newDedupKey ?? randomUUID;
  const queue = createUserQueue();

  return {
    accept(session, event) {
      return queue.submit(session.userId, async () => {
        const record = toLedgerRecord(session, event, newDedupKey);
        const results = await deps.sql.transaction([
          deps.ledger.recordQuery(record),
          ...deps.project(session, event),
        ]);
        const inserted = insertedLedgerRow(results);
        if (inserted && isPerceptionEvent(event)) {
          deps.onPerceptionArrived?.(session, event);
        }
        if (event.type === "user_message" && deps.runTurn && inserted) {
          try {
            await deps.runTurn(session, event);
          } catch (error) {
            const context = {
              userId: session.userId,
              messageId: event.message_id,
            };
            if (deps.onTurnError) {
              deps.onTurnError(error, context);
            } else {
              console.error("Interactive Turn failed after ingress commit", { ...context, error });
            }
          }
        }
      });
    },

    readSnapshot(userId, before, limit) {
      return queue.submit(userId, () => deps.conversation.readSnapshot(userId, before, limit));
    },

    enqueueCommitted(userId, run) {
      return queue.submit(userId, run);
    },

    enqueueBestEffort(userId, run) {
      return queue.tryBestEffort(userId, run);
    },
  };
}

function isPerceptionEvent(
  event: RuntimeIngressEvent,
): event is Extract<RuntimeIngressEvent, { type: "context_snapshot" | "session_end_marker" }> {
  return event.type === "context_snapshot" || event.type === "session_end_marker";
}

function insertedLedgerRow(results: unknown[]): boolean {
  const ledgerRows = results[0];
  return Array.isArray(ledgerRows) && ledgerRows.length > 0;
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
