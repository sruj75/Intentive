# Intentive macOS app

Intentive is a macOS Tauri desktop client: ScreenPipe capture, on-device summarization, local Context Snapshot logging, and push to an OpenClaw Agent.

## Essentials

- **Stack** — React (`src/`) + Rust/Tauri (`src-tauri/`). npm for the frontend; Cargo for the backend.
- **Domain language** — Use terms from `CONTEXT.md` (Intentive, ScreenPipe, Context Snapshot, Context Heartbeat, OpenClaw Agent, etc.).
- **Structure** — Read `ARCHITECTURE.md` before changing module boundaries or orchestration. ADR conflicts must be called out explicitly (`docs/adr/`).
- **Verify** — `docs/agents/build.md` lists dev, test, typecheck, and Rust lint commands.

## Agent docs

| Doc | When |
| --- | --- |
| `docs/agents/working-rules.md` | Repo-wide constraints (platform, Auth UI, scoped edits) |
| `docs/agents/build.md` | Commands, CI, release tags, Auth env vars |
| `docs/agents/domain.md` | Glossary, ADRs, vocabulary |
| `docs/agents/ui.md` | Settings, menu bar, macOS-native UI |
| `docs/agents/integrations.md` | ScreenPipe, Ollama, capture debug skills |
| `docs/agents/issue-tracker.md` | GitHub issues via `gh` |
| `docs/agents/triage-labels.md` | Issue labels |

## Product and design

- `ARCHITECTURE.md` — codemap, invariants, boundaries
- `CONTEXT.md` — glossary and domain relationships
- `SPEC.md` — v1 requirements and acceptance criteria
- `PRD.md` — product requirements
- `DESIGN.md` — brand and UX system
- `CHANGELOG.md` — update `[Unreleased]` for user-visible changes
