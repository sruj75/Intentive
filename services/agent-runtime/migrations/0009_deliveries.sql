-- Migration 0009 — unified Companion message delivery ledger (ADR-0028).

CREATE TABLE IF NOT EXISTS agent_runtime.deliveries (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL,
  message_id   text        NOT NULL,
  path         text        NOT NULL CHECK (path IN ('stream', 'push')),
  client_kind  text,
  status       text        NOT NULL CHECK (status IN ('ok', 'failed')),
  error        text,
  attempted_at timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deliveries_user_created_at
  ON agent_runtime.deliveries (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS deliveries_message
  ON agent_runtime.deliveries (user_id, message_id);
