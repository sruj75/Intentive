# Establish local snapshot store with retention

Status: closed
Labels: enhancement, ready-for-agent
Deployable: desktop
Opened: 2026-05-18T10:33:01Z
Updated: 2026-05-25T04:16:18Z
Closed: 2026-05-25T04:16:18Z

## Description

## Parent

.scratch/v1-backlog/prds/desktop-PRD.md

## What to build

Add Intentive's local Context Snapshot store with bounded retention. A completed slice gives the rest of v1 a durable local record for sanitized Context Snapshots, delivery state, and future transparency UI support without storing raw ScreenPipe data.

## Acceptance criteria

- [ ] Intentive creates a local snapshots table with id, captured_at, period_start, period_end, summary, and nullable pushed_at.
- [ ] A Context Snapshot can be inserted before any push attempt.
- [ ] Successful delivery can mark pushed_at without mutating the summary fields.
- [ ] Failed or unattempted delivery leaves pushed_at null.
- [ ] Entries older than 7 days are purged automatically on launch.
- [ ] The store API makes it hard to persist raw ScreenPipe data as a Context Snapshot.
- [ ] Tests cover insert, mark-pushed, null pushed_at behavior, and retention purge.

## Blocked by

Not applicable (closed)


## Comments

(No comments.)
