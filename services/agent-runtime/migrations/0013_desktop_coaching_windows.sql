-- Migration 0013 — Desktop Coaching Window projection and window-scoped turns.
--
-- The Runtime remains always deployed, but Desktop-only v1 coaching is permitted
-- only inside one durable Coaching Window per User (monorepo ADR-0006). This is
-- lifecycle truth, not a Work-State Judgment.

CREATE TABLE IF NOT EXISTS agent_runtime.coaching_windows (
  user_id                 uuid        NOT NULL,
  window_id               uuid        NOT NULL,
  started_at              timestamptz NOT NULL,
  start_reason            text        NOT NULL CHECK (
    start_reason IN (
      'app_launch',
      'login_launch',
      'sign_in',
      'onboarding_completed',
      'system_wake',
      'user_resume',
      'permission_restored',
      'crash_recovery'
    )
  ),
  ended_at                timestamptz,
  end_reason              text        CHECK (
    end_reason IN (
      'pause',
      'system_sleep',
      'sign_out',
      'quit',
      'crash',
      'permission_lost',
      'superseded'
    )
  ),
  orientation_status      text        NOT NULL DEFAULT 'pending' CHECK (
    orientation_status IN ('pending', 'running', 'ready', 'completed')
  ),
  orientation_message_id  text        NOT NULL,
  orientation_claimed_at  timestamptz,
  orientation_completed_at timestamptz,
  start_ingest_seq        bigint,
  evidence_cursor         bigint,
  evidence_version        text,
  last_monitoring_turn_at timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, window_id),
  UNIQUE (user_id, orientation_message_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS coaching_windows_one_active_per_user
  ON agent_runtime.coaching_windows (user_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS coaching_windows_active_started_at
  ON agent_runtime.coaching_windows (started_at)
  WHERE ended_at IS NULL;

CREATE SEQUENCE IF NOT EXISTS agent_runtime.runtime_events_ingest_seq_seq;

ALTER TABLE agent_runtime.runtime_events
  ADD COLUMN IF NOT EXISTS ingest_seq bigint;

-- Install the writer default before the backfill. The supported runner keeps
-- this entire file atomic, and this ordering also protects a deliberately
-- quiesced/manual execution from admitting a new NULL cursor.
ALTER TABLE agent_runtime.runtime_events
  ALTER COLUMN ingest_seq SET DEFAULT nextval(
    'agent_runtime.runtime_events_ingest_seq_seq'
  );

-- Deterministically backfill the ordering cursor for historical arrivals.
WITH existing AS (
  SELECT COALESCE(max(ingest_seq), 0) AS max_seq
  FROM agent_runtime.runtime_events
),
numbered AS (
  SELECT
    id,
    existing.max_seq + row_number() OVER (ORDER BY created_at, id) AS ingest_seq
  FROM agent_runtime.runtime_events
  CROSS JOIN existing
  WHERE runtime_events.ingest_seq IS NULL
)
UPDATE agent_runtime.runtime_events AS event
SET ingest_seq = numbered.ingest_seq
FROM numbered
WHERE event.id = numbered.id;

SELECT setval(
  'agent_runtime.runtime_events_ingest_seq_seq',
  COALESCE(max(ingest_seq), 1),
  max(ingest_seq) IS NOT NULL
)
FROM agent_runtime.runtime_events;

ALTER SEQUENCE agent_runtime.runtime_events_ingest_seq_seq
  OWNED BY agent_runtime.runtime_events.ingest_seq;

ALTER TABLE agent_runtime.runtime_events
  ALTER COLUMN ingest_seq SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS runtime_events_ingest_seq
  ON agent_runtime.runtime_events (ingest_seq);

CREATE INDEX IF NOT EXISTS runtime_events_user_kind_cursor
  ON agent_runtime.runtime_events (user_id, kind, ingest_seq);

ALTER TABLE agent_runtime.coaching_windows
  ADD COLUMN IF NOT EXISTS start_ingest_seq bigint;

-- Bind active-window precedence to Runtime arrival order, not retransmission
-- order or a client clock. This also makes a partially applied pre-release
-- schema fail closed if it somehow contains a window without its ledger marker.
UPDATE agent_runtime.coaching_windows AS window
SET start_ingest_seq = event.ingest_seq
FROM agent_runtime.runtime_events AS event
WHERE window.start_ingest_seq IS NULL
  AND event.user_id = window.user_id
  AND event.kind = 'coaching_window_started'
  AND event.dedup_key = window.window_id::text;

ALTER TABLE agent_runtime.coaching_windows
  ALTER COLUMN start_ingest_seq SET NOT NULL;

ALTER TABLE agent_runtime.perception_records
  ADD COLUMN IF NOT EXISTS window_id uuid;

CREATE INDEX IF NOT EXISTS perception_records_window_event
  ON agent_runtime.perception_records (user_id, window_id, event_id)
  WHERE window_id IS NOT NULL;

ALTER TABLE agent_runtime.conversation_messages
  ADD COLUMN IF NOT EXISTS window_id uuid;

ALTER TABLE agent_runtime.deliveries
  ADD COLUMN IF NOT EXISTS window_id uuid;

ALTER TABLE agent_runtime.runtime_turns
  ADD COLUMN IF NOT EXISTS window_id uuid,
  ADD COLUMN IF NOT EXISTS trigger text,
  ADD COLUMN IF NOT EXISTS evidence_cursor_start bigint,
  ADD COLUMN IF NOT EXISTS evidence_cursor_end bigint,
  ADD COLUMN IF NOT EXISTS evidence_version text;
