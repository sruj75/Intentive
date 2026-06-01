# Use Tauri instead of Electron for the desktop shell

Intentive is a persistent background service with a minimal menu bar UI. Electron bundles a full Chromium runtime (~200MB+) that would run 24/7, which is wasteful for a silent capture daemon. Tauri uses the macOS system WebView (WKWebView), has a significantly smaller footprint, and shares the Rust ecosystem with ScreenPipe itself. We chose Tauri.

## Considered Options

- **Electron** — familiar, large ecosystem, but heavyweight for a background process
- **Tauri** — lightweight, native macOS WebView, Rust-native, aligns with ScreenPipe's own stack
- **Pure Rust binary + SwiftUI menu bar** — maximum control, but high implementation cost for the UI layer

## Consequences

- Frontend is TypeScript + React (standard Tauri stack)
- Rust toolchain is required in the dev environment
- Future capability to embed `screenpipe-engine` as a Rust library (Approach 2) is unlocked without an app framework change
