# Unique local ports for Intentive-bundled ScreenPipe and Ollama

Intentive's bundled ScreenPipe binary listens on `44380`, with `44382` as fallback. Intentive's bundled Ollama binary (Tier 3 LLM Provider) listens on `44381`, with `44383` as fallback. These replace the default ports (`3030` and `11434` respectively).

## Context

ScreenPipe's default port is `3030`, Ollama's is `11434`. Both are well-known and likely to be occupied on developer machines. A port conflict causes the bundled binary to fail immediately on bind — which looks identical to a crash and would consume the one silent retry (ADR-0011) without the user understanding why.

Because Intentive bundles and manages these binaries itself, it can configure their ports via CLI flags at spawn time. Picking obscure ports in the high registered range (below ephemeral at 49152) eliminates accidental collisions.

## Decision

- **Bundled ScreenPipe**: `44380` primary, `44382` fallback (passed via `record --port <resolved port>` at spawn)
- **Bundled Ollama (Tier 3)**: `44381` primary, `44383` fallback (passed via `OLLAMA_HOST=127.0.0.1:<resolved port>`)
- **Existing Ollama (Tier 2)**: `11434` — this is the user's own installation; Intentive reads it, does not configure it

Before spawning each bundled binary, the subprocess manager performs a pre-spawn TCP probe. If the primary port is occupied, it tries the fallback port. If the fallback is also occupied, Intentive enters an error state — something genuinely unusual is happening.

| Binary | Primary | Fallback |
|---|---|---|
| Bundled ScreenPipe | `44380` | `44382` |
| Bundled Ollama (Tier 3) | `44381` | `44383` |

Fallbacks skip by 2 so the two binaries can never accidentally claim each other's fallback. Existing Ollama (Tier 2) is always read at `11434` — Intentive does not configure or conflict with a user's own installation.

The actual port used is determined at spawn time and exposed through the owning module: `screenpipe_supervisor` records the ScreenPipe endpoint for consumers such as the Context Heartbeat / LLM Provider, and the bundled LLM Provider subprocess updates its effective Ollama URL before readiness checks and summarization. Ports are not compile-time constants.

## Considered Options

- **Keep default ports (`3030` / `11434`):** trivial to implement but collides with common developer setups and with users who run ScreenPipe or Ollama independently.
- **Dynamic port selection (bind to :0):** eliminates conflicts but requires reading the assigned port back from child stdout, adding complexity.
- **Error on primary port conflict (original):** simpler but forces user intervention for what is almost always a zombie from a crashed prior Intentive session.

## Consequences

- `ProviderConfig` must distinguish `bundled_ollama_url` (resolved at spawn, default `127.0.0.1:44381`) from `existing_ollama_url` (`127.0.0.1:11434`).
- `screenpipe_supervisor` and the LLM Provider subprocess manager both resolve ports at runtime and publish the effective endpoint through their small public surfaces.
- Pre-spawn TCP probe timeout: ~200ms. Timeout (no response) → treat as free and proceed.
- If both primary and fallback are occupied, surface a specific error: **"Can't start — all Intentive ports in use."**
