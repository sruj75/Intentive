/**
 * @intentive/protocol — WebSocket message contract.
 *
 * Single source of truth for the wire format between every Client and the
 * Agent Runtime. See docs/CONTEXT.md → "Protocol" and docs/ARCHITECTURE.md.
 */

import { z } from "zod";

// ---------- Shared primitives ----------

export const ClientKind = z.enum(["mobile", "desktop", "android"]);
export type ClientKind = z.infer<typeof ClientKind>;

// ---------- Client -> Runtime ----------

export const connect = z
  .object({
    type: z.literal("connect"),
    auth_token: z.string(),
    client_kind: ClientKind,
    client_version: z.string(),
  })
  .strict();
export type Connect = z.infer<typeof connect>;

export const user_message = z
  .object({
    type: z.literal("user_message"),
    message_id: z.string(),
    body: z.string(),
    sent_at: z.string().datetime(),
  })
  .strict();
export type UserMessage = z.infer<typeof user_message>;

export const presence_update = z
  .object({
    type: z.literal("presence_update"),
    foreground: z.boolean(),
  })
  .strict();
export type PresenceUpdate = z.infer<typeof presence_update>;

export const delivery_ack = z
  .object({
    type: z.literal("delivery_ack"),
    message_id: z.string(),
  })
  .strict();
export type DeliveryAck = z.infer<typeof delivery_ack>;

export const context_snapshot = z
  .object({
    type: z.literal("context_snapshot"),
    snapshot_id: z.string(),
    captured_at: z.string().datetime(),
    period_start: z.string().datetime(),
    period_end: z.string().datetime(),
    summary: z.string(),
  })
  .strict();
export type ContextSnapshot = z.infer<typeof context_snapshot>;

export const session_end_marker = z
  .object({
    type: z.literal("session_end_marker"),
    ended_at: z.string().datetime(),
    reason: z.enum(["user_toggle", "quit", "crash"]),
  })
  .strict();
export type SessionEndMarker = z.infer<typeof session_end_marker>;

export const clientToRuntimeEvent = z.discriminatedUnion("type", [
  connect,
  user_message,
  presence_update,
  delivery_ack,
  context_snapshot,
  session_end_marker,
]);
export type ClientToRuntimeEvent = z.infer<typeof clientToRuntimeEvent>;

// ---------- Runtime -> Client ----------

export const hello_ok = z
  .object({
    type: z.literal("hello_ok"),
    session_snapshot: z.unknown(),
  })
  .strict();
export type HelloOk = z.infer<typeof hello_ok>;

export const companion_message = z
  .object({
    type: z.literal("companion_message"),
    message_id: z.string(),
    body: z.string(),
    emitted_at: z.string().datetime(),
    via_post_message_back: z.boolean(),
  })
  .strict();
export type CompanionMessage = z.infer<typeof companion_message>;

export const runtimeErrorCode = z.enum(["protocol_unsupported", "auth_failed", "invalid_connect"]);
export type RuntimeErrorCode = z.infer<typeof runtimeErrorCode>;

export const runtime_error = z
  .object({
    type: z.literal("runtime_error"),
    code: runtimeErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
  })
  .strict();
export type RuntimeError = z.infer<typeof runtime_error>;

export const runtimeToClientEvent = z.discriminatedUnion("type", [
  hello_ok,
  companion_message,
  runtime_error,
]);
export type RuntimeToClientEvent = z.infer<typeof runtimeToClientEvent>;
