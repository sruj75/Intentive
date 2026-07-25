-- Migration 0012 — structured searchable-screen fields and permitted-text FTS.
--
-- Renovation item 1: a `searchable_screen_record` now carries its permitted text
-- as first-class columns rather than an opaque `signals` blob, so FTS can index
-- the complete permitted set (summary + app name + window title + OCR) instead
-- of the summary alone. Secret-detected rows carry only app identity: their
-- `window_title`/`ocr_text` stay NULL and `content_redacted` is true, so the
-- FTS expression below naturally reduces to summary + app identity for them and
-- their secret text is never indexed. Other artifact types leave these NULL.

ALTER TABLE agent_runtime.perception_records
  ADD COLUMN IF NOT EXISTS bundle_id        text,
  ADD COLUMN IF NOT EXISTS app_name         text,
  ADD COLUMN IF NOT EXISTS window_title     text,
  ADD COLUMN IF NOT EXISTS ocr_text         text,
  ADD COLUMN IF NOT EXISTS content_redacted boolean NOT NULL DEFAULT false;

-- Backfill the old loose app-name signal (`signals->>'app'`) into `app_name`
-- where it exists. Window title and OCR text were never carried structurally
-- before this slice, so they remain NULL — unavailable, not empty.
UPDATE agent_runtime.perception_records
  SET app_name = signals->>'app'
  WHERE artifact_type = 'searchable_screen_record'
    AND app_name IS NULL
    AND signals ? 'app';

-- Permitted-text FTS: index summary plus app identity, window title, and OCR.
-- Redacted rows have NULL title/OCR, so this indexes only their summary and app
-- identity. The `search` query ranks against this same expression.
DROP INDEX IF EXISTS agent_runtime.perception_records_summary_fts;

CREATE INDEX IF NOT EXISTS perception_records_permitted_fts
  ON agent_runtime.perception_records
  USING gin (
    to_tsvector(
      'simple',
      summary
        || ' ' || coalesce(app_name, '')
        || ' ' || coalesce(window_title, '')
        || ' ' || coalesce(ocr_text, '')
    )
  );
