# macOS permission detection and monitoring adapted from ScreenPipe

Capture Permission Setup (#32) detects and monitors the three required macOS grants — Screen & System Audio Recording, Microphone, Accessibility — using the battle-tested pattern from the bundled engine ([screenpipe-core `permissions.rs`](https://github.com/screenpipe/screenpipe/blob/main/crates/screenpipe-core/src/permissions.rs), [screenpipe-engine `permission_monitor.rs`](https://github.com/screenpipe/screenpipe/blob/main/crates/screenpipe-engine/src/permission_monitor.rs)) rather than an ad-hoc check. We adopt: pure **check-only** primitives in a no-UI Rust layer, **request/prompt** UI in the `onboarding` app layer, and a **monitor** that polls on an interval in #32, emitting a "readiness lost" event that the capture coordinator maps onto the `SetupRequired` shell state (ADR-0020).

## Decision

- **Check primitives (no-UI layer, capture domain or `providers/`):**
  - Screen Recording: `CGPreflightScreenCaptureAccess()` (fast, no dialog). **Plus a Tauri/macOS-15+ fallback** — the plain preflight is unreliable inside Tauri apps on Sequoia, so a `check_screen_recording_tauri()`-equivalent is required, not optional.
  - Microphone: `AVCaptureDevice authorizationStatusForMediaType:"soun"`.
  - Accessibility: `AXIsProcessTrusted()`.
  - All are **check-only**. Request/prompt (deep-link to the Privacy pane, open dialog) lives in the `onboarding` UI domain, never in the check layer.
- **Monitor:** #32 ships a poll-only monitor on a ~5s interval. It emits a "readiness lost" event on revocation; it does **not** stop capture itself. A **10s wake-grace** suppresses events after system sleep/wake to avoid false positives. The ~100ms eager detection path from capture-stream errors is deferred to #43 alongside the reliability harness work; until then, the coordinator still re-checks live readiness before classifying a ScreenPipe crash during capture so permission-caused exits recover through setup instead of generic error.
- **Subscriber:** the capture coordinator owns the FSM transition. Readiness-false ⟹ `SetupRequired` (ADR-0020), at first-run and mid-session alike.
- **Testability:** the check layer sits behind a trait seam (mirroring the existing `AuthChecker`/`StubAuthChecker`) so tests inject grant combinations without real OS state.

## Consequences

- macOS keys permissions to **bundle ID** (`com.heyintentive.tauri`); a dev build and the release build are distinct identities with separate grants — reinforcing why the real permission smoke runs on the notarized `/Applications/Intentive.app` (ADR-0015, #55), not `tauri dev`.
- The macOS-15+ Tauri screen-recording quirk is a **build/feasibility risk** called out in #32; "just call `CGPreflightScreenCaptureAccess`" would silently mis-report on the exact platform we ship.
- "Wedged" permission recovery (`tccutil reset ScreenCapture <bundle-id>`) is **out of scope for #32** and deferred to the #43 reliability harness.
- #32 leaves a worst-case ~5s transition latency for mid-session revocation until #43 adds the eager capture-stream-error signal.
- Monitoring is layered like ScreenPipe (detector emits, coordinator decides) so the detector has no knowledge of capture shell states.
