/**
 * notifications domain — Push fan-out shapes. Typed against the shared internal
 * contract so the inbound notification request/response shapes are validated by
 * monorepo typecheck. Expo sender config and the inbound Directional Secrets are
 * read from the config seam, never hardcoded.
 */
import type {
  PostInternalNotificationsCheckReceiptsRequest,
  PostInternalNotificationsCheckReceiptsResponse,
  PostInternalNotificationsPushRequest,
  PostInternalNotificationsPushResponse,
} from "@intentive/api-contract";

export const notificationsPushRequestSample: PostInternalNotificationsPushRequest = {
  user_id: "user_stub",
  preview_text: "Your Companion has an update.",
  message_id: "message_stub",
};

export const notificationsPushResponseSample: PostInternalNotificationsPushResponse = {
  delivered: false,
  device_count: 0,
};

export const notificationsCheckReceiptsRequestSample: PostInternalNotificationsCheckReceiptsRequest =
  {
    limit: 100,
  };

export const notificationsCheckReceiptsResponseSample: PostInternalNotificationsCheckReceiptsResponse =
  {
    checked: 0,
    cleared: 0,
  };
