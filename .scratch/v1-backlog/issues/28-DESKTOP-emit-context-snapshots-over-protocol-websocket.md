# Emit Context Snapshots over Protocol WebSocket

Status: open
Labels: enhancement, ready-for-agent
Deployable: desktop
Opened: 2026-05-18T10:33:54Z
Updated: 2026-05-27T00:00:00Z

## Description

## Parent

.scratch/v1-backlog/prds/desktop-PRD.md

## What to build

Emit **Context Snapshots** from the **Snapshot Store** to the **Agent Runtime** as `context_snapshot` events on the shared **Protocol** WebSocket defined in `packages/protocol/`. Consume **Routing** and an open session from #25 — not manual Settings endpoint fields and not legacy HTTP delivery.

When the **Snapshot Store** has a new row after the **Context Heartbeat**, send the five-field payload (`snapshot_id`, `captured_at`, `period_start`, `period_end`, `summary`) on the open WebSocket. On **Capture Session** end, emit `session_end_marker` as a distinct event type before teardown.

## Acceptance criteria

- [ ] Delivery obtains `ws_url` and `runtime_jwt` from #25 Routing state; no user-visible endpoint or API key fields.
- [ ] Each Context Snapshot is emitted as a `context_snapshot` Protocol event conforming to `packages/protocol/`.
- [ ] JWT is used at WebSocket connect only; per-event Authorization headers are not required.
- [ ] Missing or invalid Routing / disconnected WebSocket produces a safe `routing_error` (or equivalent) state without prompting for manual endpoint entry.
- [ ] Successful delivery ack updates `pushed_at` in the **Snapshot Store**; failures leave `pushed_at` null.
- [ ] Network errors, timeouts, and protocol-level failures do not crash Intentive or block the next **Context Heartbeat** tick.
- [ ] V1 delivery is at-most-once (no client retry queue); the next heartbeat may attempt again for rows with `pushed_at` null.
- [ ] No raw ScreenPipe data crosses the Protocol boundary.
- [ ] `session_end_marker` is emitted on Capture Session end with the Protocol shape from `packages/protocol/` (not deferred).
- [ ] Tests cover Routing consumption, missing Routing, payload shape, connect auth, ack → `pushed_at`, failure leaves `pushed_at` null, heartbeat continues after failure, and `session_end_marker` on stop.

## Blocked by

- #05
- #07
- #25

## Comments

### 01 @alignment — 2026-05-27T00:00:00Z

Rewritten from the pre-monorepo delivery shape to **Protocol** WebSocket + **Routing** per `docs/CONTEXT.md` and `apps/desktop/docs/ARCHITECTURE.md`. Removed stale blocker #13 (packaging); Routing session is #25.
