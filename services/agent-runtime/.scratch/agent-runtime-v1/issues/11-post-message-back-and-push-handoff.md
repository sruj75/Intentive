# Phase 10: Post-Message-Back And Push Handoff

Status: ready-for-agent
Labels: ready-for-agent
Opened: 2026-05-28T04:17:46Z
Updated: 2026-05-28T04:17:46Z

## Description

## Parent

services/agent-runtime/.scratch/agent-runtime-v1/PRD.md

## What to build

Implement Post-Message-Back as the Runtime's deliberate proactive message primitive and the only origin of push notification requests. A Post-Message-Back should first become Conversation History, then ask the Control Plane to send push only when the User is not connected.

## Acceptance criteria

- [ ] Post-Message-Back is modeled distinctly from ordinary Companion replies.
- [ ] Post-Message-Back persists into Conversation History before push handoff.
- [ ] If the User has no connected Mobile client, the Runtime calls Control Plane `POST /internal/notifications/push`.
- [ ] Push handoff outcomes are recorded in a Runtime delivery ledger.
- [ ] Normal replies do not request push.
- [ ] Every push request can be traced to a Post-Message-Back record.
- [ ] APNs credentials and device-token routing remain owned by the Control Plane.

## Blocked by

- 05-conversation-history-and-reconnect-snapshot.md

## Comments
