# Event Ledger Is an Append-Only Idempotency Record; Per-User Ordering Is an In-Memory Queue

## Status

accepted

## Date

2026-06-09

## Context

Phase 3 (#28) establishes the Runtime's core safety invariant: concurrent Mobile, Desktop, Cron, and Heartbeat triggers for one User must serialize before they invoke Companion behavior, while different Users never block each other. It also introduces the Runtime's first Neon-backed durable state, replacing the non-durable in-memory `AgentInstanceRegistry` from #25.

A tempting reading of "durable event ledger" is a durable **job queue**: rows with a `status` (`pending → processing → done/failed`), row claiming, retries, and replay-of-pending-work on process restart. None of that is required by this slice's acceptance criteria, which ask only for per-user serialization, duplicate suppression, and multi-user non-blocking. Building it now would lock a complex table shape in early and add a large, bug-prone subsystem months before anything consumes it — in #28 there is no consumer at all (DeepAgents is Phase 5), so events are processed by a stub.

The OpenClaw reference shell (the deployable's pattern default, ADR-0001) does not build a durable job queue either. It persists sessions in two layers — a mutable metadata store (`sessions.json`) and an **append-only** transcript (`*.jsonl`) — and serializes work with an **in-process** session writer plus a write lock. Restart recovery reads the append-only log as history; it does not replay a pending-job queue.

## Decision

`runtime_events` is an **append-only, write-ahead idempotency ledger** — not a job queue. It has two jobs: be a durable record of what arrived, and detect duplicates. There is no `status` column, no row claiming, no retry.

Per-`user_id` **ordering is an in-memory queue** (a serial async chain, one per `user_id`) living in the single always-alive Runtime process. The queue — not the ledger — is what serializes work for a User. It is ephemeral: a process restart loses it, and that is acceptable for this slice.

Inbound flow: parse at the boundary → `INSERT INTO runtime_events … ON CONFLICT DO NOTHING` → if the row was newly inserted, enqueue it; if it conflicted, it is a duplicate and is silently dropped. The database write _is_ the duplicate check, in one step. Idempotency is enforced by a unique constraint `(user_id, kind, dedup_key)`, adopting the Control Plane's production idempotency pattern (unique constraint + `ON CONFLICT DO NOTHING`, as in `devices`/`users`). `dedup_key` is the client-supplied id for client wire events (`message_id`, `snapshot_id`) and a runtime-minted id for events with no natural id (`session_end_marker`, and future system events) — which are therefore never deduped, matching OpenClaw's "no id → no dedupe."

`agent_instances` (mutable per-user metadata) stays a separate table from `runtime_events` (the append-only log), mirroring OpenClaw's separation of the metadata store from the transcript.

**Load-bearing assumption, recorded deliberately:** there is exactly **one** Runtime process. The in-memory queue guarantees per-user ordering _only_ under single-process execution. This is already a hard deployment rule (GCE, always-alive; never a stateless or multi-instance platform), but it is the assumption that makes this design correct, so it is stated here as a tripwire for anyone later tempted to scale horizontally.

Crash-recovery / replay of in-flight events is explicitly **out of scope**. When durable recovery matters it is the Phase 4 (#29) Conversation-History concern, handled by reading the append-only log (OpenClaw-style), not by turning this ledger into a replayable job queue.

## Considered Options

- **Append-only ledger + in-memory single-process queue (chosen).** Matches the acceptance criteria exactly and the OpenClaw production model. Minimal table shape, no speculative subsystem. Ordering is in-process; durability is the log.
- **Durable job queue with per-event status/claim/retry/replay (rejected).** Far more to build and a heavier table to lock in, none of it required by Phase 3, and with no consumer in #28 it would be unexercised speculation. If multi-process execution or crash-resume ever becomes real, it earns its own ADR against real usage rather than a guess now.
- **In-memory dedupe cache, like OpenClaw's recent-message-id cache (rejected for our context).** OpenClaw dedupes in memory because it is file-based with no relational store. We have Neon and an existing DB-constraint idempotency pattern that is durable across restart and race-proof, so we keep OpenClaw's _concept_ (dedupe inbound by id) with a stronger _mechanism_.

## Consequences

- The table stays small and stable: `runtime_events` rows are written once and never updated. Adding recovery/replay later is an additive change, not a rewrite of existing semantics.
- The single-process assumption is now explicit. Moving the Runtime off a single resident process breaks per-user serialization until a cross-process queue replaces the in-memory one — the next engineer sees this here first.
- Repo-tier tests run against **ephemeral Neon branches**, mirroring control-plane ADR-0003 (real SQL and the unique-constraint idempotency exercised on a disposable branch; service-tier ordering/isolation tested with fakes and a spy processor). #28 is the first Neon repo in the Runtime, so this test harness is stood up here.
- `cron` and `heartbeat` kinds are represented in the kind enum but have no producer until Phases 8–9; `conversation_start` is likewise represented but its producer and fire-once dedupe semantics are deferred to Phase 5, when a consumer exists. Only the three client wire events (`user_message`, `context_snapshot`, `session_end_marker`) are wired through the ledger and queue in #28.
