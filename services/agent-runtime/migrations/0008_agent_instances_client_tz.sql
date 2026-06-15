-- Migration 0008 — device-reported User timezone (issue #39).

ALTER TABLE agent_runtime.agent_instances
  ADD COLUMN IF NOT EXISTS client_tz text;
