import type { HistoryBackfillResponse } from "@intentive/protocol";

import type { GatewaySession, SessionSnapshotReader } from "../service/connect.js";
import type { GatewayEventHandler } from "./ws-handler.js";

/**
 * Routes a post-connect event to the right path:
 *
 * - `history_backfill_request` is a **read** — it goes straight to the Session
 *   Snapshot projection and returns a `history_backfill_response`. It never
 *   touches the arrival ledger or the per-User ordering queue, which are
 *   reserved for state-mutating ingress (ADR-0006: reads bypass the write path).
 * - everything else is delegated to the injected `ingress` handler (the ledger +
 *   queue path).
 */
export function createPostConnectRouter(deps: {
  ingress: GatewayEventHandler;
  conversation: SessionSnapshotReader;
}): GatewayEventHandler {
  return async (session: GatewaySession, event) => {
    if (event.type === "history_backfill_request") {
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
    }

    return deps.ingress(session, event);
  };
}
