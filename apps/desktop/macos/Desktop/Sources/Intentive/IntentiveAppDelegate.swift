import AppKit
import SwiftUI

/// Owns the app's `NSStatusBar` menu.
///
/// Omi deliberately drives the menu bar with a real `NSStatusItem` + `NSMenu`
/// rather than SwiftUI's `MenuBarExtra`, which renders unreliably on macOS
/// Sequoia (status items go "phantom" — present in memory but never drawn).
/// Intentive keeps that decision; this is the mechanism swap the floating-bar
/// restoration plan calls for.
///
/// The menu's toggle titles and enabled state track live `DesktopViewModel`
/// state, so the menu is rebuilt from scratch each time it opens
/// (`menuNeedsUpdate`) instead of being cached. The model is injected after
/// launch via `attach(model:)` because the SwiftUI `@StateObject` that owns it
/// is created separately from — and slightly later than — this delegate; the
/// menu tolerates a nil model until the first `attach`.
@MainActor
final class IntentiveAppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
  private var statusItem: NSStatusItem?
  private weak var model: DesktopViewModel?

  /// True when the app was auto-launched at login by the bundled LaunchAgent,
  /// which passes `--background` (see ADR 0011). Drives the menu-bar-only path.
  private var launchedInBackground = false
  /// The menu-bar-app launch decision runs exactly once, either from the DEBUG
  /// acceptance carve-out below or when the view model attaches.
  private var didResolveLaunchPresentation = false

  func applicationDidFinishLaunching(_ notification: Notification) {
    setUpStatusItem()
    launchedInBackground = CommandLine.arguments.contains("--background")

    // Menu-bar-app pattern (ADR 0011): default to `.accessory` (no Dock, no
    // window) so a background login launch never flashes a Dock icon. The final
    // decision — whether to promote to `.regular` and show a window — is made in
    // `resolveLaunchPresentation()` once the view model attaches and we know the
    // onboarding state. `openApp()` and `applicationShouldHandleReopen` promote
    // on demand.
    NSApp.setActivationPolicy(.accessory)

    #if DEBUG
    if ProcessInfo.processInfo.environment["INTENTIVE_ACCEPTANCE_PROFILE_ROOT"] != nil {
      // The AX driver expects a normal windowed app; force the window forward and
      // pin the presentation decision so the later model attach does not re-hide it.
      didResolveLaunchPresentation = true
      NSApp.setActivationPolicy(.regular)
      NSApp.activate(ignoringOtherApps: true)
      Task { @MainActor in
        try? await Task.sleep(nanoseconds: 250_000_000)
        NSApp.activate(ignoringOtherApps: true)
        NSApp.windows.forEach { $0.makeKeyAndOrderFront(nil) }
      }
    }
    #endif
  }

  /// macOS permission changes are commonly made while System Settings is
  /// frontmost. Reattest the full Coaching Window grant set whenever Intentive
  /// becomes active, regardless of whether its setup surface is visible.
  func applicationDidBecomeActive(_ notification: Notification) {
    model?.refreshCoachingPermissionsFromSystem(allowRequiredAudioRetry: true)
  }

  /// A Dock click or `open` on an already-running instance reopens the window.
  /// In the menu-bar-only (background) state there is no Dock icon, so this fires
  /// only after the app has been promoted to `.regular`; it re-fronts the window.
  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool)
    -> Bool
  {
    presentPrimaryWindow()
    return true
  }

  /// Refuse termination until the active Coaching Window has been durably
  /// ended. Sensor shutdown happens before the enqueue attempt, so a transport
  /// outage stays private while a local persistence failure remains visible
  /// and retryable instead of silently losing the end boundary.
  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    guard let model else { return .terminateNow }
    return model.requestQuit() ? .terminateNow : .terminateCancel
  }

  /// Wires the menu to the app's shared view model once SwiftUI has created it,
  /// and finalizes the launch presentation now that onboarding state is known.
  func attach(model: DesktopViewModel) {
    self.model = model
    model.configureCoachingLaunch(background: launchedInBackground)
    resolveLaunchPresentation()
  }

  /// Finalizes the menu-bar-app launch decision (ADR 0011) once the view model is
  /// available. Runs once. A background (login) launch with onboarding already
  /// complete stays menu-bar-only — no Dock, no window, sensing headless — with
  /// the eager `WindowGroup` window merely ordered out so a later "Open Intentive"
  /// can front it again. Every other launch (first run / onboarding incomplete, or
  /// a user Finder/Dock launch) shows the window with a Dock icon.
  private func resolveLaunchPresentation() {
    guard !didResolveLaunchPresentation, let model else { return }
    didResolveLaunchPresentation = true
    let onboardingComplete = !model.showOnboarding
    if launchedInBackground && onboardingComplete {
      NSApp.setActivationPolicy(.accessory)
      NSApp.windows.forEach { $0.orderOut(nil) }
    } else {
      presentPrimaryWindow()
    }
  }

  /// Promotes the app to a regular Dock app and fronts its window. Used by the
  /// user-facing entry points (menu "Open Intentive", Dock reopen) and by the
  /// window-showing launch paths.
  private func presentPrimaryWindow() {
    NSApp.setActivationPolicy(.regular)
    NSApp.activate(ignoringOtherApps: true)
    NSApp.windows.forEach { $0.makeKeyAndOrderFront(nil) }
  }

  private func setUpStatusItem() {
    let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    if let button = statusItem.button {
      button.image = intentiveMenuBarImage()
      button.toolTip = "Intentive"
      button.setAccessibilityIdentifier("menu-status-item")
    }
    let menu = NSMenu()
    menu.delegate = self
    statusItem.menu = menu
    self.statusItem = statusItem
  }

  private func intentiveMenuBarImage() -> NSImage? {
    guard let url = Bundle.module.url(forResource: "IntentiveMenuBarIcon", withExtension: "png"),
      let image = NSImage(contentsOf: url)
    else {
      return nil
    }

    image.size = NSSize(width: 21, height: 21)
    image.isTemplate = true
    image.accessibilityDescription = "Intentive"
    return image
  }

  // MARK: - NSMenuDelegate

  /// Rebuilds the menu against current model state each time the user opens it.
  /// Coaching has one privacy boundary: Pause/Resume atomically controls every
  /// sensing source instead of exposing independent run-state toggles.
  func menuNeedsUpdate(_ menu: NSMenu) {
    menu.removeAllItems()
    guard let model else { return }

    let coachingTitle = model.coachingState == .paused ? "Resume Coaching" : "Pause Coaching"
    let coachingItem = NSMenuItem(
      title: coachingTitle,
      action: #selector(toggleCoaching),
      keyEquivalent: ""
    )
    coachingItem.target = self
    coachingItem.setAccessibilityIdentifier(
      model.coachingState == .paused ? "menu-resume-coaching" : "menu-pause-coaching"
    )
    switch model.coachingState {
    case .active, .locked, .paused:
      coachingItem.isEnabled = true
    case .inactive:
      coachingItem.isEnabled = false
    }
    menu.addItem(coachingItem)

    // The floating bar is the sole conversation surface. Besides the global
    // hotkey and a Post-Message-Back auto-presenting it, this is the click
    // affordance that opens the composer — restored after the menu redesign
    // dropped it and orphaned `openFloatingBar()`.
    let conversationItem = NSMenuItem(
      title: "Open Floating Conversation", action: #selector(openConversation), keyEquivalent: "")
    conversationItem.target = self
    conversationItem.setAccessibilityIdentifier("menu-open-conversation")
    menu.addItem(conversationItem)

    let openItem = NSMenuItem(
      title: "Open Intentive", action: #selector(openApp), keyEquivalent: "o")
    openItem.target = self
    openItem.setAccessibilityIdentifier("menu-open-intentive")
    menu.addItem(openItem)

    let updateItem = NSMenuItem(
      title: "Check for Updates…", action: #selector(checkForUpdates), keyEquivalent: "")
    updateItem.target = self
    updateItem.setAccessibilityIdentifier("menu-check-updates")
    updateItem.isEnabled = model.launchConfiguration.systemBoundaries.updatesEnabled
    menu.addItem(updateItem)

    let accountTitle = model.accountEmail.map { "Signed in as \($0)" } ?? "Signed in"
    let accountItem = NSMenuItem(title: accountTitle, action: nil, keyEquivalent: "")
    accountItem.isEnabled = false
    accountItem.setAccessibilityIdentifier("menu-account")
    menu.addItem(accountItem)

    let resetItem = NSMenuItem(
      title: "Reset Onboarding…", action: #selector(resetOnboarding), keyEquivalent: "")
    resetItem.target = self
    resetItem.setAccessibilityIdentifier("menu-reset-onboarding")
    menu.addItem(resetItem)

    let reportItem = NSMenuItem(
      title: "Report Issue…", action: #selector(reportIssue), keyEquivalent: "")
    reportItem.target = self
    reportItem.setAccessibilityIdentifier("menu-report-issue")
    menu.addItem(reportItem)

    let signOutItem = NSMenuItem(title: "Sign Out", action: #selector(signOut), keyEquivalent: "")
    signOutItem.target = self
    signOutItem.setAccessibilityIdentifier("menu-sign-out")
    menu.addItem(signOutItem)

    let quitItem = NSMenuItem(
      title: "Quit Intentive", action: #selector(quitApp), keyEquivalent: "q")
    quitItem.target = self
    quitItem.setAccessibilityIdentifier("menu-quit-intentive")
    menu.addItem(quitItem)
  }

  // MARK: - Actions

  @objc private func toggleCoaching() {
    guard let model else { return }
    if model.coachingState == .paused {
      model.resumeCoaching()
    } else {
      model.pauseCoaching()
    }
  }

  @objc private func openApp() {
    presentPrimaryWindow()
  }

  @objc private func openConversation() {
    model?.openFloatingBar()
  }

  @objc private func checkForUpdates() {
    model?.checkForUpdates()
  }

  @objc private func signOut() {
    model?.signOut()
  }

  @objc private func resetOnboarding() {
    guard let model else { return }
    let alert = NSAlert()
    alert.messageText = "Reset Onboarding?"
    alert.informativeText = "This clears only onboarding progress and restarts Intentive. Your account and Screen Memory remain unchanged."
    alert.addButton(withTitle: "Reset")
    alert.addButton(withTitle: "Cancel")
    guard alert.runModal() == .alertFirstButtonReturn else { return }
    model.resetOnboarding()
    #if DEBUG
    // The external AX driver must observe the resumed production onboarding
    // sheet in this process. Installed-candidate acceptance exercises the real
    // relaunch path; only the isolated acceptance profile suppresses it here.
    if ProcessInfo.processInfo.environment["INTENTIVE_ACCEPTANCE_PROFILE_ROOT"] != nil { return }
    #endif
    let configuration = NSWorkspace.OpenConfiguration()
    NSWorkspace.shared.openApplication(at: Bundle.main.bundleURL, configuration: configuration) { _, _ in
      NSApplication.shared.terminate(nil)
    }
  }

  @objc private func reportIssue() {
    guard let model else { return }
    FeedbackWindow.show(model: model)
  }

  @objc private func quitApp() {
    // `applicationShouldTerminate` performs and verifies the durable stop.
    NSApplication.shared.terminate(nil)
  }
}
