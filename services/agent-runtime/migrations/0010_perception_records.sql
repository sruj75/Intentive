-- Migration 0010 — searchable perception records.
--
-- `runtime_events` remains the idempotent ingress ledger. This projection gives
-- the Runtime a queryable Screen Memory surface for prompt tools without making
-- Conversation History carry perception facts.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS agent_runtime.perception_records (
  id                 uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid             NOT NULL,
  event_id           text             NOT NULL,
  source_client      text             NOT NULL,
  artifact_type      text             NOT NULL CHECK (
    artifact_type IN ('searchable_screen_record', 'focus_signal', 'activity_summary')
  ),
  captured_at        timestamptz      NOT NULL,
  period_start       timestamptz      NOT NULL,
  period_end         timestamptz      NOT NULL,
  summary            text             NOT NULL,
  signals            jsonb            NOT NULL DEFAULT '{}'::jsonb,
  embedding_model_id text,
  embedding_dim      integer          CHECK (embedding_dim IS NULL OR embedding_dim > 0),
  embedding          vector,
  sensitivity_label  text             NOT NULL CHECK (
    sensitivity_label IN ('normal', 'sensitive', 'secret_detected')
  ),
  retention_class    text             NOT NULL,
  confidence         double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  local_record_ref   text             NOT NULL,
  created_at         timestamptz      NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS perception_records_user_captured_at
  ON agent_runtime.perception_records (user_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS perception_records_summary_fts
  ON agent_runtime.perception_records
  USING gin (to_tsvector('simple', summary));
