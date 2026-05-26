# Bundled model download during onboarding, user-initiated and non-blocking

When Intentive needs to download `qwen3.5:0.8b` for the Tier 3 LLM Provider (bundled Ollama), the download is triggered by the user pressing Continue on a dedicated onboarding step. The download runs in the background and onboarding continues immediately — the user is not blocked waiting for it to finish.

## Considered Options

- **Design A — automatic post-auth download**: download starts silently as part of "Setting up Intentive…" after sign-in. Rejected: 500MB bandwidth usage with no user awareness or consent.
- **Design B — user-initiated during onboarding (chosen)**: a specific onboarding step explains the model download, the user presses Continue, the download starts in the background, and onboarding proceeds in parallel.
- **Design C — pre-auth first-launch download**: download before sign-in begins. Rejected: ScreenPipe is not running pre-auth, so the Apple Intelligence check (Tier 1) cannot be performed via ScreenPipe's `/ai/status` endpoint. Resolving the LLM Provider tier requires ScreenPipe to be available.

## Consequences

- The onboarding flow must include a model download step that fires a background download and immediately returns control to the user.
- The download progress is exposed via a channel so the onboarding UI can show a percentage bar (superwhisper-style) without blocking navigation.
- `LlmProvider::resolve()` is called post-auth at capture start. The Capture Session does not wait for the model download — ScreenPipe starts recording immediately. The LLM Provider is only needed when the first Context Heartbeat tick fires at 10 minutes; in practice the download finishes well before then. If the model is still not ready when the heartbeat fires, that tick is skipped.
- Pull failure (network error, disk full) is surfaced in the onboarding UI with a single **Retry** button. There is no skip path. If the user closes the app without retrying, the next launch re-enters the download step because the model is still absent.
