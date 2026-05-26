/**
 * @intentive/api-contract — Control Plane HTTP schemas.
 *
 * See docs/CONTEXT.md → Control Plane, Internal API, Pre-Chat Gate, Routing.
 *
 * Public surface: client-facing endpoints, JWT-authenticated.
 * Internal surface: CP↔Agent Runtime endpoints, shared-secret authenticated.
 *
 * Stubs are illustrative — flesh out as services/control-plane/ wires up.
 */

import { z } from "zod";

// ============================================================
// PUBLIC API (client → Control Plane)
// ============================================================

// ---------- GET /me ----------

export const PreChatGateKind = z.enum([
  "identity",
  "consent_primer",
  "capture_permission_setup",
  "sibling_client_invitation",
]);
export type PreChatGateKind = z.infer<typeof PreChatGateKind>;

export const AccountState = z.object({
  user_id: z.string(),
  next_gate: PreChatGateKind.nullable(), // null → ready to enter chat
  has_agent_instance: z.boolean(),
});
export type AccountState = z.infer<typeof AccountState>;

export const GetMeResponse = AccountState;
export type GetMeResponse = z.infer<typeof GetMeResponse>;

// ---------- POST /consent ----------

export const PostConsentRequest = z.object({});
export const PostConsentResponse = z.object({ ok: z.literal(true) });

// ---------- POST /sibling-invitation/skip ----------

export const PostSiblingSkipRequest = z.object({});
export const PostSiblingSkipResponse = z.object({ ok: z.literal(true) });

// ---------- GET /agent ----------

export const GetAgentResponse = z.object({
  agent_instance_id: z.string(),
  ws_url: z.string().url(),
  runtime_jwt: z.string(), // short-lived; used on connect handshake
});
export type GetAgentResponse = z.infer<typeof GetAgentResponse>;

// ---------- POST /devices/register ----------

export const PostDeviceRegisterRequest = z.object({
  device_fingerprint: z.string(),
  client_kind: z.enum(["mobile", "desktop", "android"]),
  apns_token: z.string().optional(), // mobile only
  fcm_token: z.string().optional(), // android only, future
});
export const PostDeviceRegisterResponse = z.object({
  device_id: z.string(),
});

// ============================================================
// INTERNAL API (Agent Runtime → Control Plane, and vice versa)
// ============================================================

// ---------- CP → Agent Runtime: POST /internal/sessions/start ----------

export const InternalSessionsStartRequest = z.object({
  user_id: z.string(),
});
export const InternalSessionsStartResponse = z.object({
  agent_instance_id: z.string(),
  ws_url: z.string().url(),
});

// ---------- Agent Runtime → CP: POST /internal/notifications/push ----------

export const InternalNotificationsPushRequest = z.object({
  user_id: z.string(),
  preview_text: z.string(),
  message_id: z.string(), // idempotency: don't double-push the same Post-Message-Back
});
export const InternalNotificationsPushResponse = z.object({
  delivered: z.boolean(),
  device_count: z.number().int().nonnegative(),
});
