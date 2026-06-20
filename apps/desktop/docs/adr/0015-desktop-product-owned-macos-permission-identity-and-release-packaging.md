# Product-owned macOS permission identity and release packaging

Intentive v1 ships as a direct-download, Developer ID signed and notarized Apple Silicon macOS app distributed in a DMG containing only `Intentive.app`; release builds use product name **Intentive** and bundle identifier `com.heyintentive.tauri`. macOS Privacy Settings must show **Intentive** as the user-facing permission owner; `ScreenPipe`, lowercase `intentive`, debug paths, or raw helper names are release blockers.

## Considered Options

- **Raw bundled ScreenPipe resource** — keep launching `resources/screenpipe` directly. Acceptable only if the signed, notarized `/Applications/Intentive.app` build proves macOS attributes capture permission to **Intentive**.
- **Intentive-owned signed helper/sidecar** — preserve ADR-0002's child-process boundary while giving macOS a product-owned capture identity. Use this if the raw resource path does not pass release identity smoke.
- **Embed `screenpipe-engine` in-process** — revisit ADR-0002 only if the product-owned child-process option cannot produce **Intentive** in macOS Privacy Settings.

## Decision (amended 2026-06-20)

We commit to the **Intentive-owned signed helper** path up front rather than first shipping the raw resource and waiting for a clean-Mac observation. macOS attributes Screen Recording to the process that calls ScreenCaptureKit (ScreenPipe), and a bare executable carries no display name to control, so the raw path is expected to surface `screenpipe` — a release blocker under this ADR. The ScreenPipe binary is therefore wrapped in a child `.app` bundle whose `CFBundleDisplayName` and `CFBundleName` are **Intentive**, signed with Developer ID, and spawned over HTTP exactly as ADR-0002 prescribes. The helper remains the TCC principal (`com.heyintentive.capture`), but the user-facing identity should read **Intentive**. The clean-Mac install still runs as the release identity smoke (Consequences below) to confirm the string and catch any surprise, but it is a verification gate, not a branch point.

## Packaging mechanics (amended 2026-06-20)

These follow from the helper-bundle decision above and from Apple's notarization requirements; they are forced, not discretionary.

- **Helper bundle layout.** The ScreenPipe binary is relocated from a flat `resources/screenpipe` into a child app bundle:
  `Intentive Capture.app/Contents/Info.plist` (`CFBundleDisplayName = Intentive`, `CFBundleName = Intentive`, `CFBundleIdentifier = com.heyintentive.capture`, `CFBundleExecutable = screenpipe`) and `Intentive Capture.app/Contents/MacOS/screenpipe`. The capture supervisor's resolved spawn path changes accordingly (today `resources/screenpipe` at `lib.rs`; see the plan doc). The child-process / HTTP boundary of ADR-0002 is unchanged — only the on-disk shape and the TCC-visible name change. Ollama remains a flat signed resource (it is never a TCC principal).
- **Deep-sign every nested Mach-O, inside-out.** Notarization rejects any unsigned nested executable. Tauri auto-signs `externalBin` sidecars but **not** files under `bundle.resources`, which is where the helper bundle and Ollama live. The release workflow must therefore explicitly `codesign --options runtime --timestamp` the helper's inner `screenpipe`, then the `Intentive Capture.app`, then `ollama`, **before** Tauri seals and signs the outer `Intentive.app` — deepest first.
- **Hardened runtime + entitlements (Apple-required for notarization).** Hardened runtime is enabled on the main app and the helper. The main app declares the entitlements its WebView and child-spawning need (e.g. JIT for the web content); the helper declares microphone/audio-input. No App Sandbox (Developer ID direct distribution does not require it). The exact entitlement keys are captured in the plan doc.
- **Bundle config.** `productName` becomes `Intentive` (capitalized — lowercase `intentive` is a release blocker per the decision statement), `bundle.targets` narrows to `["dmg"]`, and `createUpdaterArtifacts: true` is set for the updater (ADR-0024). The signing identity is supplied via CI env (Developer ID Application: Srujan Gowda, Team `24D6NXS6H7`).
- **One release pipeline.** The root `.github/workflows/desktop-release.yml` (triggered on `desktop-v*` tags) is the only release path; the orphaned `apps/desktop/.github/workflows/release.yml` (npm, unsigned, never executed by GitHub) is deleted to remove the false signal.

## Consequences

- `tauri dev` is not sufficient release evidence for permission identity; final smoke must install the notarized DMG into `/Applications/Intentive.app`. The clean-Mac install is simulated on the developer's own Mac per `docs/RELEASE.md` (no second machine required).
- Capture Permission Setup is a v1 product requirement: it collects desktop capture consent on the recording Mac, guides users through Screen & System Audio Recording, Microphone, and Accessibility with curated instructional screenshots, opens the relevant macOS Privacy Settings pane when possible, and waits for live OS grants before the Control Plane may confirm Desktop Capture Readiness and allow auto-start.
- Release smoke must verify the menu bar item, macOS Privacy Settings, Login Items when enabled, ScreenPipe health on `127.0.0.1:44380`, frame/audio writes, stop cleanup, quit cleanup, and absence of debug or ScreenPipe-facing identity.
