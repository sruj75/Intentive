# Architectural Decision Records

This directory is the canonical home for all ADRs in the Intentive monorepo. ADRs are numbered globally and chronologically. New ADRs continue from the highest existing number.

[ADR-0001](0001-unified-monorepo-foundation.md) is the foundational decision: the four origin repos collapsed into this monorepo, with one unified `docs/CONTEXT.md` and one architectural rule in `docs/ARCHITECTURE.md`. Reading it first will explain why the older ADRs below are framed the way they are.

## How to find what you need

- **By topic:** scan the table below.
- **By origin:** filenames are prefixed with the origin deployable (`control-plane`, `agent-runtime`, `desktop`, `mobile`) for ADRs imported from the pre-monorepo repos.
- **By status:** "Superseded" and "Amended" rows below have a status banner at the top of the file pointing to the superseding ADR.

## Index

| # | Origin | Title | Status |
|---|---|---|---|
| 0001 | monorepo | Unified monorepo foundation | accepted |
| 0002 | control-plane | Control Plane as source of truth | accepted |
| 0003 | agent-runtime | OpenClaw patterns as default | accepted |
| 0004 | agent-runtime | Vertical-first progressive layering | **amended by 0001** |
| 0005 | agent-runtime | WebSocket protocol contract v1 | accepted |
| 0006 | agent-runtime | DB-backed VFS overlay model v1 | accepted |
| 0007 | desktop | Tauri over Electron | accepted |
| 0008 | desktop | Wrap ScreenPipe CLI binary | accepted |
| 0009 | desktop | Menu-bar-only UI v1 | accepted |
| 0010 | desktop | Push Context Snapshots to the agent | **superseded by 0001** (delivery is now over the WebSocket Protocol, not HTTPS webhook) |
| 0011 | desktop | Drop failed snapshot pushes v1 | accepted (channel changed; principle holds) |
| 0012 | desktop | Ollama for on-device summarization | accepted |
| 0013 | desktop | Local snapshot log with retention | accepted |
| 0014 | desktop | Fixed-interval Heartbeat with Session End Marker | accepted |
| 0015 | desktop | Auto-start capture after auth with consent at sign-in | accepted |
| 0016 | desktop | Neon Auth for user-owned agent config | accepted |
| 0017 | desktop | No ScreenPipe crash retry in v1 | accepted |
| 0018 | desktop | Subprocess manager shutdown intent flag | accepted |
| 0019 | desktop | Unique local ports for bundled binaries | accepted |
| 0020 | desktop | macOS CPU variants for bundled native artifacts | accepted |
| 0021 | desktop | Product-owned macOS permission identity and release packaging | accepted |
| 0022 | desktop | sqlx for Snapshot Store | accepted |
| 0023 | desktop | Context Snapshot in shared snapshot module | accepted |
| 0024 | desktop | Bundled model download during onboarding | accepted |
| 0025 | mobile | Remote Agent Runtime | accepted |
| 0026 | mobile | Chat-first Mobile Surface | accepted |
| 0027 | mobile | Incremental scope through MVPs | accepted |
| 0028 | mobile | Runtime-shaped Dev Companion | accepted |
| 0029 | mobile | Local-first structured chat persistence | **superseded by 0001** (no on-device chat store) |
| 0030 | mobile | Auth before Relationship Onboarding | accepted |
| 0031 | mobile | Shared Control Plane for client apps | accepted |
| 0032 | mobile | Liquid Glass chat shell | accepted |
| 0033 | mobile | assistant-ui/native as Chat Primitive Engine | accepted |

## Origin → unified-number map

For anyone returning from one of the four old repos, the mapping is:

| Old path | New |
|---|---|
| `v1-controlplane/docs/adr/0001-…` | `0002-control-plane-…` |
| `v1-deepagent/docs/adr/0001…0004` | `0003…0006-agent-runtime-…` |
| `v1-tauri/docs/adr/0001…0018` | `0007…0024-desktop-…` |
| `v1-expo/docs/adr/0001…0009` | `0025…0033-mobile-…` |

## Writing a new ADR

1. Use the next sequential number (currently the next is `0034`).
2. Filename: `NNNN-<slug>.md`. No origin prefix for new ADRs — those are only for historical imports.
3. Format: see [the grill-with-docs skill's ADR template](../../.claude/skills/grill-with-docs/) — short is fine, single paragraph ADRs are allowed when the decision is simple.
4. Only write an ADR when all three are true: hard to reverse, surprising without context, the result of a real trade-off.
