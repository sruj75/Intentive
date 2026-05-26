/**
 * @intentive/protocol — WebSocket message contract.
 *
 * Single source of truth for the wire format between every Client and the
 * Agent Runtime. See docs/CONTEXT.md → "Protocol" and docs/ARCHITECTURE.md
 * for the rule that this package is the only place these shapes are defined.
 *
 * Stubs below are illustrative — flesh out as `services/agent-runtime/` and
 * the clients begin to wire up. Do NOT redefine these shapes elsewhere.
 */

import { z } from "zod";

// ---------- Client identification ----------

export const ClientKind = z.enum(["mobile", "desktop", "android"]);
export type ClientKind = z.infer<typeof ClientKind>;

// ---------- Connect handshake ----------

export const ConnectFrame = z.object({
  type: z.literal("connect"),
  auth_token: z.string(),
  client_kind: ClientKind,
  client_version: z.string(),
  min_protocol: z.number().int().positive(),
  max_protocol: z.number().int().positive(),
});
export type ConnectFrame = z.infer<typeof ConnectFrame>;

export const HelloOk = z.object({
  type: z.literal("hello_ok"),
  negotiated_protocol: z.number().int().positive(),
  session_snapshot: z.unknown(), // shaped by `domain-types` once defined
});
export type HelloOk = z.infer<typeof HelloOk>;

// ---------- Inbound events (client → runtime) ----------

export const UserMessage = z.object({
  type: z.literal("user_message"),
  message_id: z.string(), // client-generated, used for idempotency on (user_id, message_id)
  body: z.string(),
  sent_at: z.string().datetime(),
});
export type UserMessage = z.infer<typeof UserMessage>;

export const PresenceUpdate = z.object({
  type: z.literal("presence_update"),
  foreground: z.boolean(),
});
export type PresenceUpdate = z.infer<typeof PresenceUpdate>;

export const DeliveryAck = z.object({
  type: z.literal("delivery_ack"),
  message_id: z.string(),
});
export type DeliveryAck = z.infer<typeof DeliveryAck>;

export const ContextSnapshot = z.object({
  type: z.literal("context_snapshot"),
  snapshot_id: z.string(),
  captured_at: z.string().datetime(),
  period_start: z.string().datetime(),
  period_end: z.string().datetime(),
  summary: z.string(), // sanitized prose; see Snapshot Privacy Boundary
});
export type ContextSnapshot = z.infer<typeof ContextSnapshot>;

export const SessionEndMarker = z.object({
  type: z.literal("session_end_marker"),
  ended_at: z.string().datetime(),
  reason: z.enum(["user_toggle", "quit", "crash"]),
});
export type SessionEndMarker = z.infer<typeof SessionEndMarker>;

export const InboundEvent = z.discriminatedUnion("type", [
  UserMessage,
  PresenceUpdate,
  DeliveryAck,
  ContextSnapshot,
  SessionEndMarker,
]);
export type InboundEvent = z.infer<typeof InboundEvent>;

// ---------- Outbound events (runtime → client) ----------

export const CompanionMessage = z.object({
  type: z.literal("companion_message"),
  message_id: z.string(),
  body: z.string(),
  emitted_at: z.string().datetime(),
  via_post_message_back: z.boolean(), // true → triggered a Push Notification if user not connected
});
export type CompanionMessage = z.infer<typeof CompanionMessage>;

export const OutboundEvent = z.discriminatedUnion("type", [
  CompanionMessage,
  // companion_typing, agent_state, etc. — add as runtime grows
]);
export type OutboundEvent = z.infer<typeof OutboundEvent>;
