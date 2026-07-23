# ADR 0034: Perception records are a Runtime projection with a search tool

## Status

Accepted; amended 2026-07-23 for Runtime-owned hybrid embeddings and safe re-emission.

## Context

`runtime_events` is the idempotent ingress ledger. It is good at dedupe and audit, but not at user-facing or model-facing screen search. The Desktop renovation introduces richer `perception_event` records and Screen Memory references, so the Agent Runtime needs a query surface without moving perception into Conversation History.

## Decision

Project newly inserted `perception_event` ingress into `agent_runtime.perception_records` in the same transaction as the ledger row. The projection stores artifact metadata, summary, signals, optional pgvector embedding, sensitivity label, retention class, confidence, and local record reference.

The first model-facing surface is `search_screen_context`, registered beside `post_message_back`. It performs FTS over summaries and Runtime-owned vector recall, returning compact records. Embedding enrichment is optional, out-of-transaction work and does not run on the Per-User Channel's collapsible Monitoring Turn lane.

A repeated `(user_id, event_id)` reconciles the current content and atomically clears the previous embedding when the artifact type, summary, or signals changed; an exact duplicate preserves its valid vector. Every successfully projected Perception Event can request fresh enrichment, including a duplicate-ledger re-emit. The eventual embedding write is a compare-and-set against the artifact type, summary, and signals used to compute it, so an older in-flight request cannot restore a secret-derived vector after redaction or other content replacement.

## Consequences

- `RECENT_PERCEPTION` still reads the latest perception from the ledger through the Sensory Buffer.
- Older Screen Memory search uses `perception_records`, not the conversation transcript.
- Duplicates remain safe because both `runtime_events(user_id, kind, dedup_key)` and `perception_records(user_id, event_id)` are idempotent.
- Re-emitted content is FTS-only until its fresh vector lands; safety wins over temporarily preserving stale semantic recall.
