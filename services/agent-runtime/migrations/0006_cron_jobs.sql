-- Migration 0006 — Cron jobs (issue #39).
--
-- `cron_jobs.next_fire_at` is a real indexed column so the scheduler's due scan
-- is one indexed query over active jobs.

CREATE TABLE IF NOT EXISTS agent_runtime.cron_jobs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL,
  path          text        NOT NULL,
  name          text        NOT NULL,
  schedule_kind text        NOT NULL CHECK (schedule_kind IN ('at', 'every', 'cron')),
  schedule_expr text        NOT NULL,
  tz            text,
  status        text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  next_fire_at  timestamptz,
  prompt        text        NOT NULL,
  attempt_count int         NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, path),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS cron_jobs_due
  ON agent_runtime.cron_jobs (next_fire_at)
  WHERE status = 'active';
