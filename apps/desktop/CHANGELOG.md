# Changelog

All notable changes to the Desktop Client. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the Desktop Client will adopt [Semantic Versioning](https://semver.org/) once v1 ships.

## [Unreleased]

### Added

- **Desktop Coaching Window** — one deep coordinator now owns eligibility,
  durable start/end ordering, crash recovery, lock presence, sleep/wake,
  Pause/Resume, permission loss/restoration, sign-out, quit, and atomic
  screen/microphone/system-audio lifecycle. Preview builds advertise
  `desktop_coaching_v1`; every newly compiled perception record carries the
  active `window_id`.
- **Window-bound coaching presentation** — Opening Orientations and proactive
  interventions reveal the existing nonactivating Floating Bar only when their
  `window_id` matches the current active window. Pause makes the transcript
  read-only and replaces composition with Resume Coaching.

### Changed

- **One normal privacy boundary** — the Preview replaces independent source
  enable switches with Pause/Resume Coaching while preserving macOS permission,
  exclusion, retention, and deletion controls.

### Fixed

- **Coaching Window identity and menu state** — newly minted window UUIDs use
  PostgreSQL's lowercase canonical form, and the status menu preserves explicit
  disabled states for inactive Coaching and unavailable updates.
- **Foreground permission preparation and quiet login launch** — onboarding now
  completes disposable direct-screen and System Audio authorization probes
  before Coaching can start, enables Launch at Login by default, and migrates
  the legacy sensing-process login item to an entitlement-free one-shot helper
  under a fresh versioned ServiceManagement identity. The legacy Intentive-only
  registration is retired after privacy shutdown without resetting unrelated
  background items. Later login launches remain menu-bar-only until the user
  explicitly opens Intentive.

## [0.1.1] - 2026-07-23

First public stable Desktop release: a Developer ID signed, notarized, and stapled
`Intentive.app` delivered from a signed DMG with Sparkle updates.

- **Supported OS/architecture** — macOS 14 (Sonoma) or later, Apple Silicon (`arm64`) only.
- **Installation** — download the signed DMG from the GitHub Release, open it, and
  drag `Intentive.app` into the `/Applications` link. In-app updates are delivered
  through Sparkle from `releases/latest/download/appcast.xml`.

### Added

- **Intentive SwiftPM desktop renovation** — native macOS package with a testable `IntentiveDesktopCore` target and a SwiftUI `Intentive` executable for capture, Screen Memory, passive audio, text-only Floating Bar, and local Effect Runner seams.
- **Runtime Bridge and Protocol fixtures** — Desktop connects as `client_kind = "desktop"`, queues outbound messages across reconnects, emits `perception_event` records, and keeps Screen Memory out of Conversation History.
- **Local Screen Memory store and legacy import path** — SQLite-backed Screen Memory with FTS search plus read-only import from Omi-era local databases into the current Intentive profile.
- **Desktop onboarding** — renovated Omi paged mechanics for first-launch trust, authentication, honest Screen Recording decisions, optional passive audio, privacy controls, text-only Floating Bar demonstration, and resumable completion.
- **Public release acceptance** — adapts Omi's signed-artifact audit and Intentive's existing Developer ID/notarization identity into a draft-first signed DMG + Sparkle pipeline with digest evidence and dedicated-Mac promotion.

### Changed

- **Omi renovation complete** — the active build preserves the proven Omi-derived archive, capture, Floating Bar, passive-audio, onboarding, proactive presentation, settings, and Sparkle mechanisms behind Intentive-owned seams; rejected Omi product systems and superseded replacements are absent.
- **Bundle identity and release harness** — the native bundle smoke verifies Intentive app identity, auth callback scheme, privacy strings, Sparkle metadata, app icon, executable, and the `IntentiveDesktopNativeAdapters` VAD bundle.
- **Privacy without a global Private Mode** — sensing is governed per source by macOS permissions, explicit enable switches, excluded apps, retention, and clear-all rather than a single global mode; Post-Message-Back is reply-or-ignore with no dismiss/snooze control (ADR 0012).
