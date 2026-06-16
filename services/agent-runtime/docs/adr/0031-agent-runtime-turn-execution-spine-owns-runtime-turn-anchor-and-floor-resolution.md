# ADR 0031: The Turn Execution Spine Owns the Runtime Turn Anchor and Floor Resolution

## Status

Accepted — deepens the **Turn Execution** spine (`runtime/service/turn.ts`). Builds on ADR-0012 (Runtime Turn as the eval anchor), ADR-0020 (turn-failure containment at the channel), ADR-0022 (floor pinned/resolved per connection), ADR-0027 (heartbeat due-ness computed from latest `runtime_turns`), and ADR-0029 (Cron runs on the Per-User Channel main thread).

## Date

2026-06-17

## Context

`createTurn` was deep at its core but leaked its durable-records contract onto every caller. Each trigger module (`turn-runner`, `monitoring-turn`, `cron-turn`) hand-built the `runtime_turns` row on **both** the success and the failure path, so:

- The **Runtime Turn** anchor — which `CONTEXT.md` says is written on _every_ turn — was wired per-trigger instead of once in the spine, leaving "every turn → one `runtime_turns` row" as a convention enforced in three places rather than an invariant enforced in one.
- `failedTurnRecord` was reimplemented in two files and `errorMessage` copy-pasted in four (`turn-runner`, `monitoring-turn`, `cron-turn`, `delivery-port`).
- `monitoring-turn` and `cron-turn` each carried a **second failure path**: an outer `try/catch` around floor resolution that recorded a failed turn, _plus_ the spine's `onFailure` that recorded another — two overlapping places recording the same failure (a latent double-recording bug).
- The floor was obtained three different ways: `turn-runner` read `session.pinnedFloor`; `monitoring-turn` and `cron-turn` each called `floorResolver.resolve("production")` inline, outside the spine's `try`.

## Decision

The spine owns what is **universal to every turn**:

1. **Floor resolution.** `TurnExecution.floor` becomes a thunk (`() => Promise<PinnedProcedureFloor>`) resolved _inside_ the spine's `try`. A resolution failure (floor or, for cron, the parallel `userTz` load) now flows through the spine's `onFailure` and becomes a normal failed turn. This collapses the outer `try/catch` in both `monitoring-turn` and `cron-turn`.
2. **The single Runtime Turn anchor.** The spine appends exactly one `runtime_turns` row — ok or failed — to the caller's queries on both paths, in the **same transaction** as the caller's trigger-specific rows, and **after** them (preserving transaction ordering). Callers' `onSuccess`/`onFailure` return only their _trigger-specific_ rows. "Every turn produces exactly one `runtime_turns` row" is now a one-place invariant.
3. **Error stringification.** A shared `errorMessage(error)` lives in `@intentive/providers/telemetry` (the sanctioned cross-cutting home; the spine, `cron-turn`, and `delivery-port` already import from it, so this adds no new dependency edge — inviolable rule #3). The four local copies are deleted.

**Cron is included.** The shared spine writes a `runtime_turns` row for cron fires too (in _addition_ to `cron_runs`). This is a deliberate behavior change: heartbeat due-computation reads the latest `runtime_turns` (ADR-0027), so a cron fire now also suppresses/delays the next heartbeat — which is correct, since the user just had activity.

## Considered Options

- **Keep the per-trigger record-building (rejected).** Leaves the anchor as a convention in three places, keeps the duplicated `failedTurnRecord`/`errorMessage`, and keeps the double-recording floor-failure paths. The invariant stays unenforced.
- **Spine owns the anchor + floor thunk (chosen).** Makes the invariant structural, removes the latent double-recording bug, and collapses the duplication. Callers shrink to their trigger-specific rows and error policy.
- **Exclude cron from the anchor (rejected).** Would keep cron's observability inconsistent with every other trigger and split the invariant. The heartbeat-suppression side effect it introduces is the intended behavior, not a reason to special-case cron.

## Consequences

- A cron fire now emits **both** `cron_runs` and `runtime_turns`; the latter participates in heartbeat due-ness, so a cron fire delays the next heartbeat. Intended (ADR-0027 reads the latest `runtime_turns`).
- `createTurn` gains required deps `runtimeTurns` and `fallbackModel`; it is the only place that builds the `runtime_turns` ok/failed records. `turn-runner` keeps these as construction deps only for the self-built spine used in tests; `monitoring-turn` and `cron-turn` no longer take `sql`/`runtimeTurns`/`fallbackModel` (and `cron-turn` drops the now-dead `adapter`).
- ADR-0020 containment is unchanged: `turn-runner`'s `onFailure` still returns `rethrow: true` so the channel contains the failure; `monitoring-turn` and `cron-turn` return `rethrow: false`.
- A future reader who expects each trigger to write its own `runtime_turns` row should read this ADR: the anchor is written once, in the spine, for every trigger.
