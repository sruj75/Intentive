-- Migration 0003 — control_plane.devices (devices domain, issue #27).
--
-- The Device Registry: one row per (User, device fingerprint), holding the
-- client_kind and the Expo Push Token used by push fan-out (#49). The
-- UNIQUE(user_id, device_fingerprint) constraint is what makes registration
-- idempotent (DB-enforced, like users.sub) — a re-register can only ever map
-- back to the one existing row, never a duplicate. The fingerprint is treated as
-- an opaque key minted by the client; the Control Plane makes no assumptions
-- about its format or stability (see repo/devices.ts).
--
-- Token lifecycle is create+refresh only (Expo-aligned): a re-register with
-- a new token rotates it in; one that omits the token keeps the existing value
-- (never destructive). Dead-token reaping lives on the send path (#49), which is
-- the only place that learns a token is gone; `updated_at` is the freshness
-- signal a later stale-TTL prune reads. Reaping clears the token and keeps the
-- device row.
--
-- `user_id` is a FK into control_plane.users(id): a device only exists for a
-- known User, and registering for an unknown id fails the FK.
--
-- Ownership mirrors 0001_users.sql / 0002_user_gates.sql: written by #27, applied
-- to production by #50 (which holds Neon admin and provisions the control_plane
-- schema + role). This migration only creates its own table, always inside
-- control_plane. See migrations/README.md.

CREATE TABLE IF NOT EXISTS control_plane.devices (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES control_plane.users(id),
  device_fingerprint text        NOT NULL,
  client_kind        text        NOT NULL,
  expo_push_token    text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_fingerprint)
);
