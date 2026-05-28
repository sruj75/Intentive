# Working rules

Repo-wide constraints for most tasks. Read `docs/agents/domain.md` for glossary and ADR handling.

## Scope and boundaries

- Read [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) and [`../../docs/CONTEXT.md`](../../../../docs/CONTEXT.md) before changing module boundaries, orchestration, or integration seams.
- Keep changes scoped; match naming and patterns in the module you are editing.
- v1 is Apple Silicon macOS-only; capture, summarization, and delivery logic live primarily in Rust under `src-tauri/`.

## Settings and Auth

Settings/Auth uses Neon Auth UI. Keep endpoint URLs, API keys, and ScreenPipe diagnostics out of user-facing Settings. **Routing** and **Protocol** WebSocket session state are resolved after sign-in (see backlog #11), not user-entered.

## When to read more

| Task | Read first |
| --- | --- |
| UI or menu bar | `docs/agents/ui.md` |
| ScreenPipe or Ollama | `docs/agents/integrations.md` |
| Issue tracker (local markdown) | `../../../../docs/agents/issue-tracker.md`, `../../../../docs/agents/triage-labels.md` |
