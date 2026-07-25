import type { HistoryBackfillResponse, RuntimeError, RuntimeIngressAck } from "@intentive/protocol";

import type { PerUserChannel, RuntimeIngressEvent } from "../../sessions/types/event.js";
import { isRuntimeIngressEvent } from "../../sessions/types/event.js";
import { conversationHistoryUnavailableError } from "../service/history-unavailable.js";
import type { GatewayEventHandler } from "./ws-handler.js";

const unsupportedPostConnectEvent: RuntimeError = {
  type: "runtime_error",
  code: "invalid_connect",
  message: "Event type is not supported on an active connection.",
};

/**
 * The single post-connect routing table. Every post-handshake event resolves to
 * exactly one of three paths through the Per-User Channel:
 *
 * - `history_backfill_request` is a **read** — `channel.readSnapshot` returns a
 *   `history_backfill_response`. It serializes behind pending per-User work but
 *   never touches the arrival ledger/write path (ADR-0006).
 * - a Runtime Ingress event (`user_message` / `perception_event` /
 *   `perception_tombstone` / `session_end_marker`) is a **write** —
 *   `channel.accept` commits the ledger marker + projection in one transaction.
 *   The three durable ingress kinds then receive a `runtime_ingress_ack` sent
 *   only after that transaction commits (a duplicate the ledger dedupes still
 *   commits and so is acknowledged the same way); a failed transaction rejects
 *   and is never acknowledged. `user_message` gets no durable ack.
 * - anything else is rejected with an explicit `runtime_error`; there is no
 *   silent no-op.
 */
export function createPostConnectRouter(deps: { channel: PerUserChannel }): GatewayEventHandler {
  return async (session, event, connection) => {
    if (event.type === "history_backfill_request") {
      try {
        const session_snapshot = await deps.channel.readSnapshot(
          session.userId,
          event.before_cursor,
          event.limit,
        );
        const response: HistoryBackfillResponse = {
          type: "history_backfill_response",
          session_snapshot,
        };
        return response;
      } catch {
        return conversationHistoryUnavailableError();
      }
    }

    if (isRuntimeIngressEvent(event)) {
      await deps.channel.accept(session, event);
      return ingressAckFor(event);
    }

    if (event.type === "presence_update") {
      connection?.setForeground(event.foreground);
      return undefined;
    }

    if (event.type === "delivery_ack") {
      return undefined;
    }

    return unsupportedPostConnectEvent;
  };
}

/**
 * The durable-ingress acknowledgement for a just-committed write, or `undefined`
 * for `user_message` (which carries no durable outbox on the client). The
 * `ingress_id` is the item's own stable UUID so a redelivered, ledger-deduped
 * item acknowledges identically.
 */
function ingressAckFor(event: RuntimeIngressEvent): RuntimeIngressAck | undefined {
  switch (event.type) {
    case "perception_event":
      return {
        type: "runtime_ingress_ack",
        ingress_kind: "perception_event",
        ingress_id: event.event_id,
      };
    case "perception_tombstone":
      return {
        type: "runtime_ingress_ack",
        ingress_kind: "perception_tombstone",
        ingress_id: event.tombstone_id,
      };
    case "session_end_marker":
      return {
        type: "runtime_ingress_ack",
        ingress_kind: "session_end_marker",
        ingress_id: event.marker_id,
      };
    default:
      return undefined;
  }
}
