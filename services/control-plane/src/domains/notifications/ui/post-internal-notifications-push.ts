import {
  PostInternalNotificationsPushRequest,
  PostInternalNotificationsPushResponse,
  parseBoundary,
} from "@intentive/api-contract";

import { requireInternalSecret } from "../../../http/auth.js";
import type { NotificationsService } from "../service/notifications-service.js";

export interface PostInternalNotificationsPushHandler {
  handle(req: {
    authorization: string | null;
    body: unknown;
  }): Promise<{ status: number; body: unknown }>;
}

export function createPostInternalNotificationsPushHandler(deps: {
  expectedSecret: string;
  notifications: Pick<NotificationsService, "pushToUser">;
}): PostInternalNotificationsPushHandler {
  return {
    async handle({ authorization, body }) {
      const auth = requireInternalSecret(authorization, deps.expectedSecret);
      if (!auth.authenticated) return auth.response;

      const req = parseBoundary(PostInternalNotificationsPushRequest, body ?? {});
      const result = await deps.notifications.pushToUser({
        userId: req.user_id,
        previewText: req.preview_text,
        messageId: req.message_id,
      });

      return {
        status: 200,
        body: parseBoundary(PostInternalNotificationsPushResponse, {
          delivered: result.delivered,
          device_count: result.deviceCount,
        }),
      };
    },
  };
}
