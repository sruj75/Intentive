import { z } from "zod";

import { ClientKind, PreChatGateKind } from "./shared.js";

// ---------- GET /me ----------

export const GetMeRequest = z.object({}).strict();
export type GetMeRequest = z.infer<typeof GetMeRequest>;

// The device/client signal a Client sends on `GET /me` so the Control Plane can
// compute Device-Local Gates for the *calling device*, not just the User
// (control-plane ADR-0005). Carried as request headers (`X-Client-Kind`,
// `X-Capture-Permission-Granted`) and parsed at the boundary into this shape.
//
// Both fields are optional by design: an unregistered or legacy caller sends
// neither and degrades to the cross-client-only gate sequence. `client_kind`
// branches the sequence; `capture_permission_granted` is the Desktop's *live*
// macOS Screen-Recording status (the Control Plane stores no copy of it). The
// header arrives as the string `"true"`/`"false"` and is coerced to a boolean
// here so the gate sequencer reasons over a real boolean.
export const GetMeDeviceSignal = z
  .object({
    client_kind: ClientKind.optional(),
    capture_permission_granted: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
  })
  .strict();
export type GetMeDeviceSignal = z.infer<typeof GetMeDeviceSignal>;

export const AccountState = z
  .object({
    user_id: z.string(),
    next_gate: PreChatGateKind.nullable(),
    has_agent_instance: z.boolean(),
    // Registered/present in the Control Plane Device Registry, not live session
    // state. Mobile uses this only for capability-honest setup promotion.
    has_desktop_client: z.boolean(),
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
    expo_push_token: z.string().optional(),
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
