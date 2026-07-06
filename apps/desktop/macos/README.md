# Intentive Desktop macOS

SwiftPM macOS app for the Intentive Desktop Client.

## Development

```bash
xcrun swift build -c debug --package-path Desktop
xcrun swift test --package-path Desktop
scripts/verify-app-bundle.sh
./run.sh
```

Use `xcrun swift`, not bare `swift`, so the active Xcode SDK is used.

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
