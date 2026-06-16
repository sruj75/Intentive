import { randomUUID } from "node:crypto";

import type { ConversationRepo } from "../../conversation/types/conversation.js";
import type { DeliveryPort, PostMessageBack } from "../types/delivery.js";

export function createPostMessageBack(params: {
  readonly conversation: Pick<ConversationRepo, "append">;
  readonly deliveryPort: DeliveryPort;
  readonly newMessageId?: () => string;
}): PostMessageBack {
  const newMessageId = params.newMessageId ?? randomUUID;

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
    return { messageId };
  };
}
