import {
  isRuntimeOwnedMessageId,
  type HistoryBackfillResponse,
  type RuntimeError,
  type RuntimeIngressAck,
} from "@intentive/protocol";

import type { ConnectionRegistry } from "../../delivery/types/delivery.js";
import type { PerUserChannel, RuntimeIngressEvent } from "../../sessions/types/event.js";
import { isRuntimeIngressEvent } from "../../sessions/types/event.js";
import { conversationHistoryUnavailableError } from "../service/history-unavailable.js";
import type { GatewayEventHandler } from "./ws-handler.js";

const unsupportedPostConnectEvent: RuntimeError = {
  type: "runtime_error",
  code: "invalid_connect",
  message: "Event type is not supported on an active connection.",
};

const coachingCapabilityRequired: RuntimeError = {
  type: "runtime_error",
  code: "invalid_connect",
  message: "Desktop coaching events require the desktop_coaching_v1 capability.",
};

const windowBoundPerceptionCapabilityRequired: RuntimeError = {
  type: "runtime_error",
  code: "invalid_connect",
  message: "Window-bound perception requires the desktop_coaching_v1 capability.",
};

const perceptionSourceMismatch: RuntimeError = {
  type: "runtime_error",
  code: "invalid_connect",
  message: "Perception source_client must match the authenticated client.",
};

const runtimeOwnedMessageIdRejected: RuntimeError = {
  type: "runtime_error",
  code: "invalid_connect",
  message: "User messages cannot use Runtime-owned message IDs.",
};

interface CoachingPresenceAdmission {
  readonly accepted: boolean;
  readonly afterApply?: () => Promise<void> | void;
}

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
export function createPostConnectRouter(deps: {
  channel: PerUserChannel;
  coachingConnections?: Pick<ConnectionRegistry, "clearCoachingWindow">;
  onCoachingPresence?: (
    session: Parameters<GatewayEventHandler>[0],
    event: Extract<Parameters<GatewayEventHandler>[1], { type: "coaching_window_presence" }>,
  ) => Promise<CoachingPresenceAdmission | void> | CoachingPresenceAdmission | void;
  onCoachingDeliveryAck?: (
    session: Parameters<GatewayEventHandler>[0],
    messageId: string,
  ) => Promise<void> | void;
}): GatewayEventHandler {
  return async (session, event, connection) => {
    if (event.type === "history_backfill_request") {
      try {
        const session_snapshot = await deps.channel.readSnapshot(
          session.userId,
          event.before_cursor,
          event.limit,
          session.clientKind === "desktop" ? "desktop" : "ordinary",
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
      if (event.type === "user_message" && isRuntimeOwnedMessageId(event.message_id)) {
        return runtimeOwnedMessageIdRejected;
      }
      if (event.type === "perception_event" && event.source_client !== session.clientKind) {
        return perceptionSourceMismatch;
      }
      if (
        event.type === "perception_event" &&
        event.window_id !== undefined &&
        !supportsDesktopCoaching(session)
      ) {
        return windowBoundPerceptionCapabilityRequired;
      }
      if (
        (event.type === "coaching_window_started" || event.type === "coaching_window_ended") &&
        !supportsDesktopCoaching(session)
      ) {
        return coachingCapabilityRequired;
      }
      if (event.type === "coaching_window_ended") {
        // Fail live proactive gating closed as soon as the end frame is parsed,
        // even while its durable projection waits behind an in-flight turn.
        if (deps.coachingConnections) {
          deps.coachingConnections.clearCoachingWindow(
            session.userId,
            event.window_id,
            event.ended_at,
          );
        } else {
          connection?.clearCoachingPresence(event.window_id, event.ended_at);
        }
      }
      await deps.channel.accept(session, event);
      return ingressAckFor(event);
    }

    if (event.type === "presence_update") {
      connection?.setForeground(event.foreground);
      return undefined;
    }

    if (event.type === "coaching_window_presence") {
      if (!supportsDesktopCoaching(session)) {
        return coachingCapabilityRequired;
      }
      if (event.state === "locked") {
        // Privacy transitions apply before any asynchronous durable lookup and
        // remain fail-closed even when the client clock moved backwards.
        const applied =
          connection?.setCoachingPresence(event.window_id, event.state, event.changed_at) ?? false;
        if (!applied) {
          return undefined;
        }
        const admission = await deps.onCoachingPresence?.(session, event);
        if (admission && !admission.accepted) {
          return undefined;
        }
        await admission?.afterApply?.();
        return undefined;
      }

      // Active is privacy-relaxing. Durable/current-window admission must run
      // before the socket can replace an already-valid live attestation.
      if (!connection) {
        return undefined;
      }
      const preflight = connection.prepareActiveCoachingPresence?.(
        event.window_id,
        event.changed_at,
      );
      if (preflight === null) {
        return undefined;
      }
      const admission = await deps.onCoachingPresence?.(session, event);
      if (admission && !admission.accepted) {
        return undefined;
      }
      const applied = connection.setCoachingPresence(
        event.window_id,
        event.state,
        event.changed_at,
        preflight,
      );
      if (!applied) {
        return undefined;
      }
      await admission?.afterApply?.();
      return undefined;
    }

    if (event.type === "delivery_ack") {
      if (supportsDesktopCoaching(session) && isOpeningOrientationMessageId(event.message_id)) {
        await deps.onCoachingDeliveryAck?.(session, event.message_id);
      }
      return undefined;
    }

    return unsupportedPostConnectEvent;
  };
}

function isOpeningOrientationMessageId(messageId: string): boolean {
  return /^opening:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    messageId,
  );
}

function supportsDesktopCoaching(session: Parameters<GatewayEventHandler>[0]): boolean {
  return session.clientKind === "desktop" && session.capabilities.includes("desktop_coaching_v1");
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
    case "coaching_window_started":
    case "coaching_window_ended":
      return {
        type: "runtime_ingress_ack",
        ingress_kind: event.type,
        ingress_id: event.window_id,
      };
    default:
      return undefined;
  }
}
