import {
  PostInternalNotificationsCheckReceiptsRequest,
  PostInternalNotificationsCheckReceiptsResponse,
  parseBoundary,
} from "@intentive/api-contract";

import { requireInternalSecret } from "../../../http/auth.js";
import type { NotificationsService } from "../service/notifications-service.js";

export interface PostInternalNotificationsCheckReceiptsHandler {
  handle(req: {
    authorization: string | null;
    body: unknown;
  }): Promise<{ status: number; body: unknown }>;
}

export function createPostInternalNotificationsCheckReceiptsHandler(deps: {
  expectedSecret: string;
  notifications: Pick<NotificationsService, "checkPendingReceipts">;
}): PostInternalNotificationsCheckReceiptsHandler {
  return {
    async handle({ authorization, body }) {
      const auth = requireInternalSecret(authorization, deps.expectedSecret);
      if (!auth.authenticated) return auth.response;

      const req = parseBoundary(PostInternalNotificationsCheckReceiptsRequest, body ?? {});
      const result = await deps.notifications.checkPendingReceipts({ limit: req.limit });

      return {
        status: 200,
        body: parseBoundary(PostInternalNotificationsCheckReceiptsResponse, result),
      };
    },
  };
}
