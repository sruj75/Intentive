# Agent Runtime Migrations

SQL migrations for the Runtime-owned Neon schema.

## Convention

- One file per migration, named `NNNN_short_description.sql` (zero-padded, sequential).
- Every table, index, and constraint is created inside the `agent_runtime` schema. Never the `public` schema, never the Control Plane's schema.
- Production schema and role provisioning are owned by the Runtime deploy/provisioning issue. Repo-layer tests bootstrap the schema on disposable Neon branches.

## Migrations

- `0001_sessions.sql` — durable Agent Instances plus the append-only Runtime event ledger (#28).
- `0002_conversation.sql` — durable `conversation_messages` transcript and Session Snapshot projection indexes (#29).
- `0003_runtime_turns.sql` — durable `runtime_turns` per-turn observability anchor (#36).
- `0004_runtime_turns_bundle_version.sql` — `bundle_version` stamp for each Runtime Turn (#37).
- `0005_runtime_events_user_created_at.sql` — `(user_id, created_at DESC)` index backing the Sensory Buffer latest-perception read (#38).
- `0006_cron_jobs.sql` — durable cron cards and due-fire selection state (#39).
- `0007_cron_runs.sql` — append-only cron fire outcome ledger (#39).
- `0008_agent_instances_client_tz.sql` — device-reported timezone for offline wall-clock Cron resolution (#39).
- `0009_deliveries.sql` — unified Companion message delivery attempt ledger (ADR-0028).
