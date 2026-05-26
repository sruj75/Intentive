# ADR 0001: OpenClaw Patterns by Default, Explicit Divergence for DeepAgents/Intentive

## Status
Accepted

## Date
2026-05-25

## Context

`v1-deepagent` is the behavior runtime in the Intentive system. We want to reduce design complexity from day one and avoid re-inventing shell/control-plane patterns repeatedly.

OpenClaw provides a mature shell pattern library (gateway handshake/protocol discipline, deterministic routing, session-key-centric concurrency boundaries, always-on gateway model).

At the same time, `v1-deepagent` has explicit constraints:
- DeepAgents is the runtime brain.
- V1 is `user_id`-scoped, one active continuous session per user.
- Runtime durability is Neon-first.
- Filesystem model is DeepAgents VFS-only in v1.

## Decision

Adopt OpenClaw shell behavior patterns as the default reference architecture for gateway/session/channel/routing contracts.

Any intentional divergence from OpenClaw patterns requires explicit documentation of:
1. Why the divergence is needed.
2. Which constraint forces it (DeepAgents or Intentive product boundary).
3. What complexity risk the divergence introduces.
4. What invariant or test will contain that risk.

## Consequences

### Positive

- Lower change amplification through repeatable shell patterns.
- Faster onboarding: shared architecture language and known defaults.
- Fewer accidental protocol and routing reinventions.
- Better long-term maintainability by requiring explicit rationale for differences.

### Negative

- Additional documentation overhead when diverging.
- Potential short-term friction for rapid experiments.

### Neutral / Follow-up

- `ARCHITECTURE.md` and `CONTEXT.md` remain the primary contracts; ADRs capture hard-to-reverse tradeoffs.
- Future ADRs should reference this ADR when proposing pattern-level divergence.
