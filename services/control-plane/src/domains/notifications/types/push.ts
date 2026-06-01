/**
 * notifications domain — Push fan-out shapes. Typed against the shared internal
 * contract so the inbound `POST /internal/notifications/push` request/response
 * (user_id, preview_text, message_id → delivered, device_count) are validated by
 * monorepo typecheck. Behavior (APNs client, device-token resolution, fan-out)
 * lands in #49. APNs credentials and the inbound Directional Secret are read
 * from the config seam, never hardcoded.
 */
import type {
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
