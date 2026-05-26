> **Status: Amended by [ADR-0001](0001-unified-monorepo-foundation.md).**
> The vertical-first organization is preserved. The full layered domain rule (`types → config → repo → service → runtime → ui` + cross-cutting via `providers/`) now applies inside every vertical domain across the whole monorepo. See [ARCHITECTURE.md](../ARCHITECTURE.md) for the canonical rule and the lint enforcement.

# ADR 0002: Vertical-First Architecture with Progressive Layering

## Status
Accepted

## Date
2026-05-25

## Context

`v1-deepagent` adopts OpenClaw shell behavior patterns by default and aims to minimize complexity from day one.

A strict rule that every vertical slice must immediately implement a full internal horizontal stack (`types -> config -> repo -> service -> runtime -> ui`) would create premature structure and unnecessary cognitive load while the product surface is still stabilizing.

OpenClaw's gateway structure demonstrates strong vertical feature organization with explicit protocol/server/method seams rather than fully replicated layer stacks per feature from day one.

## Decision

Use **vertical-first** component ownership as the primary architecture shape.

Apply horizontal layering **progressively** as complexity emerges, not as mandatory boilerplate inside every vertical at project start.

Initial mandatory seams in v1:
1. `gateway/protocol` (wire schema and validation)
2. `gateway/auth` (JWT verification and identity context)
3. `sessions/queue` (strict ordering and idempotency)
4. `runtime/adapter` (DeepAgents boundary)

The global dependency direction remains a contract target:
`types -> config -> repo -> service -> runtime -> ui`

But adoption inside each vertical is incremental and justified by complexity signals (change amplification, high cognitive load, unclear ownership).

## Consequences

### Positive

- Avoids premature architecture overhead.
- Keeps module boundaries deep and understandable.
- Matches OpenClaw-inspired operational shape while preserving harness-style enforceability.

### Negative

- Requires discipline to recognize when to introduce additional layers.
- Temporary inconsistency between verticals is possible during early evolution.

### Neutral / Follow-up

- `ARCHITECTURE.md` must state vertical-first ownership and progressive layering policy.
- Future ADRs can tighten layer enforcement once complexity thresholds are observed.
