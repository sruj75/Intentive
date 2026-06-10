import type { ClientToRuntimeEvent } from "@intentive/protocol";

import type { ConversationEntry } from "../types/conversation.js";

type PostConnectEvent = Exclude<ClientToRuntimeEvent, { type: "connect" }>;

/**
 * Map an inbound post-connect event to the Conversation History entry it
 * produces, or `null` when the event is not a chat message (`context_snapshot`,
 * `session_end_marker`, `history_backfill_request`, etc. are not transcript
 * entries). Takes the bare `userId` rather than a `sessions` shape so the
 * `conversation` domain stays free of any `sessions` import.
 *
 * This is the one-directional `sessions` → `conversation` seam (ADR-0008),
 * invoked from the composition root. It must stay this thin: if it ever grows
 * into a fat blob of per-event mapping, that is the temporal-decomposition
 * tripwire — the two domains were split on *when* things happen, not on
 * *knowledge*, and should merge back.
 */
export function toConversationEntry(
  userId: string,
  event: PostConnectEvent,
): ConversationEntry | null {
  if (event.type !== "user_message") {
    return null;
  }

  return {
    userId,
    messageId: event.message_id,
    author: "user",
    body: event.body,
    viaPostMessageBack: false,
  };
}
