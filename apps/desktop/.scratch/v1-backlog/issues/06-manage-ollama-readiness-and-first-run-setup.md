# Manage Ollama readiness and first-run setup

Status: closed
Labels: enhancement, ready-for-agent
Opened: 2026-05-18T10:33:18Z
Updated: 2026-05-25T04:16:20Z
Closed: 2026-05-25T04:16:20Z

## Description

## Parent

#1

## What to build

Manage Ollama readiness and first-run Intentive setup for on-device summarization. A completed slice detects an existing Ollama service when available, starts Intentive's bundled Ollama when needed, handles port conflicts, pulls the selected local model, and exposes summarization readiness to the rest of the app.

## Acceptance criteria

- [ ] Intentive detects whether Ollama is already available on localhost:11434.
- [ ] Intentive can start the bundled Ollama binary when no compatible instance is running.
- [ ] An unresolved port conflict produces a clear error state instead of silently failing.
- [ ] First-run setup pulls the model selected by #2 and displays progress as Intentive setup.
- [ ] Subsequent launches skip model download when the model is already present.
- [ ] A simple local summarization readiness check succeeds before Capture Session summarization is allowed.
- [ ] Tests or a documented smoke check cover existing instance, spawned instance, model-present skip, model pull, and port conflict behavior.

## Blocked by

- #2


## Comments

(No comments.)
