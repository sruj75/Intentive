# Desktop Client — Agent Guide

macOS client. The target product surface is capture, Screen Memory, floating-bar chat, push-to-talk voice, and local Effect Runner behavior against the one shared Companion runtime.

**Read first:** [`CONTEXT.md`](CONTEXT.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), then root [`AGENTS.md`](../../AGENTS.md) for monorepo rules.

## Current Shape

The SwiftPM macOS app lives under [`macos/`](macos/). The active package is [`macos/Desktop`](macos/Desktop) with a testable `IntentiveDesktopCore` target and a SwiftUI `Intentive` executable.

## Development

```bash
pnpm --dir apps/desktop build
pnpm --dir apps/desktop test
apps/desktop/macos/run.sh
```

Use the package scripts, which route `xcrun swift` through the per-workspace T9 scratch wrapper. Do not use `xcodebuild`; there is no Xcode project.

## Guardrails

- Raw frames, recordings, and audio stay on the Mac by default.
- The Desktop Context Compiler sends compact `perception_event` records, never raw frame bytes.
- Provider API keys do not live on the Mac.
- Agent judgment stays in `services/agent-runtime`; the Desktop Client emits candidate artifacts and runs chosen effects.
- Shared wire changes start in `packages/protocol`.
- Control Plane HTTP changes start in `packages/api-contract`.

## Docs

- [`README.md`](README.md) — local entrypoint
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — dev loop
- [`docs/SMOKE.md`](docs/SMOKE.md) — smoke checklist
- [`docs/EVAL.md`](docs/EVAL.md) — privacy/reliability eval notes
- [`docs/adr/`](docs/adr/) — Desktop Client decisions
