import type { LogAttrs, Logger } from "@intentive/providers/telemetry";
import { createNoopLogger } from "@intentive/providers/telemetry";

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
  logger?: Logger;
}): PerUserChannel {
  const logger = deps.logger ?? createNoopLogger();
  const queue = createUserQueue({ logger });

  return {
    accept(session, event) {
      return queue.submit(session.userId, async () => {
        const record = toLedgerRecord(session, event);
        const results = await deps.sql.transaction([
          deps.ledger.recordQuery(record),
          ...deps.project(session, event),
        ]);
        const inserted = insertedLedgerRow(results);
        logger.info("session.ingress_committed", ingressAttrs(session, event, inserted));
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
              logger.error("session.turn_failed", error, {
                user_id: context.userId,
                message_id: context.messageId,
                status: "failed",
              });
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

function ingressAttrs(
  session: BoundSession,
  event: RuntimeIngressEvent,
  inserted: boolean,
): LogAttrs {
  const attrs: LogAttrs = {
    user_id: session.userId,
    status: inserted ? "ok" : "duplicate",
    client_kind: session.clientKind,
  };
  if (event.type === "user_message") {
    attrs.message_id = event.message_id;
  }
  if (event.type === "perception_event") {
    attrs.event_id = event.event_id;
    attrs.artifact_type = event.artifact_type;
    attrs.sensitivity_label = event.sensitivity_label;
  }
  if (event.type === "perception_tombstone") {
    attrs.reason = event.reason;
  }
  if (event.type === "session_end_marker") {
    attrs.reason = event.reason;
  }
  return attrs;
}

function isPerceptionEvent(
  event: RuntimeIngressEvent,
): event is Extract<RuntimeIngressEvent, { type: "perception_event" | "session_end_marker" }> {
  return event.type === "perception_event" || event.type === "session_end_marker";
}

function insertedLedgerRow(results: unknown[]): boolean {
  const ledgerRows = results[0];
  return Array.isArray(ledgerRows) && ledgerRows.length > 0;
}

function toLedgerRecord(session: BoundSession, event: RuntimeIngressEvent): LedgerRecord {
  return {
    userId: session.userId,
    kind: event.type,
    dedupKey: dedupKeyFor(event),
    payload: event,
  };
}

function dedupKeyFor(event: RuntimeIngressEvent): string {
  switch (event.type) {
    case "user_message":
      return event.message_id;
    case "perception_event":
      return event.event_id;
    case "perception_tombstone":
      return event.tombstone_id;
    case "session_end_marker":
      // The marker's stable UUID is its dedup key, so a redelivered marker
      // commits idempotently and is acknowledged the same way.
      return event.marker_id;
  }
}
