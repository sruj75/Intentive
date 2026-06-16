import { randomUUID } from "node:crypto";
import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger } from "@intentive/providers/telemetry";

import type { ConversationRepo } from "../../conversation/types/conversation.js";
import type { DeliveryPort, PostMessageBack } from "../types/delivery.js";

export function createPostMessageBack(params: {
  readonly conversation: Pick<ConversationRepo, "append">;
  readonly deliveryPort: DeliveryPort;
  readonly newMessageId?: () => string;
  readonly logger?: Logger;
}): PostMessageBack {
  const newMessageId = params.newMessageId ?? randomUUID;
  const logger = params.logger ?? createNoopLogger();

  return async (userId, body) => {
    const messageId = newMessageId();
    await params.conversation.append({
      userId,
      messageId,
      author: "companion",
      body,
      viaPostMessageBack: true,
    });
    await params.deliveryPort.deliver({ userId, messageId, body }, "proactive");
    logger.info("delivery.pmb", {
      user_id: userId,
      message_id: messageId,
      status: "ok",
    });
    return { messageId };
  };
}
