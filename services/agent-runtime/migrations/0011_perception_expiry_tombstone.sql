-- Migration 0011 — authoritative expiry, ambient audio, and tombstone support.
--
-- Slice 06 makes retention expiry authoritative on the Runtime: `search` never
-- returns a row past `expires_at`, and a `perception_tombstone` deletes only the
-- authenticated user's rows. `ambient_audio_summary` joins the artifact set so
-- passive audio (Slice 08) can synchronize compact summaries without a schema
-- change later.

ALTER TABLE agent_runtime.perception_records
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Backfill pre-slice development rows to the default 7-day retention so the
-- expiry filter has a value to compare against. Post-slice rows always carry an
-- authoritative `expires_at` from the client contract.
UPDATE agent_runtime.perception_records
  SET expires_at = captured_at + interval '7 days'
  WHERE expires_at IS NULL;

ALTER TABLE agent_runtime.perception_records
  DROP CONSTRAINT IF EXISTS perception_records_artifact_type_check;

ALTER TABLE agent_runtime.perception_records
  ADD CONSTRAINT perception_records_artifact_type_check CHECK (
    artifact_type IN (
      'searchable_screen_record',
      'focus_signal',
      'activity_summary',
      'ambient_audio_summary'
    )
  );

-- Expiry-aware retrieval: the hot path filters `user_id` + unexpired rows newest
-- first, so keep the composite index aligned with that predicate ordering.
CREATE INDEX IF NOT EXISTS perception_records_user_expires_at
  ON agent_runtime.perception_records (user_id, expires_at);
