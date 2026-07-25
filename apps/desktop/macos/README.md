# Intentive Desktop macOS

SwiftPM macOS app for the Intentive Desktop Client.

## Development

From the repository root:

```bash
pnpm --dir apps/desktop build
pnpm --dir apps/desktop test
apps/desktop/macos/scripts/verify-app-bundle.sh
apps/desktop/macos/run.sh
```

Use the package scripts, which select Xcode through `xcrun` and isolate SwiftPM output on T9 per workspace.

Named local launches can set `INTENTIVE_APP_NAME`:

```bash
INTENTIVE_APP_NAME="Intentive Local" ./run.sh
```

## Shape

- `Desktop/Sources/IntentiveDesktopCore/` owns the testable app seams: Runtime Bridge, Screen Memory, Context Compiler, voice, Effect Runner, auth, and Control Plane clients.
- `Desktop/Sources/Intentive/` owns the SwiftUI shell.
- `scripts/build-app-bundle.sh` assembles a minimal `.app` bundle for release jobs before codesign/notarization.
- `scripts/verify-app-bundle.sh` checks the release bundle contract, including the app icon, auth callback URL scheme, Sparkle metadata, privacy strings, and SwiftPM native assets bundle.

Raw frames, recordings, and provider keys do not leave this package. The Context Compiler publishes compact `perception_event` records through the Runtime Bridge.
