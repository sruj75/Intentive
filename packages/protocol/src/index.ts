/**
 * @intentive/protocol — WebSocket message contract.
 *
 * Single source of truth for the Protocol between every Client and the
 * Agent Runtime. See packages/CONTEXT.md → "Protocol" and ARCHITECTURE.md.
 */

import { CLIENT_KINDS } from "@intentive/domain-types";
import { z } from "zod";

// ---------- Shared primitives ----------

// Derived from the canonical tuple in @intentive/domain-types — the single
// source of truth for Client Kinds across the wire packages.
export const ClientKind = z.enum(CLIENT_KINDS);
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

// A read request for the page of Conversation History older than `before_cursor`
// (the opaque cursor previously returned in a `session_snapshot`). The response
// reuses the `session_snapshot` shape — a backfill page is just a snapshot
// positioned further back. `limit` is an optional page size. See ADR-0006
// (Amendment: backfill is built in v1).
export const history_backfill_request = z
  .object({
    type: z.literal("history_backfill_request"),
    before_cursor: z.string().regex(/^\d+$/),
    limit: z.number().int().positive().optional(),
  })
  .strict();
export type HistoryBackfillRequest = z.infer<typeof history_backfill_request>;

export const clientToRuntimeEvent = z.discriminatedUnion("type", [
  connect,
  user_message,
  presence_update,
  delivery_ack,
  context_snapshot,
  session_end_marker,
  history_backfill_request,
]);
export type ClientToRuntimeEvent = z.infer<typeof clientToRuntimeEvent>;

// ---------- Runtime -> Client ----------

// A single uniform timeline entry in a reconnect Session Snapshot. This is a
// read projection of Conversation History, deliberately separate from the live
// `user_message`/`companion_message` wire events so the two contracts can
// evolve independently. See ADR-0037. `via_post_message_back` is always present
// and is `false` for user-authored entries.
export const session_message = z
  .object({
    message_id: z.string(),
    author: z.enum(["user", "companion"]),
    body: z.string(),
    at: z.string().datetime(),
    via_post_message_back: z.boolean(),
  })
  .strict();
export type SessionMessage = z.infer<typeof session_message>;

// Authoritative reconnect projection returned in `hello_ok`. `messages` holds
// the most recent entries (default 50) oldest-first; `before_cursor` is
// non-null when older history exists. See ADR-0037.
export const session_snapshot = z
  .object({
    messages: z.array(session_message),
    before_cursor: z.string().nullable(),
  })
  .strict();
export type SessionSnapshot = z.infer<typeof session_snapshot>;

export const hello_ok = z
  .object({
    type: z.literal("hello_ok"),
    session_snapshot: session_snapshot,
  })
  .strict();
export type HelloOk = z.infer<typeof hello_ok>;

// The response to a `history_backfill_request`: the page of Conversation History
// older than the requested cursor. It reuses the `session_snapshot` shape
// wholesale (a backfill page is just a snapshot positioned further back),
// embedding it under a `type` tag exactly as `hello_ok` does. See ADR-0006
// (Amendment: backfill is built in v1).
export const history_backfill_response = z
  .object({
    type: z.literal("history_backfill_response"),
    session_snapshot: session_snapshot,
  })
  .strict();
export type HistoryBackfillResponse = z.infer<typeof history_backfill_response>;

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

export const runtimeErrorCode = z.enum([
  "protocol_unsupported",
  "auth_failed",
  "invalid_connect",
  "service_unavailable",
]);
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
  history_backfill_response,
  companion_message,
  runtime_error,
]);
export type RuntimeToClientEvent = z.infer<typeof runtimeToClientEvent>;

// ---------- Parse-at-boundary helpers ----------

export * from "./parse.js";
