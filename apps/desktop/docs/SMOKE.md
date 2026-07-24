# Desktop Smoke

## Local Gates

```bash
pnpm --dir apps/desktop typecheck
pnpm --dir apps/desktop test
pnpm harness --scope apps/desktop
pnpm --dir apps/desktop desktop:accept
```

## Manual Local Run

```bash
cd apps/desktop/macos
./run.sh
```

Confirm:

1. The app opens to the Intentive Desktop window.
2. Without a configured token, the top-bar status reports sign-in is required instead of using a preview chat.
3. Grant Screen Recording, enable Screen Memory, and start capture.
4. `Screen Memory` search finds captured rows by words from the summary.
5. A fixture Runtime Post-Message-Back presents the Floating Bar/edge glow, while an ordinary reply updates silently and no second chat surface appears.

## Local Stack Smoke

With Control Plane and Agent Runtime running:

```bash
export INTENTIVE_CONTROL_PLANE_URL=http://localhost:8080
export INTENTIVE_DESKTOP_USER_JWT="$(scripts/local-dev-auth-token.mjs --user-id local-dev-user)"
cd apps/desktop/macos
./run.sh
```

Confirm:

1. Desktop calls `GET /me` with `X-Client-Kind: desktop` and `X-Capture-Permission-Granted`.
2. Desktop registers `POST /devices/register` with `device_fingerprint` and `client_kind: desktop`.
3. Desktop fetches routing from `GET /agent`, opens the Runtime WebSocket, and sends the `connect` frame.
4. Runtime returns `hello_ok`; the top-bar status changes to Runtime connected.
5. Send one `perception_event`; verify Agent Runtime writes `runtime_events` and `perception_records`.
6. Send one floating-bar `user_message`; verify it appears in Mobile after reconnect.
7. Trigger one Post-Message-Back reply; verify the Desktop Effect Runner acknowledges it.

## Hosted Auth Smoke

```bash
export INTENTIVE_CONTROL_PLANE_URL=https://<control-plane-host>
export INTENTIVE_HOSTED_AUTH_URL=https://<auth-host>/sign-in
export INTENTIVE_AUTH_CALLBACK_SCHEME=intentive-desktop
# Set only if the hosted callback returns `code=` instead of `token=`, `id_token=`, or `jwt=`.
export INTENTIVE_AUTH_TOKEN_EXCHANGE_URL=https://<auth-host>/desktop/token
cd apps/desktop/macos
./run.sh
```

Confirm:

1. `Connect Runtime` opens the system auth session.
2. Cancelling the session does not store a token.
3. Completing sign-in stores the User JWT in Keychain.
4. Relaunch restores the token without reopening the auth session.
5. Sign-in continues into the same `/me` → `/devices/register` → `/agent` → WebSocket path as the local-stack smoke.

## Release Smoke

```bash
CONFIGURATION=release \
  INTENTIVE_APP_VERSION=0.1.0 \
  INTENTIVE_APP_BUILD=1 \
  INTENTIVE_AUTH_CALLBACK_SCHEME=intentive-desktop \
  apps/desktop/macos/scripts/build-app-bundle.sh
```

Confirm the generated `Info.plist` contains:

1. `CFBundleIdentifier = com.heyintentive.desktop`.
2. `CFBundleIconFile = AppIcon`, with `Contents/Resources/AppIcon.icns` present.
3. `CFBundleURLTypes` with the `intentive-desktop` callback scheme.
4. `CFBundleShortVersionString` and `CFBundleVersion` matching the release tag/build.
5. `NSScreenCaptureUsageDescription`, `NSAppleEventsUsageDescription`, `NSMicrophoneUsageDescription`, and `NSAudioCaptureUsageDescription`.
6. `SUFeedURL` and `SUPublicEDKey` when Sparkle update metadata is provided.
7. `IntentiveSentryDSN`, `IntentivePostHogProjectKey`, and `IntentivePostHogHost` when release telemetry metadata is provided.
8. `Contents/Frameworks/Sparkle.framework` and `Contents/Frameworks/Sentry.framework` for the production release boundaries.
9. `Contents/Resources/IntentiveDesktop_IntentiveDesktopNativeAdapters.bundle/silero_vad.onnx` for SwiftPM `Bundle.module` lookup (owned by the `IntentiveDesktopNativeAdapters` target).

For the mechanical local check:

```bash
pnpm --dir apps/desktop release:smoke
```

On a tagged candidate, the Omi-derived signed-artifact smoke additionally verifies Developer ID Team `24D6NXS6H7`, hardened runtime, arm64-only architecture, Gatekeeper, the DMG notarization ticket and `/Applications` link, embedded-app digest alignment, appcast version/length/URL, and the exact DMG's Sparkle signature. See [`RELEASE.md`](RELEASE.md).

## Internal Clean-Slate Smoke

For changes to capture readiness or native permission onboarding, have an agent start `TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:run` in the background. In the fresh Tart VM, the person at the keyboard installs the shared `Intentive.app` into `/Applications` and confirms required Screen Recording plus optional microphone/system-audio decisions; macOS requires those consent prompts to be handled in the GUI. The agent then runs `TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:close` to stop and delete the guest. Never install or test Intentive in `intentive-base`; that template must remain app-free and permission-free. See [DEVELOPMENT.md](DEVELOPMENT.md#internal-build-clean-macos-permission-slate) and [RELEASE.md](RELEASE.md#clean-permission-tart-gate).
