# Desktop Client Architecture

This document is the deployable-local contract for `apps/desktop/`. It extends the monorepo rules in [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) and the vocabulary in [`CONTEXT.md`](CONTEXT.md).

## Target Spine

```text
Desktop Capture Layer
  -> Desktop Context Compiler
  -> Protocol perception_event
  -> Agent Runtime decision
  -> Desktop Effect Runner
```

## Current Layout

`apps/desktop/macos/` is a Swift Package Manager macOS app. Product logic lives in a testable core target; the SwiftUI executable stays thin.

```text
apps/desktop/
  AGENTS.md
  CONTEXT.md
  ARCHITECTURE.md
  docs/
  macos/
    Desktop/Package.swift
    Desktop/Sources/IntentiveDesktopCore/
    Desktop/Sources/Intentive/
    Desktop/Tests/
    scripts/build-app-bundle.sh
    scripts/verify-app-bundle.sh
    run.sh
    test.sh
```

## Boundaries

- Shared WebSocket shapes live in `packages/protocol`; the Desktop Client consumes fixtures from there rather than redefining events.
- Control Plane HTTP shapes live in `packages/api-contract`.
- Runtime judgment lives in `services/agent-runtime`. The Desktop Client provides senses and hands.
- Screen Memory stores local records and local embeddings. It does not store Conversation History.
- Effect Runner behavior is deterministic local execution of an already-chosen Runtime output.

## Core Modules

- `ProtocolEvents.swift`: strict Codable forms for shared Protocol fixtures and outbound Desktop events.
- `RuntimeBridge.swift`: desktop WebSocket adapter, generation guard, outbound FIFO, message reducer, delivery acknowledgements.
- `AuthControlPlane.swift`: native auth seam, dev auth provider, hosted auth callback boundary, typed Control Plane client.
- `ScreenMemory.swift`: local Screen Memory records, FTS-first search, deterministic local embedding seam.
- `ContextCompiler.swift`: deterministic analyzers and `perception_event` publisher with the raw-frame egress guard.
- `DesktopExperience.swift`: floating-bar chat, push-to-talk pipeline, capture coordinator, and Effect Runner.

## Verification

```bash
cd apps/desktop/macos
xcrun swift build -c debug --package-path Desktop
xcrun swift test --package-path Desktop
```

The monorepo gate for this deployable is:

```bash
pnpm harness --scope apps/desktop
```

The harness includes a debug bundle smoke that assembles `Intentive.app` and verifies the production bundle contract: app identity, auth callback URL scheme, privacy strings, Sparkle metadata, app icon, executable, and the SwiftPM native-assets bundle used by local VAD.
