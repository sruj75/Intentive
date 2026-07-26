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

export const clientCapability = z.enum(["desktop_coaching_v1"]);
export type ClientCapability = z.infer<typeof clientCapability>;

// ---------- Client -> Runtime ----------

export const connect = z
  .object({
    type: z.literal("connect"),
    auth_token: z.string(),
    client_kind: ClientKind,
    client_version: z.string(),
    client_tz: z
      .string()
      .refine(isValidIanaTimezone, "client_tz must be an IANA timezone")
      .optional(),
    capabilities: z.array(clientCapability).optional(),
  })
  .strict();
export type Connect = z.infer<typeof connect>;

const runtimeOwnedMessageIdPrefixes = ["opening:", "intervention:"] as const;

export function isRuntimeOwnedMessageId(messageId: string): boolean {
  return runtimeOwnedMessageIdPrefixes.some((prefix) => messageId.startsWith(prefix));
}

export const user_message = z
  .object({
    type: z.literal("user_message"),
    message_id: z
      .string()
      .refine(
        (messageId) => !isRuntimeOwnedMessageId(messageId),
        "User messages cannot use Runtime-owned message IDs.",
      ),
    body: z.string(),
    sent_at: z.string().datetime(),
    window_id: z.string().uuid().optional(),
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

export const perceptionArtifactType = z.enum([
  "searchable_screen_record",
  "focus_signal",
  "activity_summary",
  "ambient_audio_summary",
]);
export type PerceptionArtifactType = z.infer<typeof perceptionArtifactType>;

export const perceptionSensitivityLabel = z.enum(["normal", "sensitive", "secret_detected"]);
export type PerceptionSensitivityLabel = z.infer<typeof perceptionSensitivityLabel>;

export const perceptionEmbeddingRef = z
  .object({
    model_id: z.string().min(1),
    dim: z.number().int().positive(),
    vector: z.array(z.number().finite()),
  })
  .strict()
  .refine((embedding) => embedding.vector.length === embedding.dim, {
    message: "embedding_ref.vector length must match dim",
    path: ["vector"],
  });
export type PerceptionEmbeddingRef = z.infer<typeof perceptionEmbeddingRef>;

// The strict signal payload for a `searchable_screen_record`, discriminated on
// `content_redacted`. This is a privacy contract, not a convenience: it names
// exactly what screen text may leave the Mac.
//   - permitted (`content_redacted: false`): bundle id, app name, window title,
//     and OCR text. The Runtime may index and embed all of it.
//   - secret-detected (`content_redacted: true`): bundle id and app name only.
//     Window title and OCR text are absent, and the event carries no
//     `embedding_ref` (enforced by `perception_event` below).
// Every other artifact type keeps its own artifact-specific signal object; only
// `searchable_screen_record` is constrained here.
export const searchableScreenRecordSignals = z.discriminatedUnion("content_redacted", [
  z
    .object({
      content_redacted: z.literal(false),
      bundle_id: z.string().min(1),
      app_name: z.string().min(1),
      window_title: z.string(),
      ocr_text: z.string(),
    })
    .strict(),
  z
    .object({
      content_redacted: z.literal(true),
      bundle_id: z.string().min(1),
      app_name: z.string().min(1),
    })
    .strict(),
]);
export type SearchableScreenRecordSignals = z.infer<typeof searchableScreenRecordSignals>;

// The bare `perception_event` object. It is the discriminated-union member (Zod
// requires plain objects there), while the exported `perception_event` below
// layers the searchable-screen redaction refinement on top. The union applies
// the same refinement so both paths enforce it (see `clientToRuntimeEvent`).
const perceptionEventFields = z
  .object({
    type: z.literal("perception_event"),
    // Stable per-artifact UUID: the Runtime's dedup key and the value echoed back
    // in `runtime_ingress_ack.ingress_id`.
    event_id: z.string().uuid(),
    // New Desktop Coaching evidence binds to its Coaching Window. Optional on
    // the wire so already-queued legacy Perception Events still ingest and ack.
    window_id: z.string().uuid().optional(),
    source_client: ClientKind,
    captured_at: z.string().datetime(),
    period_start: z.string().datetime(),
    period_end: z.string().datetime(),
    artifact_type: perceptionArtifactType,
    summary: z.string(),
    // For `searchable_screen_record` this must be a `searchableScreenRecordSignals`
    // shape (enforced by the refinement below). Other artifact types keep their
    // own artifact-specific signal objects, so the base stays an open record.
    signals: z.record(z.unknown()),
    embedding_ref: perceptionEmbeddingRef.optional(),
    sensitivity_label: perceptionSensitivityLabel,
    retention_class: z.string().min(1),
    confidence: z.number().min(0).max(1),
    // Retention expiry is authoritative and required: the Runtime enforces it on
    // read (never returns an expired row) and Desktop drops already-expired
    // records before they are ever sent. See docs/adr and the renovation plan.
    expires_at: z.string().datetime(),
    // Opaque local record UUID — never a filesystem path. The Runtime stores it
    // to correlate tombstones and never dereferences it.
    local_record_ref: z.string().uuid(),
  })
  .strict();

// Enforces the searchable-screen privacy contract as a cross-field refinement:
// screen records carry the strict `searchableScreenRecordSignals` shape, and a
// redacted record is exactly a secret-detected one that never embeds. Shared by
// the standalone schema and the inbound union so both paths reject the same way.
function refineSearchableScreenRecord(
  event: z.infer<typeof perceptionEventFields>,
  ctx: z.RefinementCtx,
): void {
  if (event.artifact_type !== "searchable_screen_record") return;
  const parsed = searchableScreenRecordSignals.safeParse(event.signals);
  if (!parsed.success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["signals"],
      message: "searchable_screen_record signals must be the permitted or redacted shape",
    });
    return;
  }
  if (parsed.data.content_redacted) {
    if (event.sensitivity_label !== "secret_detected") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sensitivity_label"],
        message: "redacted searchable_screen_record must be labelled secret_detected",
      });
    }
    if (event.embedding_ref !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["embedding_ref"],
        message: "redacted searchable_screen_record must not carry an embedding_ref",
      });
    }
  } else if (event.sensitivity_label === "secret_detected") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["signals", "content_redacted"],
      message: "secret_detected searchable_screen_record must set content_redacted: true",
    });
  }
}

