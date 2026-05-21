# Product-owned macOS permission identity and release packaging

Intentive v1 ships as a direct-download, Developer ID signed and notarized Apple Silicon macOS app distributed in a DMG containing only `Intentive.app`; release builds use product name **Intentive** and bundle identifier `com.tryintentive.tauri`. macOS Privacy Settings must show **Intentive** as the user-facing permission owner, with **Intentive Capture** as the only acceptable fallback helper identity; `ScreenPipe`, lowercase `intentive`, debug paths, or raw helper names are release blockers.

## Considered Options

- **Raw bundled ScreenPipe resource** — keep launching `resources/screenpipe` directly. Acceptable only if the signed, notarized `/Applications/Intentive.app` build proves macOS attributes capture permission to **Intentive**.
- **Intentive-owned signed helper/sidecar** — preserve ADR-0002's child-process boundary while giving macOS a product-owned capture identity. Use this if the raw resource path does not pass release identity smoke.
- **Embed `screenpipe-engine` in-process** — revisit ADR-0002 only if neither product-owned child-process option can produce **Intentive** or **Intentive Capture** in macOS Privacy Settings.

## Consequences

- `tauri dev` is not sufficient release evidence for permission identity; final smoke must install the notarized DMG into `/Applications/Intentive.app`.
- Capture Permission Setup is a v1 product requirement: it guides users through Screen & System Audio Recording, Microphone, and Accessibility with curated instructional screenshots, opens the relevant macOS Privacy Settings pane when possible, and waits for live OS grants before capture-ready Auth can auto-start a Capture Session.
- Release smoke must verify the menu bar item, macOS Privacy Settings, Login Items when enabled, ScreenPipe health on `127.0.0.1:44380`, frame/audio writes, stop cleanup, quit cleanup, and absence of debug or ScreenPipe-facing identity.
