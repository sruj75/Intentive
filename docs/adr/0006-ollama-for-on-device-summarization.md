# Tiered on-device LLM provider: Apple Intelligence → existing Ollama → bundled Ollama

Intentive resolves its LLM Provider at startup using a priority-ordered detection sequence. All tiers are fully on-device — no API keys, no network egress for summarization.

**Detection order:**
1. **Apple Intelligence** — check ScreenPipe's `/ai/status` endpoint. If available, use `/ai/chat/completions`. Zero dependencies, zero download. Requires Apple Silicon + macOS 15.1+ with Apple Intelligence enabled.
2. **Existing Ollama** — check `localhost:11434`. If an Ollama instance is already running, use it. No download needed.
3. **Bundled Ollama** — if neither above is available, Intentive uses its own bundled Ollama binary and pulls `qwen3.5:0.8b` on first run (~0.8GB). Shown to the user as "Setting up Intentive…" with a progress indicator — no mention of Ollama in the UI.

The user never selects or sees the provider. Intentive picks the best available option silently.

## Why tiered rather than a single standard

A single standard (Ollama always) was initially preferred for simplicity. Apple Intelligence was added back as the first-choice tier because: it is already exposed via ScreenPipe's HTTP API (zero additional dependencies), eliminates the first-run download for users who have it, and is fully private. The detection logic is a small `if/else` at startup — not meaningful complexity.

## Considered Options

- **Always Ollama (bundled)** — one standard, but forces a download even when unnecessary
- **Apple Intelligence only** — zero deps, but excludes users without macOS 15.1+ + Apple Silicon (confirmed: author's own M2 Air did not have it enabled)
- **User-configured API key** — simplest to build, but off-device and has cost
- **RunAnywhere Swift SDK** — on-device, but requires a Tauri native plugin bridge into Swift

## Consequences

- Startup must probe Apple Intelligence and Ollama before the first Capture Session begins
- First-run download only occurs if neither Apple Intelligence nor an existing Ollama is found
- `qwen3.5:0.8b` is the model for the bundled Ollama path — verify exact Ollama registry tag before implementation
- If the user already has Ollama running, Intentive uses port `11434` without spawning a duplicate; conflict detection still needed for the bundled path
