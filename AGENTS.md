# Intentive macOS app

Intentive macOS Tauri app that runs ScreenPipe capture, summarizes activity on-device, and pushes Context Snapshots to an OpenClaw Agent.

## Working rules

- Use domain vocabulary from `CONTEXT.md` (Intentive, ScreenPipe, Context Snapshot, Context Heartbeat, OpenClaw Agent, and related terms).
- Read `ARCHITECTURE.md` before changing module boundaries, orchestration, or integration seams.
- If work conflicts with an ADR in `docs/adr/`, call it out explicitly instead of overriding silently.
- v1 is macOS-only; capture, summarization, and delivery logic live primarily in Rust under `src-tauri/`.
- Settings/Auth uses Neon Auth UI. Keep endpoint URLs, API keys, and ScreenPipe diagnostics out of user-facing Settings; Auth-resolved Agent Interface configuration is a later slice.
- Keep changes scoped; match naming and patterns in the module you are editing.
- When changing UI, read `DESIGN.md` and `.claude/commands/macos-design.md` (plus `.claude/commands/references/` as that command directs).
- When integrating ScreenPipe or Ollama, read `references/` (`screenpipe-routes-llms.txt`, `ollama-api-llms.txt`, `ollama-server-llms.txt`).

## Commands

Run from the repository root unless noted.

| Task | Command |
| --- | --- |
| Full desktop app (preferred) | `npm run tauri dev` |
| Frontend unit tests | `npm test` |
| Frontend typecheck + bundle | `npm run build` |
| Rust check | `cargo check --manifest-path src-tauri/Cargo.toml` |
| Rust tests | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Rust lint (CI parity) | `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` |

`npm run dev` starts Vite only; Tauri invokes it automatically during `tauri dev`. CI runs the frontend and Rust commands above on every PR. Pushing a `v*` tag triggers the macOS release workflow.

The frontend Auth surface requires `VITE_NEON_AUTH_URL=<Neon Auth URL from the Neon Console>` for dev/build runs. `VITE_NEON_DATA_API_URL` is known but intentionally unused until Auth-resolved Agent Interface configuration lands.

## Read more

- `ARCHITECTURE.md` — system overview, codemap, invariants, and boundaries (start here for structural work).
- `CONTEXT.md` — product glossary and domain relationships.
- `SPEC.md` — v1 requirements and acceptance criteria.
- `DESIGN.md` — Intentive brand and UX design system.
- `.claude/commands/macos-design.md` — native macOS UI patterns; read before UI work (companion refs in `.claude/commands/references/`).
- `PRD.md` — product requirements.
- `CHANGELOG.md` — release history and notable changes; update `[Unreleased]` for user-visible work.
- `docs/agents/domain.md` — how to use domain docs, ADRs, and glossary rules.
- `docs/agents/issue-tracker.md` — GitHub issue workflows via `gh`.
- `docs/agents/triage-labels.md` — issue labels used in this repo.
- `docs/adr/` — architectural decisions; read before changing system boundaries.
- `references/` — ScreenPipe HTTP routes and Ollama API notes for capture/summarization work.
- `.claude/skills/screenpipe-*/` — ScreenPipe health, API, CLI, and logs when debugging capture.
