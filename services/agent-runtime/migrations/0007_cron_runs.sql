-- Migration 0007 — Cron run records (issue #39).

CREATE TABLE IF NOT EXISTS agent_runtime.cron_runs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  cron_job_id uuid        NOT NULL,
  thread_id   text        NOT NULL,
  trigger     text        NOT NULL,
  status      text        NOT NULL CHECK (status IN ('ok', 'failed')),
  error       text,
  attempt     int         NOT NULL,
  fired_at    timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cron_runs_user_created_at
  ON agent_runtime.cron_runs (user_id, created_at DESC);
