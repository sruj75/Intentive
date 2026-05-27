# Package Intentive as a signed notarized DMG for v1 launch

Status: open
Labels: enhancement, ready-for-human
Opened: 2026-05-21T12:33:07Z
Updated: 2026-05-21T12:33:07Z

## Description

## Parent

#1

## What to build

Ship Intentive v1 as a finished macOS product artifact: a direct-download Apple Silicon DMG containing only `Intentive.app`, signed with Developer ID and Apple-notarized. This slice turns release packaging from a dev build into the artifact used for final macOS Privacy Settings, Login Items, and Capture Session smoke testing.

## Acceptance criteria

- [ ] `src-tauri` release metadata uses product name `Intentive`.
- [ ] The release bundle identifier is `com.tryintentive.tauri`.
- [ ] Tagged release builds produce an Apple Silicon DMG containing only `Intentive.app` as the user-facing app.
- [ ] Release builds are Developer ID signed.
- [ ] Release builds are Apple-notarized and pass Gatekeeper on a clean Mac.
- [ ] CI documents all required Apple signing/notarization secrets and fails release packaging clearly when they are absent.
- [ ] Unsigned or ad hoc local builds are documented as dev-only and not valid evidence for final macOS Privacy Settings identity.
- [ ] Installing the DMG into `/Applications/Intentive.app` is the required path for release smoke.
- [ ] Lowercase `intentive`, alternate app names, ScreenPipe-facing app names, and debug paths do not appear as product surfaces in the packaged artifact.

## Blocked by

None - can start immediately, but completion requires human-provided Apple Developer signing and notarization credentials.

## Comments

(No comments.)
