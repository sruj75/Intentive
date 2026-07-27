import type { CompanionMessage } from "@intentive/protocol";
import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger, errorMessage } from "@intentive/providers/telemetry";

import { isChatCapable } from "../config/reachability.js";
import type {
  CoachingProactiveDeliveryMessage,
  ConnectionRegistry,
  CpPushClient,
  DeliveriesRepo,
  DeliveryMessage,
  DeliveryPort,
  DeliveryRecord,
  DeliveryStatus,
  OrdinaryProactiveDeliveryMessage,
  ReplyDeliveryMessage,
  ProactiveDeliveryMetricSink,
} from "../types/delivery.js";

export function createDeliveryPort(params: {
  readonly registry: ConnectionRegistry;
  readonly deliveries: DeliveriesRepo;
  readonly cpPush: CpPushClient;
  readonly authorizeProactive: (userId: string, windowId: string) => Promise<boolean>;
  readonly coachingMetrics?: ProactiveDeliveryMetricSink;
  readonly clock?: () => Date;
  readonly logger?: Logger;
}): DeliveryPort {
  const clock = params.clock ?? (() => new Date());
  const logger = params.logger ?? createNoopLogger();

  return {
    async deliverReply(message: ReplyDeliveryMessage): Promise<boolean> {
      const attemptedAt = clock();
      const deliveredKinds = params.registry.send(
        message.userId,
        (connection) => isChatCapable(connection.clientKind),
        companionEvent(message, attemptedAt, false),
      );
      if (await recordStreams(params.deliveries, message, deliveredKinds, attemptedAt)) {
        logAttempt(logger, message, "stream", "ok");
        return true;
      }

      await params.deliveries.recordQuery(
        recordFailure(message, "stream", attemptedAt, "no connected chat-capable client"),
      );
      logAttempt(logger, message, "stream", "failed");
      return false;
    },

    async deliverOrdinaryProactive(message: OrdinaryProactiveDeliveryMessage): Promise<boolean> {
      const attemptedAt = clock();
      const deliveredKinds = params.registry.send(
        message.userId,
        (connection) => isChatCapable(connection.clientKind) && connection.foreground,
        companionEvent(message, attemptedAt, true),
      );
      if (await recordStreams(params.deliveries, message, deliveredKinds, attemptedAt)) {
        logAttempt(logger, message, "stream", "ok");
        return true;
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
          windowId: null,
          path: "push",
          clientKind: null,
          status: "ok",
          error: null,
          attemptedAt,
        });
        logAttempt(logger, message, "push", "ok");
        return true;
      } catch (error) {
        await params.deliveries.recordQuery(
          recordFailure(message, "push", attemptedAt, errorMessage(error)),
        );
        logger.error("delivery.push_failed", error, {
          user_id: message.userId,
          message_id: message.messageId,
          delivery_path: "push",
          status: "failed",
        });
        return false;
      }
    },

    async deliverCoachingProactive(message: CoachingProactiveDeliveryMessage): Promise<boolean> {
      const attemptedAt = clock();
      const windowId = message.windowId;
      if (!(await params.authorizeProactive(message.userId, windowId))) {
        await params.deliveries.recordQuery(
          recordFailure(message, "stream", attemptedAt, "no matching active coaching window"),
        );
        logAttempt(logger, message, "stream", "failed");
        return false;
      }
      if (!params.registry.hasActiveCoachingWindow(message.userId, windowId)) {
        await params.deliveries.recordQuery(
          recordFailure(message, "stream", attemptedAt, "no matching active Desktop attestation"),
        );
        logAttempt(logger, message, "stream", "failed");
        return false;
      }

      const deliveredKind = params.registry.sendFirstSuccessful(
        message.userId,
        (connection) =>
          connection.clientKind === "desktop" &&
          connection.capabilities.includes("desktop_coaching_v1") &&
          connection.coachingWindowId === windowId &&
          connection.coachingPresence === "active",
        companionEvent(message, attemptedAt, true),
      );
      if (
        !(await recordStreams(
          params.deliveries,
          message,
          deliveredKind === null ? [] : [deliveredKind],
          attemptedAt,
        ))
      ) {
        await params.deliveries.recordQuery(
          recordFailure(message, "stream", attemptedAt, "no matching active Desktop attestation"),
        );
        logAttempt(logger, message, "stream", "failed");
        return false;
      }

      const kind = message.messageId === `opening:${windowId}` ? "orientation" : "intervention";
      params.coachingMetrics?.onProactiveDelivered({
        userId: message.userId,
        windowId,
        messageId: message.messageId,
        kind,
      });
      logAttempt(logger, message, "stream", "ok");
      if (kind === "intervention") {
        logger.info("coaching.intervention_stream_sent", {
          user_id: message.userId,
          message_id: message.messageId,
          duration_ms: Math.max(0, clock().getTime() - attemptedAt.getTime()),
          delivered: true,
          status: "ok",
        });
      }
      return true;
    },
  };
}

function companionEvent(
  message: DeliveryMessage,
  attemptedAt: Date,
  viaPostMessageBack: boolean,
): CompanionMessage {
  return {
    type: "companion_message",
    message_id: message.messageId,
    body: message.body,
    emitted_at: attemptedAt.toISOString(),
    via_post_message_back: viaPostMessageBack,
    ...(message.windowId === undefined ? {} : { window_id: message.windowId }),
  };
}

async function recordStreams(
  deliveries: DeliveriesRepo,
  message: DeliveryMessage,
  deliveredKinds: ReturnType<ConnectionRegistry["send"]>,
  attemptedAt: Date,
): Promise<boolean> {
  if (deliveredKinds.length === 0) {
    return false;
  }
  await Promise.all(
    deliveredKinds.map((clientKind) =>
      deliveries.recordQuery({
        userId: message.userId,
        messageId: message.messageId,
        windowId: message.windowId ?? null,
        path: "stream",
        clientKind,
        status: "ok",
        error: null,
        attemptedAt,
      }),
    ),
  );
  return true;
}

function logAttempt(
  logger: Logger,
  message: DeliveryMessage,
  path: "stream" | "push",
  status: DeliveryStatus,
): void {
  const attrs = {
    user_id: message.userId,
    message_id: message.messageId,
    delivery_path: path,
    status,
  } as const;
  if (status === "ok") {
    logger.info("delivery.attempt", attrs);
  } else {
    logger.warn("delivery.attempt", attrs);
  }
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
    windowId: message.windowId ?? null,
    path,
    clientKind: null,
    status: "failed" satisfies DeliveryStatus,
    error,
    attemptedAt,
  };
}
