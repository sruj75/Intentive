# Phase 2: Device Registry And Token Registration

Status: ready-for-agent
Labels: ready-for-agent
Deployable: control-plane
Opened: 2026-05-28T12:00:00Z
Updated: 2026-05-28T12:00:00Z

## Description

## Parent

.scratch/v1-backlog/prds/control-plane-PRD.md

## What to build

Implement the `devices` domain and `POST /devices/register`: idempotent device registration that stores the device fingerprint, `client_kind`, and APNs/FCM token against the User. This is the device-token half of what notification fan-out (#43) later reads.

## Acceptance criteria

- [ ] `POST /devices/register` accepts the `PostDeviceRegisterRequest` shape from `packages/api-contract/` and returns a stable `device_id`.
- [ ] Registration is idempotent on `(user_id, device_fingerprint)`: re-registering updates the token rather than creating a duplicate row.
- [ ] APNs tokens are stored for Mobile; the FCM token field is accepted and stored but not delivered against in v1.
- [ ] Tokens are stored only in the control-plane-owned Neon schema; they are never exposed to the Agent Runtime or returned to clients.
- [ ] A User can have multiple devices; the registry supports per-User device enumeration for push fan-out.
- [ ] Tests cover first registration, idempotent re-registration with a rotated token, and multi-device enumeration.

## Blocked by

- #17

## Unblocks

- #43

## Comments
