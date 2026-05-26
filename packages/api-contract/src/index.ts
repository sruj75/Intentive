/**
 * @intentive/api-contract — Control Plane HTTP schemas.
 *
 * Public surface: client-facing endpoints, JWT-authenticated.
 * Internal surface: CP<->Agent Runtime endpoints, shared-secret authenticated.
 */

import { z } from "zod";

// ============================================================
// Shared primitives
// ============================================================

export const ClientKind = z.enum(["mobile", "desktop", "android"]);
export type ClientKind = z.infer<typeof ClientKind>;

export const PreChatGateKind = z.enum([
  "identity",
  "consent_primer",
  "capture_permission_setup",
  "sibling_client_invitation",
]);
export type PreChatGateKind = z.infer<typeof PreChatGateKind>;

// ============================================================
// PUBLIC API (client -> Control Plane)
// ============================================================

// ---------- GET /me ----------

export const GetMeRequest = z.object({});
export type GetMeRequest = z.infer<typeof GetMeRequest>;

export const AccountState = z.object({
  user_id: z.string(),
  next_gate: PreChatGateKind.nullable(),
  has_agent_instance: z.boolean(),
});
export type AccountState = z.infer<typeof AccountState>;

export const GetMeResponse = AccountState;
export type GetMeResponse = z.infer<typeof GetMeResponse>;

// ---------- GET /agent ----------

export const GetAgentRequest = z.object({});
export type GetAgentRequest = z.infer<typeof GetAgentRequest>;

export const GetAgentResponse = z.object({
  agent_instance_id: z.string(),
  ws_url: z.string().url(),
  runtime_jwt: z.string(),
});
export type GetAgentResponse = z.infer<typeof GetAgentResponse>;

// ---------- POST /consent ----------

export const PostConsentRequest = z.object({});
export type PostConsentRequest = z.infer<typeof PostConsentRequest>;

export const PostConsentResponse = z.object({ ok: z.literal(true) });
export type PostConsentResponse = z.infer<typeof PostConsentResponse>;

// ---------- POST /devices/register ----------

export const PostDeviceRegisterRequest = z.object({
  device_fingerprint: z.string(),
  client_kind: ClientKind,
  apns_token: z.string().optional(),
  fcm_token: z.string().optional(),
});
export type PostDeviceRegisterRequest = z.infer<typeof PostDeviceRegisterRequest>;

export const PostDeviceRegisterResponse = z.object({
  device_id: z.string(),
});
export type PostDeviceRegisterResponse = z.infer<typeof PostDeviceRegisterResponse>;

// ---------- POST /sibling-invitation/skip ----------

export const PostSiblingInvitationSkipRequest = z.object({});
export type PostSiblingInvitationSkipRequest = z.infer<
  typeof PostSiblingInvitationSkipRequest
>;

export const PostSiblingInvitationSkipResponse = z.object({
  ok: z.literal(true),
});
export type PostSiblingInvitationSkipResponse = z.infer<
  typeof PostSiblingInvitationSkipResponse
>;

// ============================================================
// INTERNAL API (Control Plane <-> Agent Runtime)
// ============================================================

// ---------- CP -> Agent Runtime: POST /internal/sessions/start ----------

export const PostInternalSessionsStartRequest = z.object({
  user_id: z.string(),
});
export type PostInternalSessionsStartRequest = z.infer<
  typeof PostInternalSessionsStartRequest
>;

export const PostInternalSessionsStartResponse = z.object({
  agent_instance_id: z.string(),
  ws_url: z.string().url(),
});
export type PostInternalSessionsStartResponse = z.infer<
  typeof PostInternalSessionsStartResponse
>;

// ---------- Agent Runtime -> CP: POST /internal/notifications/push ----------

export const PostInternalNotificationsPushRequest = z.object({
  user_id: z.string(),
  preview_text: z.string(),
  message_id: z.string(),
});
export type PostInternalNotificationsPushRequest = z.infer<
  typeof PostInternalNotificationsPushRequest
>;

export const PostInternalNotificationsPushResponse = z.object({
  delivered: z.boolean(),
  device_count: z.number().int().nonnegative(),
});
export type PostInternalNotificationsPushResponse = z.infer<
  typeof PostInternalNotificationsPushResponse
>;
