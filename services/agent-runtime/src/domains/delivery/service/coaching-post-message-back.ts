import { createHash } from "node:crypto";
import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger } from "@intentive/providers/telemetry";

import type { ConversationRepo } from "../../conversation/types/conversation.js";
import type {
  CoachingPostMessageBack,
  ConnectionRegistry,
  DeliveryPort,
  ProactiveDeliveryContext,
} from "../types/delivery.js";

export function createCoachingPostMessageBack(params: {
  readonly connections: Pick<ConnectionRegistry, "hasActiveCoachingWindow">;
  readonly conversation: Pick<ConversationRepo, "appendCanonical">;
  readonly deliveryPort: Pick<DeliveryPort, "deliverCoachingProactive">;
  readonly authorize: (userId: string, context: ProactiveDeliveryContext) => Promise<boolean>;
  readonly logger?: Logger;
}): CoachingPostMessageBack {
  const logger = params.logger ?? createNoopLogger();

  return async (userId, body, context) => {
    if (
      !(await params.authorize(userId, context)) ||
      !params.connections.hasActiveCoachingWindow(userId, context.windowId)
    ) {
      throw new Error("Post-Message-Back requires an active coaching window");
    }

    const messageId = coachingInterventionMessageId(userId, context);
    const canonicalBody = await params.conversation.appendCanonical({
      userId,
      messageId,
      author: "companion",
      body,
      viaPostMessageBack: true,
      windowId: context.windowId,
    });
    const delivered = await params.deliveryPort.deliverCoachingProactive({
      userId,
      messageId,
      body: canonicalBody,
      windowId: context.windowId,
    });
    if (!delivered) {
      throw new Error("No matching Desktop accepted coaching delivery");
    }
    logger.info("delivery.pmb", {
      user_id: userId,
      message_id: messageId,
      status: "ok",
    });
    return { messageId };
  };
}

/**
 * One Monitoring evidence range owns one user-visible interruption identity.
 * The body is deliberately absent: a duplicate tool call or a retried model
 * attempt cannot mint another visible message for the same committed work.
 */
export function coachingInterventionMessageId(
  userId: string,
  context: ProactiveDeliveryContext,
): string {
  const identity = JSON.stringify([
    userId,
    context.windowId,
    context.evidenceVersion,
    context.evidenceCursorStart,
    context.evidenceCursorEnd,
  ]);
  return `intervention:${createHash("sha256").update(identity).digest("hex")}`;
}
