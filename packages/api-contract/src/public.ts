import { z } from "zod";

import { ClientKind, PreChatGateKind } from "./shared.js";

// ---------- GET /me ----------

export const GetMeRequest = z.object({}).strict();
export type GetMeRequest = z.infer<typeof GetMeRequest>;

export const AccountState = z
  .object({
    user_id: z.string(),
    next_gate: PreChatGateKind.nullable(),
    has_agent_instance: z.boolean(),
  })
  .strict();
export type AccountState = z.infer<typeof AccountState>;

export const GetMeResponse = AccountState;
export type GetMeResponse = z.infer<typeof GetMeResponse>;

// ---------- GET /agent ----------

export const GetAgentRequest = z.object({}).strict();
export type GetAgentRequest = z.infer<typeof GetAgentRequest>;

export const GetAgentResponse = z
  .object({
    agent_instance_id: z.string(),
    ws_url: z.string().url(),
    runtime_jwt: z.string(),
  })
  .strict();
export type GetAgentResponse = z.infer<typeof GetAgentResponse>;

// ---------- POST /consent ----------

export const PostConsentRequest = z.object({}).strict();
export type PostConsentRequest = z.infer<typeof PostConsentRequest>;

export const PostConsentResponse = z.object({ ok: z.literal(true) }).strict();
export type PostConsentResponse = z.infer<typeof PostConsentResponse>;

// ---------- POST /devices/register ----------

export const PostDeviceRegisterRequest = z
  .object({
    device_fingerprint: z.string(),
    client_kind: ClientKind,
    apns_token: z.string().optional(),
    fcm_token: z.string().optional(),
  })
  .strict();
export type PostDeviceRegisterRequest = z.infer<typeof PostDeviceRegisterRequest>;

export const PostDeviceRegisterResponse = z
  .object({
    device_id: z.string(),
  })
  .strict();
export type PostDeviceRegisterResponse = z.infer<typeof PostDeviceRegisterResponse>;

// ---------- POST /sibling-invitation/skip ----------

export const PostSiblingInvitationSkipRequest = z.object({}).strict();
export type PostSiblingInvitationSkipRequest = z.infer<typeof PostSiblingInvitationSkipRequest>;

export const PostSiblingInvitationSkipResponse = z
  .object({
    ok: z.literal(true),
  })
  .strict();
export type PostSiblingInvitationSkipResponse = z.infer<typeof PostSiblingInvitationSkipResponse>;
