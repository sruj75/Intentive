# Domain Docs

Single-context monorepo. Read root domain docs before planning or editing Desktop work.

## Before exploring, read these

- [`../../../../docs/CONTEXT.md`](../../../../docs/CONTEXT.md) — Intentive glossary and canonical product language.
- [`../../AGENTS.md`](../../AGENTS.md) — Desktop deployable agent guide (`CLAUDE.md` should point here).
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — Desktop mechanical architecture, codemap, and invariants.
- [`../../../../docs/adr/`](../../../../docs/adr/) — unified ADRs (desktop entries are prefixed `desktop-`).

## Use the glossary's vocabulary

When output names a domain concept, use the term as defined in `docs/CONTEXT.md`.
Examples: **Companion**, **Agent Runtime**, **Control Plane**, **Protocol**, **Context Snapshot**, **Routing**, **Capture Session**.

Avoid synonyms the glossary explicitly rejects (e.g. OpenClaw Agent, Agent Interface, push in the HTTP sense).

## Flag ADR conflicts

If a proposal or implementation contradicts an existing ADR, surface it explicitly instead of silently overriding the decision.
