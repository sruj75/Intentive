import type { HistoryBackfillResponse } from "@intentive/protocol";

import type { GatewaySession, SessionSnapshotReader } from "../service/connect.js";
import { conversationHistoryUnavailableError } from "../service/history-unavailable.js";
import type { GatewayEventHandler } from "./ws-handler.js";

/**
 * Routes a post-connect event to the right path:
 *
 * - `history_backfill_request` is a **read** — it returns a
 *   `history_backfill_response` from the injected Session Snapshot reader. The
 *   reader may serialize behind pending per-User work, but the request never
 *   touches the arrival ledger/write path (ADR-0006).
 * - everything else is delegated to the injected `ingress` handler (the ledger +
 *   queue path).
 */
export function createPostConnectRouter(deps: {
  ingress: GatewayEventHandler;
  conversation: SessionSnapshotReader;
}): GatewayEventHandler {
  return async (session: GatewaySession, event) => {
    if (event.type === "history_backfill_request") {
      try {
        const session_snapshot = await deps.conversation.readSnapshot(
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

    return deps.ingress(session, event);
  };
}
