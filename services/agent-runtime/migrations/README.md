# Agent Runtime Migrations

SQL migrations for the Runtime-owned Neon schema.

## Convention

- One file per migration, named `NNNN_short_description.sql` (zero-padded, sequential).
- The migration runner submits every file as one ordered database transaction.
  Never paste the statements piecemeal: migration 0013 relies on its
  `ALTER TABLE` lock remaining held through cursor backfill and `NOT NULL`.
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
- `0010_perception_records.sql` — searchable Screen Memory projection.
- `0011_perception_expiry_tombstone.sql` — authoritative perception expiry and tombstones.
- `0012_perception_structured_screen_fields.sql` — permitted searchable-screen fields.
- `0013_desktop_coaching_windows.sql` — additive Coaching Window projection plus
  nullable window identity and evidence metadata on
  perception/conversation/delivery/turn rows. This migration is schema-only so
  it is safe to apply before the projection-backed Runtime image is deployed
  when run atomically through `pnpm migrate`. If the operator cannot use the
  atomic runner, Runtime ingress must be quiesced for the entire migration.
- `0014_agent_instance_bootstrap_lifecycle.sql` — durable
  `pending → in_progress → completed` one-time personalization state on each
  Agent Instance.

Historical perception-ledger bodies are removed only after that image is
healthy. Run `node scripts/scrub-perception-ledger.mjs` for a dry-run report,
review the projection-safety counts, then run it again with `--apply`. The
apply path locks and fails closed if any detailed ledger event lacks a safe
current projection; it is deliberately not part of migration 0013.
