import {
  PostInternalNotificationsPushRequest,
  PostInternalNotificationsPushResponse,
} from "@intentive/api-contract";

import type { CpPushClient } from "../types/delivery.js";

export function createCpPushClient(params: {
  readonly baseUrl: string;
  readonly internalSecret: string;
  readonly fetch?: typeof fetch;
}): CpPushClient {
  const fetchImpl = params.fetch ?? fetch;

  return {
    async push(input) {
      const body = PostInternalNotificationsPushRequest.parse({
        user_id: input.userId,
        preview_text: input.previewText,
        message_id: input.messageId,
      });
      const response = await fetchImpl(new URL("/internal/notifications/push", params.baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${params.internalSecret}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Control Plane push handoff failed with HTTP ${response.status}`);
      }

      PostInternalNotificationsPushResponse.parse(await response.json());
    },
  };
}
