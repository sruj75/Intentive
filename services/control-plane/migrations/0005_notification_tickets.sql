-- Migration 0005 — control_plane.notification_tickets (notifications domain, issue #49).
--
-- Expo Push Service returns ticket ids synchronously when it accepts a push.
-- The Control Plane stores those ticket ids so a bounded maintenance call can
-- check receipts later and clear dead Expo Push Tokens without deleting the
-- device row. Production scheduling for that maintenance call is #50.

CREATE TABLE IF NOT EXISTS control_plane.notification_tickets (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       text        NOT NULL,
  device_id       uuid        NOT NULL REFERENCES control_plane.devices(id),
  expo_push_token text        NOT NULL,
  message_id      text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  checked_at      timestamptz
);

CREATE INDEX IF NOT EXISTS notification_tickets_unchecked_idx
  ON control_plane.notification_tickets (created_at)
  WHERE checked_at IS NULL;
