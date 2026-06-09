-- Migration 0001 — agent_runtime sessions and event ledger (issue #28).
--
-- `agent_instances` is the durable one-logical-instance-per-User registry.
-- `runtime_events` is an append-only idempotency ledger, not a job queue: no
-- status, no claiming, no retry columns. Per-User ordering lives in the
-- single-process in-memory queue; duplicate suppression lives in the unique
-- constraint on (user_id, kind, dedup_key).
--
-- Production provisioning owns the `agent_runtime` schema and role/grants. This
-- migration creates only its own objects inside that schema.

CREATE TABLE IF NOT EXISTS agent_runtime.agent_instances (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL UNIQUE,
  auth_subject text        NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_runtime.runtime_events (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL,
  kind       text        NOT NULL,
  dedup_key  text        NOT NULL,
  payload    jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, dedup_key)
);
