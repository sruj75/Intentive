# ADR 0019: v1 Has No Skills and No Subagents

## Status

Accepted

## Date

2026-06-13

## Context

DeepAgents natively supports both a **skills** pattern (progressive-disclosure
instruction files: a compact list in the prompt, bodies read on demand via the VFS
tools) and **subagents** (delegated isolated workers). The prompt-assembly decision
and the workspace reference (`SOUL`/`AGENTS`/`SKILL` layout) left room for skills,
and earlier drafts of CONTEXT.md eager-injected "a compact skills list."

The question was how much of that to build for v1: what a skill is, where bodies
live, whether the agent can author its own, and when something is a skill vs a
subagent. The product answer is simpler than the design space: **v1 does not need
skills or subagents at all.**

The v1 Companion is a **single brain** (ADR-0014) operating with the locked Bundle
Path Set, a minimal all-internal tool surface (`post_message_back`,
`schedule_cron`, DeepAgents VFS tools), monitoring (ADR-0015), and cron (ADR-0017).
That is sufficient for the v1 product (proactive psychological scaffolding via
perception + memory + talk + schedule). A skill library and subagent delegation
would be speculative machinery now.

## Decision

**Ship v1 with no skill library and no subagent delegation.**

1. **No skills in v1.** The Companion runs on the locked bundle files plus durable
   memory; there is no skill catalog. When skills arrive post-v1, they are
   **immutable progressive-disclosure md files** — central, shipped, and versioned
   like the procedure floor (ADR-0005), **not** agent-authored. The agent cannot
   build its own skills in v1; that may change after v1 but is not a v1 default.

2. **No subagents in v1.** No delegated isolated workers. DeepAgents supports
   subagents natively, so this is a **deferral**, not a missing capability — added
   when a concrete need appears (e.g. a heavy background chore alongside the
   deferred isolated cron, ADR-0017).

3. **The slot is reserved.** The prompt-assembly shape (eager skill _list_, read
   _body_ on demand) already anticipates skills, so adding them later slots in
   without disturbing the design.

## Consequences

### Positive

- v1 stays minimal — fewer concepts to build, test, and reason about.
- No speculative skill-authoring/permission machinery (which would entangle with
  the same procedure/knowledge and safety-floor questions as ADR-0005/0015).
- Both capabilities are DeepAgents-native, so deferring costs nothing later.

### Negative

- Any v1 capability that _would_ naturally be a skill must instead live in the
  procedure floor (`AGENTS.md`/`SOUL.md`) or be handled inline by the single brain
  — acceptable at v1 scope.
- No delegation means heavy/long sub-tasks run on the main lane; acceptable
  because v1 has no such background-chore workload (see ADR-0017).

### Neutral / Follow-up

- When skills are introduced, give them their own ADR: the skill unit, where
  bodies live (Neon VFS), versioning/seeding into the bundle set, and the
  (initially immutable) authoring policy.
- When subagents are introduced, give them their own ADR alongside the first
  isolated-cron / background-chore use case.
