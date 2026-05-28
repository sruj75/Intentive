# Phase 4: Push Notification Fan-Out

Status: ready-for-agent
Labels: ready-for-agent
Deployable: control-plane
Opened: 2026-05-28T12:00:00Z
Updated: 2026-05-28T12:00:00Z

## Description

## Parent

.scratch/v1-backlog/prds/control-plane-PRD.md

## What to build

Implement the `notifications` domain and the internal `POST /internal/notifications/push` endpoint: the Agent Runtime asks the Control Plane to deliver a **Push Notification** to a User's devices via APNs when the User is offline. APNs credentials and device tokens stay owned here; the Agent Runtime never calls APNs directly. This unblocks Agent Runtime #35 (Post-Message-Back + push handoff).

## Acceptance criteria

- [ ] `POST /internal/notifications/push` is protected by shared-secret auth on the private interface, not user JWT.
- [ ] The endpoint accepts the `PostInternalNotificationsPushRequest` shape (`user_id`, `preview_text`, `message_id`) and returns `delivered` + `device_count`.
- [ ] The Control Plane resolves the User's registered APNs device tokens from the Device Registry and fans the push out to all of them.
- [ ] Apple credentials (key, key id, team id, bundle id) are loaded from configuration/secrets, never committed.
- [ ] A push with no registered devices returns `delivered: false`, `device_count: 0` without error.
- [ ] The Control Plane never originates a push on its own; every push corresponds to a runtime-initiated request.
- [ ] Tests cover single-device delivery, multi-device fan-out, no-device case, and shared-secret rejection (with the APNs client faked).

## Blocked by

- #21
- #35

## Comments
