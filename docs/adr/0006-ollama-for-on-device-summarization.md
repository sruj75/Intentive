# Use bundled Ollama for on-device LLM summarization

Intentive generates a prose summary of each Context Snapshot using a local LLM. We bundle the Ollama CLI binary inside the Tauri app (alongside the ScreenPipe binary) and manage its lifecycle as a private subprocess. Users never see or configure Ollama — it is an implementation detail.

On first launch, Intentive pulls `llama3.2:1b` (~1.3GB) and shows a one-time setup progress screen. After that, the model is cached locally and all summarization is fully offline.

## Considered Options

- **Apple Intelligence** (ScreenPipe `/ai/chat/completions`) — zero deps, but requires macOS 15.1+ in a specific configuration; not universally available even on Apple Silicon
- **User-configured API key** (OpenAI/Anthropic) — simple to build, but requires internet, has cost, and is off-device
- **RunAnywhere Swift SDK** — on-device, but requires a Tauri native plugin bridge into Swift; meaningful complexity
- **Bundled Ollama** — one standard for all users, on-device, private, no API keys, manageable complexity

A single standard was preferred over conditional logic (Apple Intelligence if available, fallback otherwise). Ollama is the only option that is on-device, free, and hardware-agnostic within the macOS Apple Silicon target.

## Consequences

- Ollama binary (~50MB) is bundled in Tauri resources alongside the ScreenPipe binary
- First-run requires a one-time model download — presented to the user as Intentive downloading its own components, no mention of Ollama in the UI
- If the user already has Ollama installed, Intentive detects and uses the existing installation
- Intentive owns port `11434`; conflict detection needed if another Ollama instance is running
- Model: `qwen3.5:0.8b` — small, fast, sufficient for prose summarization on Apple Silicon
