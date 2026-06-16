import type { CompanionMessage } from "@intentive/protocol";

import { isChatCapable } from "../config/reachability.js";
import type {
  ConnectionRegistry,
  CpPushClient,
  DeliveriesRepo,
  DeliveryMessage,
  DeliveryMode,
  DeliveryPort,
  DeliveryRecord,
  DeliveryStatus,
} from "../types/delivery.js";

export function createDeliveryPort(params: {
  readonly registry: ConnectionRegistry;
  readonly deliveries: DeliveriesRepo;
  readonly cpPush: CpPushClient;
  readonly clock?: () => Date;
}): DeliveryPort {
  const clock = params.clock ?? (() => new Date());

  return {
    async deliver(message: DeliveryMessage, mode: DeliveryMode): Promise<void> {
      const attemptedAt = clock();
      const event: CompanionMessage = {
        type: "companion_message",
        message_id: message.messageId,
        body: message.body,
        emitted_at: attemptedAt.toISOString(),
        via_post_message_back: mode === "proactive",
      };

      const deliveredKinds = params.registry.send(
        message.userId,
        (connection) =>
          isChatCapable(connection.clientKind) && (mode === "reply" ? true : connection.foreground),
        event,
      );

      if (deliveredKinds.length > 0) {
        await Promise.all(
          deliveredKinds.map((clientKind) =>
            params.deliveries.recordQuery({
              userId: message.userId,
              messageId: message.messageId,
              path: "stream",
              clientKind,
              status: "ok",
              error: null,
              attemptedAt,
            }),
          ),
        );
        return;
      }

      if (mode === "reply") {
        await params.deliveries.recordQuery(
          recordFailure(message, "stream", attemptedAt, "no connected chat-capable client"),
        );
        return;
      }

      try {
        await params.cpPush.push({
          userId: message.userId,
          previewText: message.body,
          messageId: message.messageId,
        });
        await params.deliveries.recordQuery({
          userId: message.userId,
          messageId: message.messageId,
          path: "push",
          clientKind: null,
          status: "ok",
          error: null,
          attemptedAt,
        });
      } catch (error) {
        await params.deliveries.recordQuery(
          recordFailure(message, "push", attemptedAt, errorMessage(error)),
        );
      }
    },
  };
}

function recordFailure(
  message: DeliveryMessage,
  path: "stream" | "push",
  attemptedAt: Date,
  error: string,
): DeliveryRecord {
  return {
    userId: message.userId,
    messageId: message.messageId,
    path,
    clientKind: null,
    status: "failed" satisfies DeliveryStatus,
    error,
    attemptedAt,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
