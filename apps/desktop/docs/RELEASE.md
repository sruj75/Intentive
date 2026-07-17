# Desktop Release

Intentive ships one Apple Silicon release path: a Developer ID signed and notarized `Intentive.app`, installed from a signed/stapled DMG, with Sparkle metadata generated from that exact DMG. The release machinery adapts Omi's signed-artifact audit and the pre-Omi Intentive Apple identity; it does not restore Omi's backend or product release system.

## Established Apple identity

- Developer ID: `Developer ID Application: Srujan Gowda (24D6NXS6H7)`
- Team ID: `24D6NXS6H7`
- Bundle ID: `com.heyintentive.desktop`
- Minimum OS: macOS 14
- Architecture: Apple Silicon (`arm64`) only

The Developer ID and Team ID are public signing metadata. The Apple ID, app-specific password, certificate export, certificate password, and keychain password remain GitHub Actions secrets. The workflow deliberately reuses the pre-Omi secret names:

| Setting | Kind | Purpose |
| --- | --- | --- |
| `APPLE_DEVELOPER_ID_CERT` | secret | Base64 `.p12` containing the existing Developer ID certificate and private key |
| `APPLE_DEVELOPER_ID_CERT_PASSWORD` | secret | `.p12` password |
| `KEYCHAIN_PASSWORD` | secret | Ephemeral CI keychain password |
| `APPLE_ID` | secret | Existing notarization Apple ID |
| `APPLE_APP_SPECIFIC_PASSWORD` | secret | Existing `notarytool` app-specific password |
| `APPLE_TEAM_ID` | secret | `24D6NXS6H7` |
| `SPARKLE_PUBLIC_ED_KEY` | secret | Public half embedded as `SUPublicEDKey` |
| `SPARKLE_PRIVATE_KEY` | secret | Private Ed25519 key used by Sparkle's `sign_update` for each exact DMG |
| `DESKTOP_POSTHOG_PROJECT_KEY` | secret | Production Desktop analytics project key |
| `DESKTOP_SENTRY_DSN` | repository variable | Existing public Desktop Sentry DSN |

The old Tauri updater keys are not reused: Sparkle has its own Ed25519 format. A static precomputed update signature is forbidden because every DMG has different bytes.

## Release flow

1. Merge the release commit to `main` and tag it `desktop-vX.Y.Z` (or `desktop-vX.Y.Z+BUILD` to pin `CFBundleVersion`).
2. `.github/workflows/desktop-release.yml` builds the release app, signs Sparkle/Sentry inside-out, signs the app with `Intentive-Release.entitlements`, creates an installable DMG with an `/Applications` link, signs/notarizes/staples it, and creates the Sparkle signature from that DMG.
3. `smoke-signed-desktop-artifact.sh` verifies identity, Team ID, hardened runtime, Gatekeeper, arm64-only architecture, frameworks/assets/privacy metadata, DMG ticket and contents, appcast metadata, and the cryptographic Sparkle signature. It writes digest evidence.
4. The workflow creates a **draft** GitHub Release. Draft status is load-bearing: artifacts are not exposed through Sparkle before dedicated-Mac acceptance.
5. Run `desktop-release-acceptance.yml` with the draft tag. The self-hosted Apple Silicon Mac re-runs assembled journeys, downloads the immutable draft assets, matches the DMG digest to CI evidence, mounts the DMG, and launches the signed installed payload.
6. Set `publish=true` only after the dedicated-Mac gate is green and the Tart permission checklist below has been completed. The acceptance workflow then publishes the already-audited draft; it never rebuilds it.

## Deterministic gates

```bash
pnpm --dir apps/desktop acceptance:assembled
pnpm --dir apps/desktop test
pnpm --dir apps/desktop release:smoke
pnpm harness --scope apps/desktop
```

`acceptance:assembled` covers the accessibility-addressed timeline/search tracer, text-only Floating Bar behavior, PMB presentation/acknowledgement, onboarding decisions/resume, utility settings persistence, capture/text-sync/reconnect, expiry/tombstones, and Protocol fixtures. It writes `.context/desktop-assembled-acceptance.json`.

## Clean-permission Tart gate

Use only the disposable `intentive-clean` clone. Never install into or mutate the OCI/local base.

```bash
TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:run
```

Inside the visible VM, copy the shared `Intentive.app` to `/Applications`, then verify:

1. Fresh onboarding explains local raw-media boundaries before asking for access.
2. Screen Recording can be granted, denied, or deferred; capture starts only after a live grant and survives relaunch.
3. Optional microphone/system-audio consent fails closed; neither source can fill the text composer.
4. Screen Memory captures/searches a known screen; Private Mode stops screen and audio sensing until explicitly resumed.
5. Retention/exclusion choices survive relaunch.
6. The Floating Bar remains text-only and ordinary replies do not re-present it.
7. A PMB message presents the bar/edge glow, then acknowledges without a duplicate macOS notification.
8. Updates expose manual check/download/deferred install state without silently installing.

Close and delete only the clone when finished:

```bash
TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:close
```

## External evidence boundary

A code change can implement and verify the release machinery, but it cannot honestly claim a public candidate passed Apple notarization, Sparkle update installation, dedicated-Mac launch, or TCC prompts until a real tagged draft and credentials exist. Those results belong to the draft release and its uploaded acceptance evidence, not to a source commit.
