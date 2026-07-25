# ADR 0011: Launch / activation lifecycle — menu-bar-app pattern

## Status

Accepted. Confirmed on **Option A** (bundled LaunchAgent with a `--background` marker) and
implemented. This is the lifecycle change called out in the Desktop UX Renovation plan as
"the one phase worth a design confirmation."

## Context

Today the Desktop Client launches the same way regardless of how it was started:

- `Info.plist` sets `LSUIElement=false`, so the app is a regular Dock app.
- The SwiftUI `WindowGroup` (`IntentiveApp.swift`) always renders its window at launch.
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

Because SwiftUI's `WindowGroup` eagerly creates a window at launch, `.accessory` alone
does not suppress it; on a background launch the app must also close/withhold that window
until a user action reopens it.

### Resolved — how to detect a background (login) launch

**Chosen: Option A — bundled LaunchAgent with a marker argument (plan's recommendation).**
`SMAppService.mainApp` cannot pass launch arguments, so switch launch-at-login to a
bundled LaunchAgent registered via `SMAppService.agent(plistName:)` whose
`ProgramArguments` include `--background`; read it via `CommandLine.arguments`. The
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

Confirmed on Option A. As built: the LaunchAgent plist
(`com.heyintentive.desktop.login.plist`) is bundled at `Contents/Library/LaunchAgents/`
by `build-app-bundle.sh` with `BundleProgram = Contents/MacOS/Intentive` (bundle-relative,
survives moves) and `ProgramArguments = [..., --background]`;
`MainWindowView.setLaunchAtLogin` registers it via `SMAppService.agent(plistName:)` instead
of `SMAppService.mainApp`. `IntentiveAppDelegate` defaults to `.accessory` at
`applicationDidFinishLaunching`, reads the `--background` marker from `CommandLine.arguments`,
and in `resolveLaunchPresentation()` (invoked from `attach(model:)`, once onboarding state is
known) either stays menu-bar-only (background + onboarding complete: `orderOut` the eager
`WindowGroup` window) or promotes to `.regular` and fronts the window. `openApp()` and
`applicationShouldHandleReopen(_:hasVisibleWindows:)` promote on demand.

## Consequences

- A login/background launch is menu-bar-only: no Dock icon, no window, sensing runs
  headless. Opening from the menu or Dock brings the window and Dock icon back.
- First run and manual opens are unchanged from the user's point of view (window + Dock).
- Under Option A the login-item mechanism moves from `SMAppService.mainApp` to a bundled
  LaunchAgent; the persisted `launchAtLogin` toggle contract is preserved.
- This phase changes app lifecycle behavior; it is best landed as its own reviewed PR,
  separate from the Private-Mode / floating-bar renovation.
