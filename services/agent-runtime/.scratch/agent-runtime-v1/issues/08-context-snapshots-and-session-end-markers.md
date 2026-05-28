# Phase 7: Context Snapshots And Session End Markers

Status: ready-for-agent
Labels: ready-for-agent
Opened: 2026-05-28T04:17:46Z
Updated: 2026-05-28T04:17:46Z

## Description

## Parent

services/agent-runtime/.scratch/agent-runtime-v1/PRD.md

## What to build

Complete the Desktop Client's capture-only path into the Runtime. Context Snapshots and Session End Markers should enter through the same WebSocket Protocol as Mobile chat and affect Companion context without becoming chat messages by default.

## Acceptance criteria

- [ ] Desktop `context_snapshot` events become durable Runtime events.
- [ ] Desktop `session_end_marker` events become durable Runtime events.
- [ ] Context Snapshots are stored in Runtime-owned Neon tables or VFS projections according to the documented storage policy.
- [ ] Relevant snapshot summaries can be fed into DeepAgents on a later user turn or Heartbeat.
- [ ] Session End Markers update liveness state used by Heartbeat.
- [ ] Snapshot ingestion does not create user-visible chat messages by default.

## Blocked by

- 07-neon-backed-vfs-bundles-and-memory.md

## Comments