export const perception_event = perceptionEventFields.superRefine(refineSearchableScreenRecord);
export type PerceptionEvent = z.infer<typeof perceptionEventFields>;

// Why a perception record is being deleted. `clear_all` wipes every row for the
// authenticated user; `manual_delete` and `retention_expiry` name the specific
// `event_id`s in `event_refs`. The Runtime deletes only the authenticated user's
// rows (tenant-scoped) and treats redelivery as idempotent.
export const perceptionTombstoneReason = z.enum(["manual_delete", "retention_expiry", "clear_all"]);
export type PerceptionTombstoneReason = z.infer<typeof perceptionTombstoneReason>;

export const perception_tombstone = z
  .object({
    type: z.literal("perception_tombstone"),
    // Stable UUID: the Runtime's dedup key and the value echoed back in
    // `runtime_ingress_ack.ingress_id`.
    tombstone_id: z.string().uuid(),
    reason: perceptionTombstoneReason,
    // The `event_id`s to delete. Empty (and ignored) when `reason` is
    // `clear_all`; the Runtime enforces that semantic on ingest.
    event_refs: z.array(z.string().uuid()),
    emitted_at: z.string().datetime(),
  })
  .strict();
export type PerceptionTombstone = z.infer<typeof perception_tombstone>;

export const session_end_marker = z
  .object({
    type: z.literal("session_end_marker"),
    // Stable UUID for this end-of-session marker: the Runtime's dedup key and the
    // value echoed back in `runtime_ingress_ack.ingress_id`. For a `crash`
    // marker it is preallocated in the session lock so an unclean prior session
    // finalizes to exactly one idempotent marker on next launch.
    marker_id: z.string().uuid(),
    // The local sensing interval this marker closes. A fresh sensor run
    // allocates a new `session_id`; markers never span intervals.
    session_id: z.string().uuid(),
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

export const coachingWindowStartReason = z.enum([
  "app_launch",
  "login_launch",
  "sign_in",
  "onboarding_completed",
  "system_wake",
  "user_resume",
  "permission_restored",
  "crash_recovery",
]);
export type CoachingWindowStartReason = z.infer<typeof coachingWindowStartReason>;

export const coaching_window_started = z
  .object({
    type: z.literal("coaching_window_started"),
    window_id: z.string().uuid(),
    started_at: z.string().datetime(),
    reason: coachingWindowStartReason,
  })
  .strict();
export type CoachingWindowStarted = z.infer<typeof coaching_window_started>;

export const coachingWindowEndReason = z.enum([
  "pause",
  "system_sleep",
  "sign_out",
  "quit",
  "crash",
  "permission_lost",
]);
export type CoachingWindowEndReason = z.infer<typeof coachingWindowEndReason>;

export const coaching_window_ended = z
  .object({
    type: z.literal("coaching_window_ended"),
    window_id: z.string().uuid(),
    ended_at: z.string().datetime(),
    reason: coachingWindowEndReason,
  })
  .strict();
export type CoachingWindowEnded = z.infer<typeof coaching_window_ended>;

export const coachingWindowPresenceState = z.enum(["active", "locked"]);
export type CoachingWindowPresenceState = z.infer<typeof coachingWindowPresenceState>;

export const coaching_window_presence = z
  .object({
    type: z.literal("coaching_window_presence"),
    window_id: z.string().uuid(),
    state: coachingWindowPresenceState,
    changed_at: z.string().datetime(),
  })
  .strict();
export type CoachingWindowPresence = z.infer<typeof coaching_window_presence>;

export const clientToRuntimeEvent = z
  .discriminatedUnion("type", [
    connect,
    user_message,
    presence_update,
    delivery_ack,
    perceptionEventFields,
    perception_tombstone,
    session_end_marker,
    history_backfill_request,
    coaching_window_started,
    coaching_window_ended,
    coaching_window_presence,
  ])
  .superRefine((event, ctx) => {
    if (event.type === "perception_event") {
      refineSearchableScreenRecord(event, ctx);
    }
  });
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
    // Present only for live Opening Orientations and proactive Coaching Window
    // interventions; ordinary replies and reconnect projections omit it.
    window_id: z.string().uuid().optional(),
    body: z.string(),
    emitted_at: z.string().datetime(),
    via_post_message_back: z.boolean(),
  })
  .strict();
