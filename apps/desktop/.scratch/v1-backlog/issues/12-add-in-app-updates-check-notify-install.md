# Add in-app updates (check, notify, install)

Status: open
Labels: enhancement, ready-for-agent
Opened: 2026-05-21T04:45:22Z
Updated: 2026-05-21T12:34:52Z

## Description

## Parent

#1

## Problem

Intentive ships via tagged GitHub Releases (`.github/workflows/release.yml`), but users have no in-app path to discover, download, or install newer versions. Today they must manually find and install a new build, which breaks the product promise of a quiet background service that stays current without operator overhead.

## Product decisions (brainstorm capture)

**Job to be done:** When Intentive has a newer signed build available, the user should be able to stay on a supported version without leaving the menu-bar workflow or guessing whether they are outdated.

**v1 scope (this issue):**

| Mode | v1 behavior |
|------|-------------|
| Manual | Menu bar shows current version and **Check for Updates…**; when an update is available, user can install via **Update now** (menu item or follow-up prompt). |
| Automatic check | On launch and on a sensible interval (e.g. daily), check silently for updates. Do not install without user action in v1. |
| OTA install | When the user chooses to update, download and install via Tauri updater; restart Intentive to complete. |

**Explicitly out of v1:**

- Fully silent install with no user confirmation (high risk during an active Capture Session).
- Forced update blocks or kill-switch remote policy.
- Delta/binary patching beyond what the updater plugin provides.

**Constraints inherited from Intentive:**

- **Menu bar is the home for user-facing update controls**, matching common macOS utility patterns (see reference: version label + **Check for Updates…** at the bottom of the tray menu, above Quit).
- Settings remains for account/auth only; do not add an About/Updates section to Settings for v1.
- Do not interrupt an active Capture Session: if capturing, defer install until stop/quit or show a clear choice (“Update after stopping capture”).
- Match macOS-native patterns from `DESIGN.md` / macOS design skill (non-alarming copy, disabled version row, ellipsis on **Check for Updates…**).
- Keep endpoint URLs and signing material out of user-visible UI.

## UX reference (menu bar)

At the bottom of the Intentive tray menu (separator above Quit):

```
Version 0.1.0          ← informational, disabled
Check for Updates…     ← primary update action
─────────────────
Quit
```

When an update is available, reflect it in the menu (e.g. enable **Update now** or replace check result with a clear install action) without opening Settings.

## What to build

Wire **Tauri in-app updates** against the existing GitHub Release pipeline:

1. **Release artifacts** — Ensure tagged `v*` releases publish updater-compatible macOS artifacts (and `latest.json` or equivalent manifest) alongside the app bundle.
2. **Signing** — Configure macOS code signing + notarization required for updater installs (document any secrets/CI inputs operators must set).
3. **Updater integration** — Add `tauri-plugin-updater` (or current Tauri 2 equivalent), server public key, and Rust commands to check, download, and install.
4. **Menu bar UI** — Extend tray menu descriptors: disabled **Version {semver}** row, **Check for Updates…** item, and install/restart flow when an update is staged. Use standard macOS menu separators (capture controls → settings/quit block → version/update block → quit).
5. **Background check** — Check for updates on app launch and on a daily cadence while running; when an update is found, menu reflects availability (e.g. label change or additional item) without modal spam.
6. **Capture-safe install** — Block or defer install while a Capture Session is active unless the user explicitly stops capture first.

## Acceptance criteria

- [ ] Tagged GitHub Releases include updater manifest + macOS artifacts consumable by the in-app updater.
- [ ] macOS build is signed and notarized such that updater installs succeed on a clean machine (documented operator checklist).
- [ ] Tray menu shows **Version {current}** as a disabled informational item at the bottom of the menu (above Quit).
- [ ] Tray menu includes **Check for Updates…** that queries the release endpoint.
- [ ] After check: user sees clear feedback (`up to date`, `update available`, `checking`, or `error`) via menu state, native dialog, or both—without opening Settings.
- [ ] When an update is available, user can proceed to download/install and restart from the menu flow.
- [ ] Background check runs on launch and at least once per day without opening the menu.
- [ ] When background check finds an update, menu reflects it without requiring **Check for Updates…** first.
- [ ] If a Capture Session is active, install does not silently stop capture; user sees deferral guidance or must stop capture first.
- [ ] Update failures show a safe error state; Intentive keeps running on the current version.
- [ ] Settings does not duplicate version/update controls for v1.
- [ ] Tests or a documented smoke check cover: menu version row, check flow, update available + install path (mocked endpoint OK), and capture-active deferral.

## Blocked by

- #3 (menu bar shell — provides the tray menu surface)

## Unblocks

- None for core v1 capture/delivery path; improves ship velocity and support burden after initial releases.

## Notes

- Reuses existing `release.yml` / `v*` tag workflow; extends it rather than replacing manual releases.
- Consider linking release notes when an update is available (stretch).

## Comments

### 01 @sruj75 — 2026-05-21T12:32:23Z

Release-packaging dependency addendum from the May 21 packaging pass:

This issue should not be the first place signing/notarization is implemented. In-app updates depend on a finished release identity and signed/notarized artifact pipeline from #13.

Carry forward these constraints from the packaging decision:

- Product name: `Intentive`.
- Bundle identifier: `com.tryintentive.tauri`.
- Primary artifact: signed and notarized Apple Silicon DMG containing only `Intentive.app`.
- Unsigned local builds are dev-only and cannot validate final macOS Privacy Settings identity.
- Any updater flow must preserve the same product-owned identity: `Intentive`, or fallback `Intentive Capture` only where macOS requires a helper row.

### 02 @sruj75 — 2026-05-21T12:34:52Z

Follow-up link from the packaging issue pass:

In-app updates should treat #13 as a prerequisite for installable release artifacts and #16 as the final packaged-app smoke bar. The updater flow should preserve the same product-owned identity rules from #14.
