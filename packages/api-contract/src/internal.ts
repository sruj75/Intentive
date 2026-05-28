import { z } from "zod";

// ---------- CP -> Agent Runtime: POST /internal/sessions/start ----------

export const PostInternalSessionsStartRequest = z
  .object({
    user_id: z.string(),
  })
  .strict();
export type PostInternalSessionsStartRequest = z.infer<typeof PostInternalSessionsStartRequest>;

export const PostInternalSessionsStartResponse = z
  .object({
    agent_instance_id: z.string(),
    ws_url: z.string().url(),
  })
  .strict();
export type PostInternalSessionsStartResponse = z.infer<typeof PostInternalSessionsStartResponse>;

// ---------- Agent Runtime -> CP: POST /internal/notifications/push ----------

export const PostInternalNotificationsPushRequest = z
  .object({
    user_id: z.string(),
    preview_text: z.string(),
    message_id: z.string(),
  })
  .strict();
export type PostInternalNotificationsPushRequest = z.infer<
  typeof PostInternalNotificationsPushRequest
>;

export const PostInternalNotificationsPushResponse = z
  .object({
    delivered: z.boolean(),
    device_count: z.number().int().nonnegative(),
  })
  .strict();
export type PostInternalNotificationsPushResponse = z.infer<
  typeof PostInternalNotificationsPushResponse
>;
