# Architectural Decision Records

This repo is **multi-context** (see the root [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md)). ADRs live with the context they belong to:

- **System-wide decisions** stay here in `docs/adr/`, numbered from `0001`.
- **Context-specific decisions** live in that deployable's own `docs/adr/`, each numbered independently from `0001`.

| Context              | ADR home                                                                     |
| -------------------- | ---------------------------------------------------------------------------- |
| System-wide          | [`docs/adr/`](.)                                                             |
| Shared (`packages/`) | system-wide (see [ADR-0004](0004-shared-boundary-decode-package.md))         |
| Mobile Client        | [`apps/mobile/docs/adr/`](../../apps/mobile/docs/adr/)                       |
| Desktop Client       | [`apps/desktop/docs/adr/`](../../apps/desktop/docs/adr/)                     |
| Control Plane        | [`services/control-plane/docs/adr/`](../../services/control-plane/docs/adr/) |
| Agent Runtime        | [`services/agent-runtime/docs/adr/`](../../services/agent-runtime/docs/adr/) |

[ADR-0001](0001-unified-monorepo-foundation.md) is the foundational decision: the four origin repos collapsed into this monorepo. Reading it first will explain why the older context-specific ADRs are framed the way they are.

When a context-specific ADR references a system-wide one, it is written as **monorepo ADR-NNNN** with a relative link into this directory.

## System-wide index (`docs/adr/`)

| #    | Title                                                | Status   |
| ---- | ---------------------------------------------------- | -------- |
| 0001 | Unified monorepo foundation                          | accepted |
| 0002 | No standalone channels domain in Agent Runtime v1    | accepted |
| 0003 | Single live protocol shape v1                        | accepted |
| 0004 | Shared boundary-decode package (@intentive/boundary) | accepted |

## Context indexes

### Mobile Client — `apps/mobile/docs/adr/`

| #    | Title                                                            | Status                          |
| ---- | ---------------------------------------------------------------- | ------------------------------- |
| 0001 | Remote Agent Runtime                                             | accepted                        |
| 0002 | Chat-first Mobile Surface                                        | accepted                        |
| 0003 | Incremental scope through MVPs                                   | accepted                        |
| 0004 | Runtime-shaped Dev Companion                                     | accepted                        |
| 0005 | Local-first structured chat persistence                          | **superseded by monorepo 0001** |
| 0006 | Auth before Relationship Onboarding                              | accepted                        |
| 0007 | Shared Control Plane for client apps                             | accepted                        |
| 0008 | Liquid Glass chat shell                                          | accepted                        |
| 0009 | assistant-ui/native as Chat Primitive Engine                     | accepted                        |
| 0010 | Navigation and capability as orthogonal axes                     | accepted                        |
| 0011 | Launch State as in-memory projection of CP gate truth            | accepted                        |
| 0012 | Auth Adapter with dev provider                                   | accepted                        |
| 0013 | Consent Primer writes Launch State directly — no consent service | accepted                        |
| 0014 | Sibling Client Invitation is a skippable invite screen           | accepted                        |

### Desktop Client — `apps/desktop/docs/adr/`

| #    | Title                                                          | Status                                                                                           |
| ---- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 0001 | Tauri over Electron                                            | accepted                                                                                         |
| 0002 | Wrap ScreenPipe CLI binary                                     | accepted                                                                                         |
| 0003 | Menu-bar-only UI v1                                            | accepted                                                                                         |
| 0004 | Push Context Snapshots to the agent                            | **superseded by monorepo 0001** (delivery is now over the WebSocket Protocol, not HTTPS webhook) |
| 0005 | Drop failed snapshot pushes v1                                 | accepted (channel changed; principle holds)                                                      |
| 0006 | Ollama for on-device summarization                             | accepted                                                                                         |
| 0007 | Local snapshot log with retention                              | accepted                                                                                         |
| 0008 | Fixed-interval Heartbeat with Session End Marker               | accepted                                                                                         |
| 0009 | Auto-start capture after auth with consent at sign-in          | accepted                                                                                         |
| 0010 | Neon Auth for user-owned agent config                          | accepted                                                                                         |
| 0011 | No ScreenPipe crash retry in v1                                | accepted                                                                                         |
| 0012 | Subprocess manager shutdown intent flag                        | accepted                                                                                         |
| 0013 | Unique local ports for bundled binaries                        | accepted                                                                                         |
| 0014 | macOS CPU variants for bundled native artifacts                | accepted                                                                                         |
| 0015 | Product-owned macOS permission identity and release packaging  | accepted                                                                                         |
| 0016 | sqlx for Snapshot Store                                        | accepted                                                                                         |
| 0017 | Context Snapshot in shared snapshot module                     | accepted                                                                                         |
| 0018 | Bundled model download during onboarding                       | accepted                                                                                         |
| 0019 | Rust owns Routing and WS session                               | accepted                                                                                         |
| 0020 | Local three-grant interlock authoritative over CP capture gate | accepted                                                                                         |
| 0021 | Permission detection adapted from ScreenPipe                   | accepted                                                                                         |
| 0022 | Session End Marker before ScreenPipe shutdown                  | accepted                                                                                         |

