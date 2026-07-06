# ADR 0034: Perception records are a Runtime projection with a search tool

## Status

Accepted.

## Context

`runtime_events` is the idempotent ingress ledger. It is good at dedupe and audit, but not at user-facing or model-facing screen search. The Desktop renovation introduces richer `perception_event` records and Screen Memory references, so the Agent Runtime needs a query surface without moving perception into Conversation History.

## Decision

Project newly inserted `perception_event` ingress into `agent_runtime.perception_records` in the same transaction as the ledger row. The projection stores artifact metadata, summary, signals, optional pgvector embedding, sensitivity label, retention class, confidence, and local record reference.

The first model-facing surface is `search_screen_context`, registered beside `post_message_back`. It performs FTS over summaries and returns compact records. Vector search is deferred until the desktop local embedding model and dimension are pinned.

## Consequences

- `RECENT_PERCEPTION` still reads the latest perception from the ledger through the Sensory Buffer.
- Older Screen Memory search uses `perception_records`, not the conversation transcript.
- Duplicates remain safe because both `runtime_events(user_id, kind, dedup_key)` and `perception_records(user_id, event_id)` are idempotent.
