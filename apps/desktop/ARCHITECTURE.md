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
    Desktop/Sources/Rewind/Core/       # surgically compiled Omi archive encoder/storage
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
- The Floating Bar is the only Desktop conversation surface and accepts text only.
- Passive audio sensing is a local perception source, not a conversation-input path; its restored pipeline is deferred to Slice 8.
- Product nudges are presented in-app for Post-Message-Back messages. Ordinary replies do not interrupt and no duplicate macOS banner is emitted.

## Core Modules

- `ProtocolEvents.swift`: strict Codable forms for shared Protocol fixtures and outbound Desktop events.
- `DesktopLaunchConfiguration.swift`: immutable production and deterministic launch policy plus the observable assembled surface/system-boundary contract consumed by the executable composition root.
- `RuntimeBridge.swift`: desktop WebSocket adapter, generation guard, outbound FIFO, message reducer, delivery acknowledgements.
- `AuthControlPlane.swift`: native auth seam, dev auth provider, hosted auth callback boundary, typed Control Plane client.
- `ScreenMemoryArchive.swift`: the signed-in per-user ingest/search/video-retrieval seam, OCR/dHash deduplication orchestration, finalized-chunk recovery, and outbound-safe content projection.
- `ScreenMemory.swift`: versioned `intentive.db` persistence, local Screen Memory and ambient-audio records, FTS search, and the deferred local embedding seam.
- `Rewind/Core/{VideoChunkEncoder,RewindStorage}.swift`: the surgically compiled Omi-derived HEVC/MP4 writer, staged publication, AVAssetReader sample extraction, and bounded still cache behind the source-neutral Core video boundary. Other Rewind database, service, and UI assets remain excluded until their owning renovation slices.
- `DesktopLocalProfile.swift`: shared Intentive profile paths. The Desktop Client does not import Omi user data.
- `ContextCompiler.swift`: deterministic screen and ambient audio analyzers plus `perception_event` publisher with the raw-frame egress guard.
- `DesktopExperience.swift`: Runtime-truth floating conversation projection, capture coordination, passive-audio primitives, and deterministic in-app Post-Message-Back presentation. Omi's window/geometry/composer/response and Carbon shortcut mechanisms are preserved behind the text-only `FloatingBarController`; conversation is never persisted locally.

## Verification

```bash
pnpm --dir apps/desktop build
pnpm --dir apps/desktop test
```

The monorepo gate for this deployable is:

```bash
pnpm harness --scope apps/desktop
```

The harness includes a debug bundle smoke that assembles `Intentive.app` and verifies the production bundle contract: app identity, auth callback URL scheme, privacy strings, Sparkle metadata, app icon, executable, and the SwiftPM native-assets bundle in `Contents/Resources` used by local VAD.
