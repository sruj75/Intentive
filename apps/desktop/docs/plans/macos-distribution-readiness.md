# Plan — macOS distribution readiness (#53, #54, #55, #56)

**Status:** designed & grilled, build deferred. Branch `macos-app-distribution-readiness`.
**Decisions captured in:** ADR-0015 (packaging + identity, amended), ADR-0024 (updater), [`RELEASE.md`](../RELEASE.md).

One PR makes the Desktop Client distribution-ready: signed, notarized, correctly identified in macOS Privacy Settings, self-updating, and verifiable. The four issues collapse into one build because a single notarized install on a (simulated) clean Mac satisfies all of them at once.

| Issue | What it is                        | Where it lands here                                               |
| ----- | --------------------------------- | ----------------------------------------------------------------- |
| #53   | Notarized DMG release pipeline    | tauri.conf.json, desktop-release.yml, entitlements, deep-sign     |
| #54   | Product-owned permission identity | "Intentive Capture" helper bundle + capture spawn-path change     |
| #55   | Release smoke / acceptance        | `RELEASE.md` clean-Mac smoke (merge gate)                         |
| #56   | In-app auto-update                | `updates` Rust domain + tauri-plugin-updater + workflow artifacts |

## Resolved decisions (from the grill)

- **B** — commit to the **Intentive Capture signed helper** up front (not raw-first). ADR-0015.
- **C** — deep-sign every nested Mach-O inside-out in the workflow (Apple-forced).
- **D** — hardened runtime + entitlements (Apple-forced).
- **E** — merge gate = simulated clean-Mac smoke on the dev's own Mac (`spctl`/`codesign`/`stapler`/`notarytool` + `tccutil` + `xattr` + updater round-trip); ship gate = flip landing-page link. `RELEASE.md`.
- **F** — silent auto-update, check on **launch + wake-from-sleep**. ADR-0024.

## Work breakdown

### A. Packaging config (#53)

- `src-tauri/tauri.conf.json`:
  - `productName`: `intentive` → `Intentive`.
  - `bundle.targets`: `"all"` → `["dmg"]`.
  - Add `bundle.macOS`: `entitlements` path, `minimumSystemVersion` (Apple-Silicon baseline), hardened runtime.
  - `bundle.createUpdaterArtifacts: true`.
  - `plugins.updater`: `endpoints` = desktop GitHub Release `latest.json`; `pubkey` = output of `tauri signer generate`.
  - `bundle.resources`: replace `resources/screenpipe` with `resources/Intentive Capture.app` (keep `resources/ollama`, tray icons).

### B. Helper bundle (#54) — "Intentive Capture"

- New checked-in skeleton under `src-tauri/resources/Intentive Capture.app/Contents/`:
  - `Info.plist` — `CFBundleDisplayName=Intentive Capture`, `CFBundleIdentifier=com.heyintentive.capture`, `CFBundleExecutable=screenpipe`, `CFBundlePackageType=APPL`.
  - `MacOS/screenpipe` — the existing binary, relocated here (today flat at `resources/screenpipe`).
- Rust spawn-path change: `lib.rs:235` `resolve("resources/screenpipe", BaseDirectory::Resource)` → `resolve("resources/Intentive Capture.app/Contents/MacOS/screenpipe", …)`. Verify no other reader of that path (grep showed only `lib.rs`).
- ADR-0002 child-process/HTTP boundary is unchanged; only on-disk shape + TCC name change.

### C. Entitlements (#53/D)

- `src-tauri/entitlements/Intentive.entitlements` (main app): hardened-runtime web content needs — `com.apple.security.cs.allow-jit` (and, if WKWebView requires, `com.apple.security.cs.allow-unsigned-executable-memory`); no App Sandbox.
- `src-tauri/entitlements/IntentiveCapture.entitlements` (helper): `com.apple.security.device.audio-input` (mic), hardened runtime. (Screen Recording is a TCC grant, not an entitlement.)
- Decide `disable-library-validation` only if codesign/launch proves the helper or ollama load libraries signed by a different team — default OFF (all signed with our Developer ID).

### D. Release workflow (#53/#56/C)

- Edit `.github/workflows/desktop-release.yml`:
  - **New deep-sign step** before `tauri build` seals the app — sign deepest-first: helper inner `screenpipe` → `Intentive Capture.app` → `ollama`, each `codesign --options runtime --timestamp --sign "Developer ID Application: …"`. (Or sign post-build pre-notarize; choose whichever Tauri hook ordering is reliable — `tauri build` signs the outer app last.)
  - Updater artifacts already produced by `createUpdaterArtifacts`; add **`latest.json` generation** + upload of `.app.tar.gz`, `.sig`, `latest.json` to the Release alongside the `.dmg`.
  - Secrets already wired (cert import step exists). Confirm `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)` env present (it is).
- **Delete** orphan `apps/desktop/.github/workflows/release.yml` (npm, unsigned, never runs).

### E. Updater domain (#56) — Rust

- `Cargo.toml`: add `tauri-plugin-updater = "2"`.
- `capabilities/default.json`: add `updater:default` permission.
- New domain `src-tauri/src/domains/updates/` following the layer rule (`types → … → runtime → ui`):
  - `types` — `UpdateState` (e.g. `Idle | Checking | Downloading | Installed { version }`), `UpdateError`.
  - `service` — pure decision helpers if any (mostly the plugin owns logic).
  - `runtime` — the **Update Coordinator**: `check_and_install()` (silent: `app.updater()?.check()` → `Option<Update>` → `download_and_install`); a **scheduler** that fires on launch and on macOS wake. Wake hook: observe `NSWorkspace` `didWakeNotification` (via `objc`/notification observer) and call the coordinator. This is the load-bearing piece of ADR-0024.
- `lib.rs` wiring: register `tauri_plugin_updater::Builder::new().build()`; construct the coordinator; spawn a launch check; register the wake observer. Keep cross-domain wiring at the composition root via a trait seam (consistent with existing `CaptureSessionControl` etc.).

### F. Menu bar (#56) — minimal

- `domains/menubar/service/menu.rs`: add a `Version { semver }` descriptor (show `Intentive vX.Y.Z`). Silent update needs no "update available" item; a manual "Check for Updates" is optional/out of scope.
- `domains/menubar/ui/mod.rs`: render the version line. Only touch if cheap; not required for the update to function.

### G. Docs

- `docs/CHANGELOG.md`: user-visible — "signed & notarized DMG, silent auto-update".
- `CONTEXT.md`: terms added (Intentive Capture Helper, In-App Update, Release Smoke) — see CONTEXT update in this PR.
- After clean-Mac smoke: close ADR-0015's identity question with the observed Privacy-Settings string.

## Verification

- `pnpm harness --scope apps/desktop` (typecheck, lint, architecture lint TS+Rust, tests, cargo check/clippy/test) must pass before tag.
- Then the human-in-the-loop release: secrets → tag `desktop-v*` → CI → clean-Mac smoke (`RELEASE.md`) → flip landing-page link.

## Open risks

- macOS TCC could still surprise on the real notarized build (hence step 2 of the smoke is mandatory, not assumed). If it shows anything other than "Intentive Capture", revisit ADR-0015 options (embed `screenpipe-engine` is the last resort).
- Wake-notification hook is the most novel code; budget time to verify it actually fires an update check after sleep/wake.
- Deep-sign step ordering vs Tauri's own signing is fiddly; the `codesign --verify --deep` check in the smoke catches a wrong order.
