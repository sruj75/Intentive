# macOS CPU variants for bundled ScreenPipe and Ollama artifacts

Intentive bundles third-party CLI binaries (ScreenPipe first; bundled Ollama under the same rule) inside the Tauri app. The executable must match the host **Mac CPU variant** when Intel support ships; v1 does not ship Intel variants yet. Selection is never per signed-in user — everyone on the same Intentive release runs the same pinned artifact for their CPU class.

## Context

ScreenPipe publishes platform packages on npm (e.g. `@screenpipe/cli-darwin-arm64@0.3.336`, `@screenpipe/cli-darwin-x64@<same version>`). Issue #5 implements subprocess lifecycle against a resolved resource path; acquiring and packaging the **Bundled Native Artifact** completes before closing #5 / #7 for real-device smoke.

## Decision (v1)

- **Supported hardware**: **Apple Silicon (M-series) Macs only.** Intel Macs are out of scope for v1.
- **ScreenPipe artifact**: Bundle only `@screenpipe/cli-darwin-arm64` at a **pinned version** per Intentive release (e.g. `0.3.336`). Copy into `src-tauri/resources/screenpipe`, list in `tauri.conf.json` `bundle.resources`, resolve via `BaseDirectory::Resource`.
- **Source of truth**: Official ScreenPipe npm platform packages — not user `npm install` at runtime.
- **Selection axis** (when Intel ships): **Mac CPU variant only** — not Neon user, OpenClaw Agent, or Settings.
- **Linux/Windows**: out of scope (macOS-only product, ADR-0001 / ADR-0003).

## Deferred (not decided)

How to support Intel Macs in a **future** iteration — pick when there is demand and QA capacity:

| Option | Summary |
|--------|---------|
| **Two release builds** | Separate Intentive builds: arm64 app with `cli-darwin-arm64`, x64 app with `cli-darwin-x64`. |
| **One app, both arches** | Both binaries in resources; runtime picks `aarch64` vs `x86_64` at spawn. |

Until one of these is chosen and documented, do not bundle `cli-darwin-x64` or claim “all Macs” in marketing or requirements.

## Considered Options (v1)

- **Apple Silicon only (chosen)**: fastest path; clear requirement (“M-series Macs only”).
- **Two release builds / single app dual-binary**: rejected for v1; deferred above.

## Consequences

- CI/release and dev smoke use **arm64 only**; no x64 fetch or dual-resource wiring in v1.
- Product copy and [SPEC.md](../../SPEC.md) non-goals must state M-series requirement so Intel users are not surprised.
- ADR-0002 remains spawn-via-HTTP; ADR-0013 ports apply to the bundled child on `44380` / `44381`.
- When Intel support lands, add a new ADR amendment or superseding ADR for the chosen B vs C packaging tactic.
