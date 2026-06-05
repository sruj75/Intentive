# Intentive — Agent Map

This is a table of contents, not an encyclopedia. Read [`CONTEXT-MAP.md`](CONTEXT-MAP.md) for the context map and shared product language (then the owning deployable's own `CONTEXT.md`) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for structure before making changes.

## Agent skills

### Issue tracker

Issues are tracked on [GitHub](https://github.com/sruj75/Intentive/issues) (#7–#56 for the v1 backlog; PRDs at `docs/prd/`; board at [`docs/ISSUE-BOARD.md`](docs/ISSUE-BOARD.md)). See `docs/agents/issue-tracker.md`.

### Triage labels

Triage roles use the canonical five-label vocabulary with no overrides. See `docs/agents/triage-labels.md`.

### Domain docs

This repo is configured as multi-context: read the root `CONTEXT-MAP.md` for the context map and shared product language, then the owning deployable's own `CONTEXT.md` and the relevant decisions in `docs/adr/` (system-wide) or that deployable's `docs/adr/`. See `docs/agents/domain.md`.

## Start here

| If you need...                                                                  | Read                                                                        |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Domain language (Companion, Agent Runtime, Pre-Chat Gate, Post-Message-Back...) | [`CONTEXT-MAP.md`](CONTEXT-MAP.md) + the owning deployable's `CONTEXT.md`   |
| Layer rule, deployable topology, directory layout                               | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                              |
| Filename casing, parse-at-boundary, other conventions                           | [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md)                                |
| Verification commands and test ownership                                        | [`docs/TESTING.md`](docs/TESTING.md)                                        |
| Why a specific decision was made                                                | [`docs/adr/`](docs/adr/) (system-wide) or that deployable's own `docs/adr/` |
| Sequenced v1 backlog and dependencies                                           | [`docs/ISSUE-BOARD.md`](docs/ISSUE-BOARD.md)                                |
| Active or completed multi-step plans                                            | each deployable's own `docs/plans/` (where present)                         |
| Per-deployable working rules                                                    | each deployable's own `AGENTS.md`                                           |

## The four deployables

| Path                                                 | Role                                           | Stack                         |
| ---------------------------------------------------- | ---------------------------------------------- | ----------------------------- |
| [`apps/mobile/`](apps/mobile/)                       | Mobile Client (iOS, chat surface)              | Expo / React Native           |
| [`apps/desktop/`](apps/desktop/)                     | Desktop Client (macOS, capture only — no chat) | Tauri (Rust + Vite/React)     |
| [`services/control-plane/`](services/control-plane/) | Identity, devices, routing, notifications      | Node/TS → Cloud Run           |
| [`services/agent-runtime/`](services/agent-runtime/) | The always-alive Companion runtime             | Node/TS + DeepAgents → GCE VM |

## The shared packages

Working rules and contract-change ordering: [`packages/AGENTS.md`](packages/AGENTS.md).

| Path                                               | Owns                                                                                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [`packages/protocol/`](packages/protocol/)         | WebSocket event schemas (Zod). The single source of truth for client↔runtime wire format. |
| [`packages/api-contract/`](packages/api-contract/) | Control Plane HTTP request/response schemas.                                              |
| [`packages/domain-types/`](packages/domain-types/) | Shared domain shapes not tied to a wire format.                                           |
| [`packages/providers/`](packages/providers/)       | Shared cross-cutting clients (auth/JWKS, telemetry, feature flags).                       |

## Inviolable rules (enforced by lint)

1. **Layer direction.** Within a domain, code depends forward through `types → config → repo → service → runtime → ui`. Backward imports fail CI.
2. **No cross-deployable imports.** `apps/mobile/**` cannot import from `apps/desktop/**` or `services/**`. Shared code lives in `packages/`.
3. **Cross-cutting only via Providers.** Auth, telemetry, and feature-flag access goes through `packages/providers/` or a domain's own `providers/` re-export. Direct imports of those concerns from anywhere else fail CI.
4. **CONTEXT.md vocabulary.** Terms in `_Avoid_` lists must not appear in source. Lint surfaces the canonical term in the error.
5. **One protocol version.** `packages/protocol/` is imported at one version across the whole monorepo. Stale imports fail typecheck.

## When you are about to do something

| About to...                      | First check                                                                                                                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a new term or rename one     | the owning context's `CONTEXT.md` (see `CONTEXT-MAP.md`) — update it before the code                                                                                                                |
| Change a module boundary         | `docs/ARCHITECTURE.md` and the layer rule                                                                                                                                                           |
| Add a runtime dependency         | Does it belong in `packages/`?                                                                                                                                                                      |
| Change a WebSocket event         | `packages/protocol/` is the source of truth                                                                                                                                                         |
| Add a new Control Plane endpoint | `packages/api-contract/` first, implementation second                                                                                                                                               |
| Make a non-trivial decision      | Consider an ADR in the owning context's `docs/adr/` (system-wide → `docs/adr/`; per-deployable → that deployable's `docs/adr/`). See [`docs/adr/README.md`](docs/adr/README.md) for the convention. |
