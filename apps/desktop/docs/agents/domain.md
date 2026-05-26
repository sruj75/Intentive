# Domain Docs

This is a single-context repo. Engineering skills should consume the root
domain and architecture documents before planning or editing.

## Before exploring, read these

- `CONTEXT.md` for Intentive glossary and source-of-truth product language.
- `AGENTS.md` for repo-local agent instructions (`CLAUDE.md` points here).
- `ARCHITECTURE.md` for the current mechanical architecture, codemap, and invariants.
- `docs/adr/` for architectural decisions that touch the area being changed.

## Use the glossary's vocabulary

When output names a domain concept, use the term as defined in `CONTEXT.md`.
In this repo that includes Intentive, ScreenPipe, Capture Session, Context
Snapshot, Context Heartbeat, OpenClaw Agent, Agent Interface, and Auth.

Avoid synonyms the glossary explicitly rejects.

## Flag ADR conflicts

If a proposal or implementation contradicts an existing ADR, surface it
explicitly instead of silently overriding the decision.