### Control Plane — `services/control-plane/docs/adr/`

| #    | Title                                                | Status   |
| ---- | ---------------------------------------------------- | -------- |
| 0001 | Control Plane as source of truth                     | accepted |
| 0002 | Runtime JWT is the pass-through Neon Auth token      | accepted |
| 0003 | Repo-layer tests run against ephemeral Neon branches | accepted |
| 0004 | AccountState assembled by the identity composer      | accepted |
| 0005 | Device-aware gates from live client signals          | accepted |

### Agent Runtime — `services/agent-runtime/docs/adr/`

| #    | Title                                                                 | Status                                                    |
| ---- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| 0001 | OpenClaw patterns as default                                          | accepted                                                  |
| 0002 | Vertical-first progressive layering                                   | **amended by monorepo 0001**                              |
| 0003 | WebSocket protocol contract v1                                        | **amended by monorepo 0003**                              |
| 0004 | DB-backed VFS overlay model v1                                        | **refined by 0005; amended 2026-05-29 (pin boundary)**    |
| 0005 | VFS write policy: immutable procedure files, writable knowledge files | accepted                                                  |
| 0006 | Session Snapshot as a separate history projection                     | accepted                                                  |
| 0007 | Event ledger and in-memory per-user ordering                          | accepted                                                  |
| 0008 | Conversation History owns its own domain                              | accepted                                                  |
| 0009 | Transactional ingress projections                                     | accepted; amended 2026-06-11 (commit in Per-User Channel) |

## Migration map (old unified number → new per-context number)

When the repo moved from a single `docs/adr/` to per-context ADR directories, every imported ADR was renumbered. Filenames kept their slug; only the leading number changed. References from one ADR to another were updated to the new scheme.

| Old (unified) | New       | Context                 |
| ------------- | --------- | ----------------------- |
| 0001          | 0001      | System-wide             |
| 0002          | 0001      | Control Plane           |
| 0003          | 0001      | Agent Runtime           |
| 0004          | 0002      | Agent Runtime           |
| 0005          | 0003      | Agent Runtime           |
| 0006          | 0004      | Agent Runtime           |
| 0007–0024     | 0001–0018 | Desktop (new = old − 6) |
| 0025–0033     | 0001–0009 | Mobile (new = old − 24) |
| 0034          | 0002      | System-wide             |
| 0035          | 0003      | System-wide             |
| 0036          | 0005      | Agent Runtime           |
| 0037          | 0006      | Agent Runtime           |
| 0038          | 0002      | Control Plane           |

Pre-monorepo origin (for anyone returning from one of the four old repos):

| Old repo path                     | Unified   | New per-context         |
| --------------------------------- | --------- | ----------------------- |
| `v1-controlplane/docs/adr/0001`   | 0002      | control-plane 0001      |
| `v1-deepagent/docs/adr/0001…0004` | 0003…0006 | agent-runtime 0001…0004 |
| `v1-tauri/docs/adr/0001…0018`     | 0007…0024 | desktop 0001…0018       |
| `v1-expo/docs/adr/0001…0009`      | 0025…0033 | mobile 0001…0009        |

## Writing a new ADR

1. Decide which context owns the decision. System-wide → `docs/adr/`. Otherwise → that deployable's `docs/adr/`.
2. Use the next sequential number **within that context**.
3. Filename: `NNNN-<slug>.md`. No origin prefix for new ADRs — those prefixes are only historical artifacts of the import.
4. To reference a system-wide ADR from a context, write **monorepo ADR-NNNN** with a relative link into `docs/adr/`.
5. Format: follow the `matt-pocock-engineering:grill-with-docs` ADR template guidance — short is fine, single-paragraph ADRs are allowed when the decision is simple.
6. Only write an ADR when all three are true: hard to reverse, surprising without context, the result of a real trade-off.
