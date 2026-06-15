# ADR 0022: The Procedure Floor Is Managed in Langfuse Prompt Management (Registry-First); Behavior Ships via Label Promotion, Decoupled From Code Redeploys

## Status

Accepted — extends ADR-0021 (resolves _where_ the procedure floor is versioned); resolves the bundle-version _source_ for ADR-0004's per-connection pinning. Establishes the agent-iteration-loop foundation.

## Date

2026-06-15

## Context

ADR-0021 settled that the procedure floor (`SOUL.md`, `AGENTS.md`, `BOOTSTRAP.md`, `HEARTBEAT.md`) is versioned product content **injected** by the prompt-assembly middleware (not routed into the agent's VFS), but deliberately left open _where_ that content is versioned — files-in-deploy vs a Neon `bundle_documents` table.

The product is an early-stage startup agent: the prompts, context engineering, and harness will be iterated continuously, fast, for the life of the product. The procedure floor is the **highest-churn artifact in the system**. The strategic requirement is a **solid agent-iteration loop that does not break** — improve behavior quickly and safely without destabilizing the always-alive runtime, and always be able to answer "which prompt version produced this behavior?" against eval signal.

The battle-tested LLMOps pattern separates artifacts by **rate of change**, versions each in the appropriate store, and links every turn to the versions that produced it. Langfuse Prompt Management (already wired for tracing in #36) provides versioned, labeled prompts fetched at runtime, client-side caching with fallback, composability across prompts, and native trace↔prompt-version linkage.

## Decision

1. **The procedure floor is managed in Langfuse Prompt Management** as versioned, labeled prompts — the single **source of truth** (registry-first). _Not_ files-in-deploy, _not_ a Neon bundle table, _not_ a second registry. One registry: Langfuse.

2. **Two decoupled deploy lanes.**
   - **Behavior lane (fast, no redeploy):** edit a prompt in Langfuse → new version → test (playground / dataset) → **move the `production` label**. New connections pick it up. Rollback = move the label back.
   - **Code/harness lane (gated, redeploy):** tools, middleware, backend wiring change via git → CI → GCE VM redeploy. The DeepAgents adapter (#36) is the seam — `systemPrompt`/`middlewares`/`tools`/`backend` are injection points.

3. **The prompt-assembly middleware sources prompts from Langfuse.** It fetches the `production`-labeled procedure prompts at connection, composes them (Langfuse composability tags, e.g. `@@@langfusePrompt:name=companion-soul|label=production@@@`), injects them trigger-aware (per ADR-0021 / the prompt-assembly decision), and **links the resolved versions to the Langfuse trace** (`langfusePrompt: prompt.toJSON()`) so every turn records which version produced it. DeepAgents condones this: `systemPrompt` is just a string sourced from anywhere.

4. **Per-connection pinning maps onto labels.** The Pinned Bundle Version (ADR-0004 amendment) is realized by resolving `production` once at `hello_ok`, caching the resolved versions for the connection's lifetime, and re-resolving on reconnect. `runtime_turns.bundle_version` records the resolved prompt version(s) — the relational join from the turn record to the trace.

5. **Two non-negotiable guardrails** (always-alive, safety-critical intervention agent):
   - **Cache + bundled fallback.** Client-side prompt cache (TTL) plus a last-known-good procedure floor **baked into the deploy** as a `fallback`, so an unreachable Langfuse never takes the agent down. Prompt fetch must not be a hard runtime dependency.
   - **`production` is a deliberate (optionally reviewed) promotion gate, never auto-`latest`.** A human/eval gate between "edited a prompt" and "users get it," with instant rollback.

## Considered Options

- **Langfuse registry-first (chosen).** Fastest safe iteration; native version↔trace linkage; no new infra; matches how startups ship LLM products. Cost: prompts live outside git (mitigated by the promotion gate + optional git mirror for review/history) and depend on Langfuse availability at connection (mitigated by cache + fallback).
- **Files-in-deploy + `BUNDLE_VERSION` constant (rejected).** Simplest, but couples every behavior change to a VM redeploy and provides no version↔trace link — fatal for the iteration loop.
- **Neon `bundle_documents` table (rejected).** Re-implements a prompt registry (versions, labels, rollback, linkage, admin) we'd own and maintain — shallow re-build of a deep tool we already have.
- **LangSmith Prompt Hub (rejected for now).** First-party to LangChain/DeepAgents and battle-tested, but Langfuse is already in-stack; running both is two sources of truth and guaranteed drift.

## Consequences

- Deletes the bundle-table build entirely; the "bundles" half of #37 becomes "fetch + compose + inject from Langfuse, with cache/fallback."
- Behavior iterates without redeploys; the eval loop gets version↔trace linkage natively (closes ADR-0012's "which bundle produced this behavior?").
- New dependency surface: Langfuse availability at connection — bounded by cache + bundled fallback.
- Governance: behavior changes skip code review/CI by default — the `production` promotion gate (and an optional git mirror) is where review lives; this is a deliberate velocity/safety trade.
- **Vocabulary follow-up:** "Bundle Default" / "versioned bundle records" now denote **Langfuse-managed prompts**, not Neon rows; the `bundles/` domain becomes a Langfuse-fetch + prompt-assembly concern, not a document store. Folded into the ADR-0021 vocabulary pass.
