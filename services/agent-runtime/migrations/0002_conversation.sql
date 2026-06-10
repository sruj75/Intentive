-- Migration 0002 — agent_runtime Conversation History (issue #29).
--
-- `conversation_messages` is the durable, server-truth transcript and the basis
-- for the reconnect Session Snapshot. It is a different concern from the
-- `runtime_events` ledger (#28): that ledger hides ordering + idempotency of
-- *inbound arrivals*; this table hides how the *readable transcript* renders.
-- Same storage family, different domains. See ADR-0008.
--
-- `seq` (a global, database-assigned monotonic identity) is the stable total
-- sort order and the cursor basis — equal `at` values never tie. `at` is the
-- server record time (when the Runtime durably accepted the message), used for
-- display only, never the client's `sent_at`. `UNIQUE (user_id, message_id)`
-- makes `append` write-once. In #29 only user-authored rows are written; the
-- companion half is filled by its producer (#36). See ADR-0006 (amended).
--
-- Production provisioning owns the `agent_runtime` schema and role/grants. This
-- migration creates only its own objects inside that schema.

CREATE TABLE IF NOT EXISTS agent_runtime.conversation_messages (
  seq                   bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id               uuid        NOT NULL,
  message_id            text        NOT NULL,
  author                text        NOT NULL CHECK (author IN ('user', 'companion')),
  body                  text        NOT NULL,
  at                    timestamptz NOT NULL DEFAULT now(),
  via_post_message_back boolean     NOT NULL DEFAULT false,
  UNIQUE (user_id, message_id)
);

CREATE INDEX IF NOT EXISTS conversation_messages_user_seq
  ON agent_runtime.conversation_messages (user_id, seq DESC);
