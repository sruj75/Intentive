# Build Runtime Adapter and Dev Companion Chat Path

Status: open
Labels: ready-for-agent
Opened: 2026-05-22T12:14:44Z
Updated: 2026-05-23T07:19:40Z

## Description

## Parent

#1

## What to build

Implement the **Runtime Adapter** contract and a Dev Companion behind it so Companion Chat receives real assistant responses, errors, retry behavior, and Agent State without embedding Agent Runtime assumptions in the Mobile Surface.

For first entry into Companion Chat while Relationship Onboarding is incomplete, represent a Control Plane-owned **Conversation Start Trigger** that causes the Agent Runtime to generate the actual bootstrap-guided opening message. The client must not create a hardcoded welcome message or treat onboarding as a local chat mode. Retrying a failed initial opening must address the same logical trigger so delayed and retried responses cannot create duplicate openings.

## Acceptance criteria

- [ ] Runtime Adapter exposes a simple client-facing send/stream contract for Companion Chat.
- [ ] Dev Companion implements the same contract for local MVP 1 development.
- [ ] Sending a user message produces an assistant response through the adapter boundary.
- [ ] The adapter can represent a runtime-generated first opening initiated by a server-owned Conversation Start Trigger when Relationship Onboarding is incomplete.
- [ ] The Mobile Surface does not author the bootstrap opening message or select a separate Relationship Onboarding chat mode.
- [ ] An initial-opening failure can be retried idempotently using the same logical trigger without rendering two openings.
- [ ] Loading, error, retry, and delivery status are represented in adapter-reported state for the UI in #9.
- [ ] Agent State can report at least Available and Thinking.
- [ ] UI does not imply local agent action; capability comes from adapter-reported state.
- [ ] Contract tests cover successful user response, streaming/progress, error, retry, Agent State, first-opening delivery, and idempotent first-opening retry.

## Out of scope

- Production Control Plane implementation and true cross-client trigger delivery/deduplication.
- Final visual interaction design for the protected opening and recovery state; owned by #9.

## Blocked by

- #6


## Comments

(No comments.)