export type CompanionMessage = z.infer<typeof companion_message>;

// Durable-ingress acknowledgement. The Runtime emits exactly one of these per
// stateful ingress item (`perception_event`, `perception_tombstone`,
// `session_end_marker`) *after* the event ledger and projection transaction
// commits — never before, and independent of any turn or model completion. A
// redelivered item that the ledger dedupes still receives the same
// commit-equivalent acknowledgement, so a lost ack simply becomes
// reconnect → redeliver → dedupe → repeated ack. Desktop keeps the item in its
// durable outbox until this arrives. See the renovation plan, item 1.
export const runtimeIngressKind = z.enum([
  "perception_event",
  "perception_tombstone",
  "session_end_marker",
  "coaching_window_started",
  "coaching_window_ended",
]);
export type RuntimeIngressKind = z.infer<typeof runtimeIngressKind>;

export const runtime_ingress_ack = z
  .object({
    type: z.literal("runtime_ingress_ack"),
    ingress_kind: runtimeIngressKind,
    // The stable UUID of the acknowledged item: `event_id`, `tombstone_id`,
    // the session marker's `marker_id`, or a lifecycle event's `window_id`.
    // Start/end share that UUID; `ingress_kind` keeps their identities distinct.
    ingress_id: z.string().uuid(),
  })
  .strict();
export type RuntimeIngressAck = z.infer<typeof runtime_ingress_ack>;

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
  runtime_ingress_ack,
  runtime_error,
]);
export type RuntimeToClientEvent = z.infer<typeof runtimeToClientEvent>;

function isValidIanaTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

// ---------- Parse-at-boundary helpers ----------

export * from "./parse.js";
