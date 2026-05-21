# Unique local ports for Intentive-bundled ScreenPipe and Ollama

Intentive's bundled ScreenPipe binary listens on `44380`. Intentive's bundled Ollama binary (Tier 3 LLM Provider) listens on `44381`. These replace the default ports (`3030` and `11434` respectively).

## Context

ScreenPipe's default port is `3030`, Ollama's is `11434`. Both are well-known and likely to be occupied on developer machines. A port conflict causes the bundled binary to fail immediately on bind — which looks identical to a crash and would consume the one silent retry (ADR-0011) without the user understanding why.

Because Intentive bundles and manages these binaries itself, it can configure their ports via CLI flags at spawn time. Picking obscure ports in the high registered range (below ephemeral at 49152) eliminates accidental collisions.

## Decision

- **Bundled ScreenPipe**: `44380` (passed via `record --port 44380` at spawn)
- **Bundled Ollama (Tier 3)**: `44381` (passed via `OLLAMA_HOST=127.0.0.1:44381`)
- **Existing Ollama (Tier 2)**: `11434` — this is the user's own installation; Intentive reads it, does not configure it

Before spawning ScreenPipe, the subprocess manager performs a pre-spawn TCP probe to `127.0.0.1:44380`. If the probe succeeds (port is already bound), Intentive skips the spawn entirely and enters Capture Error state with copy: **"Can't start — port conflict"**. This path does not consume the crash retry.

## Considered Options

- **Keep default ports (`3030` / `11434`):** trivial to implement but collides with common developer setups and with users who run ScreenPipe or Ollama independently.
- **Dynamic port selection (bind to :0):** eliminates conflicts but requires the subprocess manager to read the assigned port back from the child process stdout, adding complexity with no benefit given we control the binary.

## Consequences

- All internal references to `localhost:3030` for ScreenPipe and `localhost:11434` for bundled Ollama must use the configured ports (`44380` / `44381`).
- `ProviderConfig` must distinguish `bundled_ollama_url` (`127.0.0.1:44381`) from `existing_ollama_url` (`127.0.0.1:11434`).
- Pre-spawn port probe is a fast TCP connect with a short timeout (~200ms). If it times out (neither connect nor refuse), treat port as free and proceed.
- If a zombie Intentive-owned ScreenPipe holds `44380` from a crashed prior session, the probe fires the "another app" error. User relaunches — startup cleanup logic should attempt to kill any orphaned process on `44380` before probing.
