-- Migration 0003 — agent_runtime Runtime Turns (issue #36).
--
-- `runtime_turns` is the durable per-turn observability anchor. It is written
-- by the Runtime shell alongside the companion Conversation History append on
-- success, and alone on failure. Checkpoints stay owned by LangGraph's
-- PostgresSaver; this table stores only shell-visible turn metadata.

CREATE TABLE IF NOT EXISTS agent_runtime.runtime_turns (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL,
  thread_id  text        NOT NULL,
  trace_id   text,
  model      text        NOT NULL,
  status     text        NOT NULL CHECK (status IN ('ok', 'failed')),
  error      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runtime_turns_user_created_at
  ON agent_runtime.runtime_turns (user_id, created_at DESC);
