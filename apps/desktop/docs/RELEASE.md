# Desktop Release

Intentive ships one Apple Silicon release path: a Developer ID signed and notarized `Intentive.app`, installed from a signed/stapled DMG, with Sparkle metadata generated from that exact DMG. The release machinery adapts Omi's signed-artifact audit and the pre-Omi Intentive Apple identity; it does not restore Omi's backend or product release system.

## Established Apple identity

- Developer ID: `Developer ID Application: Srujan Gowda (24D6NXS6H7)`
- Team ID: `24D6NXS6H7`
- Bundle ID: `com.heyintentive.desktop`
- Minimum OS: macOS 14
- Architecture: Apple Silicon (`arm64`) only

The Developer ID and Team ID are public signing metadata. The Apple ID, app-specific password, certificate export, certificate password, and keychain password remain GitHub Actions secrets. The workflow deliberately reuses the pre-Omi secret names:

| Setting                            | Kind                | Purpose                                                                        |
| ---------------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| `APPLE_DEVELOPER_ID_CERT`          | secret              | Base64 `.p12` containing the existing Developer ID certificate and private key |
| `APPLE_DEVELOPER_ID_CERT_PASSWORD` | secret              | `.p12` password                                                                |
| `KEYCHAIN_PASSWORD`                | secret              | Ephemeral CI keychain password                                                 |
| `APPLE_ID`                         | secret              | Existing notarization Apple ID                                                 |
| `APPLE_APP_SPECIFIC_PASSWORD`      | secret              | Existing `notarytool` app-specific password                                    |
| `APPLE_TEAM_ID`                    | secret              | `24D6NXS6H7`                                                                   |
| `SPARKLE_PUBLIC_ED_KEY`            | secret              | Public half embedded as `SUPublicEDKey`                                        |
| `SPARKLE_PRIVATE_KEY`              | secret              | Private Ed25519 key used by Sparkle's `sign_update` for each exact DMG         |
| `DESKTOP_POSTHOG_PROJECT_KEY`      | secret              | Production Desktop analytics project key                                       |
| `DESKTOP_SENTRY_DSN`               | repository variable | Existing public Desktop Sentry DSN                                             |

The old Tauri updater keys are not reused: Sparkle has its own Ed25519 format. A static precomputed update signature is forbidden because every DMG has different bytes.

## Release flow

1. Merge the release commit to `main`. Run `desktop-release-candidate.yml` with that exact untagged SHA. Its dedicated Mac launches the real assembled app and records step-level external Accessibility evidence. No tag or public artifact exists yet.
2. Review the uploaded exact-SHA evidence. Start `desktop-release.yml` with the accepted SHA, candidate workflow run ID, and version. The job pauses at the protected `desktop-release-approval` environment; only after approval does it validate the evidence and create `desktop-vX.Y.Z` (or `desktop-vX.Y.Z+BUILD`).
3. The protected workflow builds the release app, signs Sparkle/Sentry inside-out, signs the app with `Intentive-Release.entitlements`, creates an installable DMG with an `/Applications` link, signs/notarizes/staples it, and creates the Sparkle signature from that exact DMG.
4. `smoke-signed-desktop-artifact.sh` verifies identity, Team ID, hardened runtime, Gatekeeper, arm64-only architecture, frameworks/assets/privacy metadata, DMG ticket and contents, appcast metadata, and the cryptographic Sparkle signature. It writes digest evidence.
5. The workflow creates a **draft** GitHub Release. Draft status is load-bearing: artifacts are not exposed through Sparkle before dedicated-Mac acceptance.
6. Configure the dedicated release Mac with executable drivers in `DESKTOP_STAGE2_SPARKLE_DRIVER`, `DESKTOP_STAGE2_TART_DRIVER`, and `DESKTOP_STAGE2_FULL_STACK_DRIVER`. They drive the real N-1 loopback update, clean-TCC Tart checklist, and signed-in full-stack journey respectively; each receives the exact tag, SHA, DMG digest, a fresh output path, and evidence root.
7. The protected `desktop-release-stage2-proof` job downloads the exact draft and runs `run-stage2-release-proof.sh`. That repository-owned entry point freshly installs and launches the notarized DMG from `/Applications`, runs the repository-owned launch-at-login proof (`verify-launch-at-login.sh`), executes all three dedicated-Mac drivers, validates five newly produced proof families (`installed-dmg.json`, `launch-at-login.json`, `sparkle-update.json`, `tart-tcc.json`, and `full-stack.json`) plus attachments and identity/digest binding, attaches them to the draft, and only then publishes it. Pre-existing evidence is deleted and cannot satisfy the gate. The launch-at-login proof validates the bundled LaunchAgent registration (bundle-relative `BundleProgram`, `--background`, `RunAtLoad`) and a menu-bar-only background launch; the physical login cycle (no Dock/window flash) and the “Open Intentive” Dock/window restore remain operator-observed and are recorded alongside its JSON.

`desktop-release.yml` is the only workflow allowed to move a release from draft to published. The protected Stage 2 environment is the terminal publication gate; there is no parallel manual publish path.

## Deterministic gates

```bash
pnpm --dir apps/desktop desktop:accept
pnpm --dir apps/desktop test
pnpm --dir apps/desktop release:smoke
pnpm --dir apps/desktop desktop:check
```

`desktop:accept` builds and launches a real isolated-profile app bundle. A debug-only loopback bridge provides fixture/fault control and state observation with a random bearer token stored mode `0600`; it cannot perform user actions. The external driver uses the macOS AX tree, captures per-step pre/post values, screenshots, AX snapshots, log references, and assertions, and writes `.context/desktop-assembled-acceptance.json` plus `.context/desktop-assembled-evidence/`. The command fails closed when the runner lacks Accessibility permission.

## Clean-permission Tart gate

Use only the disposable `intentive-clean` clone. Never install into or mutate the OCI/local base.

```bash
TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:run
```

Inside the visible VM, copy the shared `Intentive.app` to `/Applications`, then verify:

1. Fresh onboarding explains local raw-media boundaries before asking for access.
2. Screen Recording can be granted, denied, or deferred; capture starts only after a live grant and survives relaunch.
3. Optional microphone/system-audio consent fails closed; neither source can fill the text composer.
4. Screen Memory captures/searches a known screen; disabling a source's enable switch (or revoking its macOS permission) stops that source and finalizes the active chunk. There is no global Private Mode (ADR 0012).
5. Retention/exclusion choices survive relaunch; clear-all removes local records/media and emits a tombstone.
6. The Floating Bar remains text-only and ordinary replies do not re-present it.
7. A PMB message presents the bar/edge glow, then acknowledges without a duplicate macOS notification.
8. Updates expose manual check/download/deferred install state without silently installing.

Close and delete only the clone when finished:

```bash
TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:close
```

## External evidence boundary

A code change can implement and verify the release machinery, but it cannot honestly claim a public candidate passed Apple notarization, Sparkle update installation, dedicated-Mac launch, or TCC prompts until a real tagged draft and credentials exist. Those results belong to the draft release and its uploaded acceptance evidence, not to a source commit.
