# ADR 0034: Perception records are a Runtime projection with a search tool

## Status

Accepted; amended 2026-07-23 for Runtime-owned hybrid embeddings and safe
re-emission, and 2026-07-26 for Coaching Window evidence retrieval and
metadata-only ingress history.

## Context

`runtime_events` is the idempotent ingress ledger. It is good at dedupe and audit, but not at user-facing or model-facing screen search. The Desktop renovation introduces richer `perception_event` records and Screen Memory references, so the Agent Runtime needs a query surface without moving perception into Conversation History.

## Decision

Project newly inserted `perception_event` ingress into `agent_runtime.perception_records` in the same transaction as the ledger row. The projection stores artifact metadata, summary, signals, optional pgvector embedding, sensitivity label, retention class, confidence, and local record reference.

The first model-facing surface is `search_screen_context`, registered beside `post_message_back`. It performs FTS over summaries and Runtime-owned vector recall, returning compact records. Embedding enrichment is optional, out-of-transaction work and does not run on the Per-User Channel's collapsible Monitoring Turn lane.

A repeated `(user_id, event_id)` reconciles the current content and atomically clears the previous embedding when the artifact type, summary, or signals changed; an exact duplicate preserves its valid vector. Every successfully projected Perception Event can request fresh enrichment, including a duplicate-ledger re-emit. The eventual embedding write is a compare-and-set against the artifact type, summary, and signals used to compute it, so an older in-flight request cannot restore a secret-derived vector after redaction or other content replacement.

Projection privacy is monotonic for a stable event identity. Once a redacted
re-emission replaces detailed screen content, a delayed permitted duplicate
cannot restore the summary, signals, title, OCR, or sensitivity state. A
targeted or `clear_all` tombstone also wins over later redelivery of any older
ledgered event: projection admission compares typed ledger identity and
`ingest_seq`, while detailed Perception Event bodies remain absent from the
ledger. Before any asynchronous provider call, embedding enrichment re-reads an
unexpired candidate guarded by the exact current artifact type, summary, and
signals. A redacted-mismatched, tombstoned, or expired retry therefore never
reaches the embedding provider; the existing compare-and-set remains the final
write guard for changes after that read.

Monorepo ADR-0006 makes `perception_records`, not the immutable ingress ledger,
the only Runtime store for detailed perception bodies. New
`runtime_events(kind = 'perception_event')` rows retain only the metadata needed
for ordering and dedupe; the additive Coaching Window migration scrubs those
bodies from historical ledger rows after validating their current projection.

For Coaching Turns, the Runtime fixes a window-scoped upper cursor before model
execution and reads the oldest unconsumed eligible projection rows, capped at 32
events and 12,000 rendered characters. Retrieval uses the current projection so
expiry and tombstones remove evidence and redaction re-emits replace the
permitted representation. A successful turn advances its cursor only through
the last included event; failure consumes nothing. Legacy events without
`window_id` remain valid ingress but are ineligible for Coaching Turns.

## Consequences

- `RECENT_PERCEPTION` reads a bounded chronological, window-scoped progression
  from the current expiring projection; it never reads detailed bodies from the
  ledger.
- Older Screen Memory search uses `perception_records`, not the conversation transcript.
- Duplicates remain safe because both `runtime_events(user_id, kind, dedup_key)` and `perception_records(user_id, event_id)` are idempotent.
- Re-emitted content is FTS-only until its fresh vector lands; safety wins over temporarily preserving stale semantic recall.
- Expiry removes content from future Runtime retrieval, not from model-provider
  or Langfuse records already created under the selected Standard Tracing
  policy.
