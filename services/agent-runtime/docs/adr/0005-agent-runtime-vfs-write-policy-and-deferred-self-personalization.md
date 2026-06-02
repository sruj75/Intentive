# VFS Write Policy: Immutable Procedure Files, Writable Knowledge Files

## Status

accepted

## Date

2026-05-29

## Context

ADR-0004 established the DB-backed VFS overlay model (immutable versioned Bundle Defaults + per-`(user_id, path)` User Overlays, overlay-first read resolution) but deliberately left the *write* policy open: it said "immutable bundle defaults are not mutated in place" without specifying what happens when DeepAgents calls `write`/`edit` on an immutable bundle path.

The v1 Bundle Path Set is six paths: `AGENTS.md`, `SOUL.md`, `BOOTSTRAP.md`, `HEARTBEAT.md`, `USER.md`, `MEMORY.md`. These fall into two kinds:

- **Procedure** — how the Companion reasons and behaves: `AGENTS.md`, `SOUL.md`, `BOOTSTRAP.md`, `HEARTBEAT.md`. These are the centrally-controlled product floor, iterated on over time (e.g. from Langfuse eval signal).
- **Knowledge** — what the Companion has learned about a specific user: `USER.md`, `MEMORY.md`.

A tempting model is copy-on-write: an agent write to any path silently creates a User Overlay that shadows the Bundle Default, giving "the agent personalizes itself over time." The trap is that an override-style overlay **permanently shadows future bundle versions**. Once a user has an overlay of `AGENTS.md`, shipping an improved `AGENTS.md` (v2) never reaches that user — the improvement is invisible behind their overlay. This is worst exactly where it matters most: the behavioral and safety floor of the product, and the prompts we most want to keep tuning.

## Decision

The VFS backend splits the path set by what each file *is*:

1. **Procedure files are immutable in v1.** Agent writes to `AGENTS.md`, `SOUL.md`, `BOOTSTRAP.md`, `HEARTBEAT.md` are **rejected** — not routed to overlays. This preserves the ability to ship a fixed/improved bundle version to all users (including existing ones) without an overlay shadowing it.

2. **Knowledge files are agent-writable overlays.** `USER.md` and `MEMORY.md` are User Overlays with no Bundle Default to shadow; the agent writes learned personal facts here over time.

3. **Personalization in v1 expresses through the knowledge layer plus Cron, not through self-editing procedure files.** Worked example: the agent learns "user takes a pill ~9pm" → writes the fact to `USER.md`/`MEMORY.md` and creates a Cron job to fire at 9pm; `HEARTBEAT.md` is *read* (never written) to decide whether a given tick is worth a Post-Message-Back.

## Considered Options

- **Reject writes to immutable paths (chosen).** Keeps "immutable" honest and the product floor centrally controlled.
- **Copy-on-write to overlay (rejected for v1).** Silently turns immutable files mutable; override-style overlays shadow future bundle versions, defeating central improvement.

## Consequences

- The agent cannot rewrite its own reasoning procedure in v1; personalization is confined to the memory layer + Cron, which is more powerful and keeps the product tunable.
- **Agent-driven behavioral self-personalization is deferred to its own future ADR.** Letting the agent overlay procedure files entangles override-vs-augment semantics, base-version migration, and the safety floor — too hard and too irreversible to adopt as a silent default. When built, it should be **augment** (Bundle Default always loaded, learned layer composed on top) rather than **replace** (overlay shadows default), so central bundle improvements still reach personalized users.
- Refines ADR-0004; the overlay-first read contract there is unchanged (it only ever applies to paths that have both a default and an overlay).
