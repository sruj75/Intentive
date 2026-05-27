# Working rules

Repo-wide constraints for most tasks. Read `docs/agents/domain.md` for glossary and ADR handling.

## Scope and boundaries

- Read `ARCHITECTURE.md` before changing module boundaries, orchestration, or integration seams.
- Keep changes scoped; match naming and patterns in the module you are editing.
- v1 is Apple Silicon macOS-only; capture, summarization, and delivery logic live primarily in Rust under `src-tauri/`.

## Settings and Auth

Settings/Auth uses Neon Auth UI. Keep endpoint URLs, API keys, and ScreenPipe diagnostics out of user-facing Settings. Auth-resolved Agent Interface configuration is a later slice.

## When to read more

| Task | Read first |
| --- | --- |
| UI or menu bar | `docs/agents/ui.md` |
| ScreenPipe or Ollama | `docs/agents/integrations.md` |
| Issue tracker (local markdown) | `../../../../docs/agents/issue-tracker.md`, `../../../../docs/agents/triage-labels.md` |
