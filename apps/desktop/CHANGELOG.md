# Changelog

All notable changes to the Desktop Client. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the Desktop Client will adopt [Semantic Versioning](https://semver.org/) once v1 ships.

## [Unreleased]

### Added

- **Intentive SwiftPM desktop renovation** — native macOS package with a testable `IntentiveDesktopCore` target and a SwiftUI `Intentive` executable for capture, Screen Memory, passive audio, text-only Floating Bar, and local Effect Runner seams.
- **Runtime Bridge and Protocol fixtures** — Desktop connects as `client_kind = "desktop"`, queues outbound messages across reconnects, emits `perception_event` records, and keeps Screen Memory out of Conversation History.
- **Local Screen Memory store and legacy import path** — SQLite-backed Screen Memory with FTS search plus read-only import from Omi-era local databases into the current Intentive profile.
- **Desktop onboarding** — renovated Omi paged mechanics for first-launch trust, authentication, honest Screen Recording decisions, optional passive audio, privacy controls, text-only Floating Bar demonstration, and resumable completion.
- **Public release acceptance** — adapts Omi's signed-artifact audit and Intentive's existing Developer ID/notarization identity into a draft-first signed DMG + Sparkle pipeline with digest evidence and dedicated-Mac promotion.
- **Restored marketing demo assets** — the deleted Remotion demo now lives at root `marketing/` and uses Intentive / Screen Memory terminology.

### Changed

- **Omi renovation complete** — the active build preserves the proven Omi-derived archive, capture, Floating Bar, passive-audio, onboarding, proactive presentation, settings, and Sparkle mechanisms behind Intentive-owned seams; rejected Omi product systems and superseded replacements are absent.
- **Bundle identity and release harness** — the native bundle smoke verifies Intentive app identity, auth callback scheme, privacy strings, Sparkle metadata, app icon, executable, and native VAD assets.
