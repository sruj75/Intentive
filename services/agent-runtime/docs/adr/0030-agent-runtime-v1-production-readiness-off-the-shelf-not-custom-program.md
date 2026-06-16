# ADR 0030: v1 Production Readiness Is Off-the-Shelf Observability + Existing Bounds, Not a Custom Safety/Metrics Program

## Status

Accepted — scopes #42 (Observability, Safety, and Production Readiness). Reaffirms ADR-0027 (agent-judged quiet hours); builds on ADR-0012 (Langfuse as eval anchor), ADR-0022 (procedure floor in Langfuse), ADR-0028 (fire-once delivery).

## Date

2026-06-16

## Context

The #42 title — "Observability, Safety, and Production Readiness" — and the inbound #36 comment ("dashboards, alerting, SLOs, safety gates / guardrails") read as a mandate to **build a program**: a metrics pipeline, dashboards, SLOs, and runtime guardrails (rate limiting, circuit breakers, hard behavior rules) on an autonomous, always-alive, multi-tenant agent.

A first-principles pass split that into three different concerns with different risk and different owners: **infra reliability** (generic), **behavioral observability** (LLM-specific), and **autonomous-action safety** (the genuinely novel part). The naive checklist over-invests in custom infra and under-specifies the rest.

Working it through, the custom program is mostly the wrong bet for v1:

- **Behavior must be shaped by evals, not if-statements.** We deliberately chose a non-deterministic agent; hard-coded push caps / fixed quiet-hours / daily limits fight that choice and would reverse ADR-0027's agent-judged quiet hours. This is the feature-parity-with-traditional-software trap.
- **The "many notifications from one decision" fault is already prevented.** Delivery is fire-once per `post_message_back` (ADR-0028: one message append, one stream-or-push, no retry fan-out), and a single turn is step-bounded by the LangGraph engine. There is no real runaway path to guard in v1.
- **"One user sinks everyone" is a load problem, not a v1 problem.** Per-user resource quotas / circuit breakers are premature for v1's user count; a single turn cannot loop unbounded anyway.
- **The industry-standard split is off-the-shelf and we already own half of it.** Langfuse (LLM behavior/eval) + Sentry (system health/errors) is the documented pattern; Langfuse is wired (ADR-0012/0022).

## Decision

v1 production readiness for the Agent Runtime is **off-the-shelf tools + existing bounds, not a built program**:

1. **Langfuse — behavioral/eval layer.** "What did the agent see and decide", which prompt version produced it. Already wired (ADR-0012/0022). This is where agent misbehavior is observed — after the fact, which is the correct place for behavior.
2. **Sentry — error/health layer.** Exceptions, crashes, alerting. Installed and initialized, not built.
3. **Structured logs at the domain seams** — connection, event queue, DeepAgents turn, VFS access, Cron, Heartbeat, push handoff. The operator's step-by-step trace.

We deliberately **do not build** in v1: a metrics pipeline (Prometheus/Grafana), dashboards, SLOs, per-user rate-limiting, circuit breakers, or hard-coded agent-behavior rules. The metrics #42 lists (queue latency, turn duration, tokens, scheduler lag, connected clients, push failures) ride as **fields in the structured logs**; token usage already lives in Langfuse.

**Redaction:** logs and Sentry carry **identifiers and metadata only** (`user_id`, `message_id`, turn status, durations, error type). Conversation bodies, memory, and snapshot content live only where they belong — **Langfuse** (model I/O, by design) and **Neon** (the transcript). Auth tokens are never logged anywhere.

The cheap **multi-user isolation test** stays — it guards a correctness/privacy property (no cross-user leakage), not capacity.

The implementation owns the OpenTelemetry composition point from day one. `packages/providers/src/observability/` initializes Sentry first with `skipOpenTelemetrySetup: true`; v1 supports `SENTRY_MODE=errors-only` and `LANGFUSE_MODE=callback`. `errors-and-performance` and Langfuse `otel` are accepted by config as reserved modes but bootstrap rejects them with "not wired in v1" until the shared OTel composition is built in this one module. Domain code must not import `@sentry/node` or instantiate Langfuse tracing directly.

## Considered Options

- **Build the custom program now (rejected).** Dashboards/SLOs/metrics-infra measure traffic we don't have; runtime guardrails fight the non-deterministic-agent bet and reverse ADR-0027. Cost without v1 payoff.
- **Off-the-shelf + existing bounds (chosen).** Fastest safe path; reuses the wired Langfuse eval anchor; matches how AI products ship. Revisit guardrails/metrics when Langfuse signal or load shows a real problem.

## Consequences

- **OTel wiring landmine:** Sentry's JS SDK (v8+) can claim the global OpenTelemetry `TracerProvider`. We initialize Sentry with `skipOpenTelemetrySetup: true` so the Runtime owns OTel ordering. Future Sentry performance and Langfuse OTel wiring must be composed only in `packages/providers/src/observability/`.
- **Never enable in domain code:** Sentry gen_ai / AI-agent auto-instrumentation, Sentry LangChain/DeepAgents integration, Langfuse export-all filters, a second `Sentry.init()`, or a second Langfuse tracing init.
- A future reader who expects rate-limiting / circuit-breakers / a metrics program on an autonomous push agent should read this ADR first — their absence is deliberate, not an oversight.
- Re-introducing runtime guardrails or a metrics program is a future, evidence-driven decision (Langfuse surfaces behavioral abuse; load surfaces capacity limits), recorded as its own ADR when taken.
