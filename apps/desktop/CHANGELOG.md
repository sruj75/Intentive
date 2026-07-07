# Changelog

All notable changes to the Desktop Client. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the Desktop Client will adopt [Semantic Versioning](https://semver.org/) once v1 ships.

## [Unreleased]

### Added

- **Intentive SwiftPM desktop renovation** — native macOS package with a testable `IntentiveDesktopCore` target and a SwiftUI `Intentive` executable for capture, Screen Memory, floating-bar chat, voice, and local Effect Runner seams.
- **Runtime Bridge and Protocol fixtures** — Desktop connects as `client_kind = "desktop"`, queues outbound messages across reconnects, emits `perception_event` records, and keeps Screen Memory out of Conversation History.
- **Local Screen Memory store and legacy import path** — SQLite-backed Screen Memory with FTS search plus read-only import from Omi-era local databases into the current Intentive profile.
- **Desktop onboarding** — first-launch trust, macOS permission, Floating Bar, and voice-demo setup flow backed by durable progress and live Screen Recording / microphone permission checks.
- **Restored marketing demo assets** — the deleted Remotion demo now lives at root `marketing/` and uses Intentive / Screen Memory terminology.

### Changed

- **Omi-era machinery kept as renovation assets** — Rewind, capture plumbing, Floating Bar, local audio/VAD/transcription, Sparkle update wiring, and permission-help resources remain in-tree while active seams are wired through Intentive modules.
- **Bundle identity and release harness** — the native bundle smoke verifies Intentive app identity, auth callback scheme, privacy strings, Sparkle metadata, app icon, executable, and native VAD assets.
