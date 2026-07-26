# ADR 0011: Launch / activation lifecycle — menu-bar-app pattern

## Status

Accepted. Confirmed on **Option A** (bundled LaunchAgent with a `--background` marker) and
implemented. This is the lifecycle change called out in the Desktop UX Renovation plan as
"the one phase worth a design confirmation." Amended for v1 by monorepo ADR-0006
(2026-07-26): a background login launch remains a menu-bar application but begins
a Desktop Coaching Window and may reveal the non-focus-stealing Floating Bar welcome.

## Context

Today the Desktop Client launches the same way regardless of how it was started:

- `Info.plist` sets `LSUIElement=false`, so the app is a regular Dock app.
- The SwiftUI primary `Window` (`IntentiveApp.swift`) renders at launch.
- There is **no launch-source detection** anywhere: no `setActivationPolicy`, no
  `applicationShouldHandleReopen`, no launch-argument/env marker.
- Launch-at-login registers the main app via `SMAppService.mainApp.register()` /
  `.unregister()` (`MainWindowView.setLaunchAtLogin`), toggle persisted as
  `DesktopUtilitySettings.launchAtLogin`.

The result: a login-item (background) launch is indistinguishable from a Finder/Dock
launch — the main window always shows and the Dock icon is always present. The desired
behavior follows the battle-tested menu-bar-app pattern:

| Launch source                              | Dock | Window shown        |
| ------------------------------------------ | ---- | ------------------- |
| First run (onboarding incomplete)          | yes  | onboarding window   |
| User opens app (Finder/Dock) / reopen      | yes  | main window         |
| Auto-launch at login (background)          | no   | none (menu bar only)|

## Decision

Default the app to `.accessory` (menu-bar only, no Dock) in
`applicationDidFinishLaunching`, and switch to `.regular` (Dock + window) only when we
should present a window. A decision table in `applicationDidFinishLaunching` (mirrored in
`applicationShouldHandleReopen`) drives the switch:

- onboarding incomplete → `.regular`, show onboarding window (regardless of source).
- onboarding complete + user launch (no background marker) or reopen → `.regular`, show
  main window.
- onboarding complete + background marker → stay `.accessory`, menu bar only, no window.
- `openApp()` (menu "Open Intentive") and `applicationShouldHandleReopen` flip to
  `.regular` and front the window.
- The existing DEBUG acceptance carve-out (`INTENTIVE_ACCEPTANCE_PROFILE_ROOT` forces the
  window forward) is preserved so the AX driver still works.

Because SwiftUI eagerly creates the primary window at launch, `.accessory` alone
does not suppress it; on a background launch the app must also close/withhold that window
until a user action reopens it.

### Resolved — how to detect a background (login) launch

**Chosen: Option A — bundled LaunchAgent with a marker argument (plan's recommendation).**
`SMAppService.mainApp` cannot pass launch arguments, so switch launch-at-login to a
bundled LaunchAgent registered via `SMAppService.agent(plistName:)` whose
one-shot `IntentiveLoginLauncher` starts the main executable with `--background`;
the app reads it via `CommandLine.arguments`. The
`launchAtLogin` toggle contract is unchanged — only the registration mechanism changes.
Requires bundling a LaunchAgent `.plist` into the app (via `build-app-bundle.sh`) and
carries the risk surface of a new login-item mechanism that cannot be fully exercised
without a real login-at-boot.

**Option B — stay on `SMAppService.mainApp` with a weaker heuristic.** Keep the current
registration and infer a background launch indirectly (e.g. no windows/reopen event
shortly after launch, or a login-window session-state check). Lower mechanism risk, but
the heuristic is softer and more prone to edge-case misclassification.

Recommendation: **Option A**, for a deterministic marker that matches the menu-bar-app
pattern exactly — but this is the point the plan flags for explicit confirmation given
the v1 simplicity bar and the untestable login-at-boot path.

Confirmed on Option A. As built: the current LaunchAgent uses a versioned
ServiceManagement identity derived from the app bundle, for example
`com.heyintentive.desktop.login-launcher-v1` in
`com.heyintentive.desktop.login-launcher-v1.plist`. It is bundled at
`Contents/Library/LaunchAgents/` by `build-app-bundle.sh` with
`BundleProgram = Contents/MacOS/IntentiveLoginLauncher` (bundle-relative, survives
moves). The helper resolves its real executable path, exits without launching
anything when the foreground app is already alive, and otherwise starts
`Contents/MacOS/Intentive --background`;
`MainWindowView.setLaunchAtLogin` registers it via `SMAppService.agent(plistName:)` instead
of `SMAppService.mainApp`. `IntentiveAppDelegate` defaults to `.accessory` at
`applicationDidFinishLaunching`, reads the `--background` marker from `CommandLine.arguments`,
and in `resolveLaunchPresentation()` (invoked from `attach(model:)`) uses durable local
onboarding progress rather than provisional authentication restore state. It either stays
menu-bar-only (background + onboarding complete: `orderOut` the eager
singleton window) or promotes to `.regular` and fronts the window. The primary scene has
a stable `Window(id:)`, and its `OpenWindowAction` is retained by the delegate so
`openApp()` and `applicationShouldHandleReopen(_:hasVisibleWindows:)` can recreate a
window the user previously closed before promoting it on demand.

`SMAppService.register()` bootstraps a LaunchAgent immediately and
`unregister()` terminates the managed job. The one-shot helper is therefore a
privacy boundary, not packaging ceremony: completing onboarding cannot create a
second sensing process, and disabling Launch at Login cannot terminate the main
process before its Coaching Window performs synchronous sensor shutdown and a
durable end enqueue.

ServiceManagement and Background Task Management can retain a registered
plist/executable snapshot and its external launch constraint across app
replacement. The helper-backed item therefore moved to both a fresh label and a
fresh plist filename instead of refreshing the stale identity in place.

The bundle also retains a non-starting
`com.heyintentive.desktop.login.plist` solely so `SMAppService` can target the
pre-versioned `<bundle-id>.login` registration for retirement. Reconciliation
registers the fresh item without touching a potentially live legacy job.
Graceful app termination first shuts down the Coaching Window, every sensor, and
release operations, then unregisters only that old Intentive label. This remains
privacy-safe even when unregistering the launchd-owned legacy job terminates the
main process. Intentive never runs the global `sfltool resetbtm` workaround,
which would disturb unrelated login items.

## Consequences

- A login/background launch is menu-bar-only: no Dock icon, no window, sensing runs
  headless. Opening from the menu or Dock brings the window and Dock icon back.
- First run and manual opens are unchanged from the user's point of view (window + Dock).
- Under Option A the login-item mechanism moves from `SMAppService.mainApp` to a bundled
  LaunchAgent; the persisted `launchAtLogin` toggle contract is preserved.
- Helper-backed releases use a versioned LaunchAgent identity. The old
  Intentive-only identity is retired after privacy shutdown, while unrelated
  login items remain untouched.
- Launch at Login defaults to On. Legacy unversioned preferences migrate to On
  because their implicit default and an explicit user choice were
  indistinguishable; current-version explicit Off choices remain Off.
- Completing onboarding confirms Launch at Login registration before setup is
  persisted as complete. A registration failure keeps Finish visible and
  retryable.
- This phase changes app lifecycle behavior; it is best landed as its own reviewed PR,
  separate from the Private-Mode / floating-bar renovation.
