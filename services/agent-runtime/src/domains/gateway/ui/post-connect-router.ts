import type { HistoryBackfillResponse, RuntimeError } from "@intentive/protocol";

import type { PerUserChannel } from "../../sessions/types/event.js";
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
 * - a Runtime Ingress event (`user_message` / `context_snapshot` /
 *   `session_end_marker`) is a **write** — `channel.accept` commits the ledger
 *   marker + projection in one transaction and replies with nothing.
 * - anything else is rejected with an explicit `runtime_error`; there is no
 *   silent no-op.
 */
export function createPostConnectRouter(deps: { channel: PerUserChannel }): GatewayEventHandler {
  return async (session, event) => {
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
      return undefined;
    }

    return unsupportedPostConnectEvent;
  };
}
