-- Migration 0014 — durable one-time Agent Instance bootstrap lifecycle.
--
-- Session Start creates only the Agent Instance row. The first eligible
-- Opening Orientation moves this state to `in_progress`; the first successful
-- Interactive Turn after that opening moves it to `completed`.

ALTER TABLE agent_runtime.agent_instances
  ADD COLUMN IF NOT EXISTS bootstrap_status text
    NOT NULL
    DEFAULT 'pending'
    CHECK (bootstrap_status IN ('pending', 'in_progress', 'completed')),
  ADD COLUMN IF NOT EXISTS bootstrap_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS bootstrap_completed_at timestamptz;
