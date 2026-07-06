# ADR 0005: Perception Event replaces Context Snapshot in the shared Protocol

## Status

Accepted.

## Context

The original Desktop Client Protocol shape used `context_snapshot`: a thin summary window with `snapshot_id`, timestamps, and summary. The SwiftPM desktop renovation needs a richer, explicit perception envelope before the Runtime Bridge and Screen Memory compiler land. The old Tauri producer is gone from production, Mobile never produced `context_snapshot`, and the monorepo keeps one live Protocol shape.

## Decision

Replace `context_snapshot` with `perception_event` in `packages/protocol`. A `perception_event` is idempotent by `event_id` and carries:

- source client
- capture period
- artifact type
- summary and structured signals
- optional local embedding reference/vector
- sensitivity label
- retention class
- confidence
- local Screen Memory record reference

`session_end_marker` stays distinct.

## Consequences

- Runtime ingestion dedupes perception by `event_id`, not `snapshot_id`.
- The Runtime can project perception into a searchable store without putting it in Conversation History.
- Desktop Swift codables must consume the committed JSON fixtures under `packages/protocol/test/fixtures/`.
