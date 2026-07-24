# Wrap ScreenPipe CLI binary rather than embed as Rust library

ScreenPipe ships a standalone CLI binary that runs a local HTTP server. Intentive bundles this binary, manages its lifecycle as a child process, and queries its HTTP API. We are not importing `screenpipe-engine` as a Rust library dependency.

## Considered Options

- **Bundle CLI binary (Approach 1)** — spawn the binary, talk HTTP, no Rust coupling. Low effort, ships fast.
- **Embed as Rust library (Approach 2)** — import `screenpipe-engine` crate directly for in-process control. Higher effort, full control.

We start with Approach 1. If ScreenPipe's HTTP API proves insufficient for a specific need, we evaluate Approach 2 for that gap only.

## Consequences

- ScreenPipe binary must be bundled in the Tauri app's resources and kept up to date
- The HTTP API is the integration boundary — Intentive does not touch ScreenPipe's SQLite directly unless the API cannot serve the need
- Intentive configures the bundled ScreenPipe process to use its own local port; see ADR-0013 for the current port assignment
- Approach 2 remains available as a targeted upgrade path, not a full rewrite
