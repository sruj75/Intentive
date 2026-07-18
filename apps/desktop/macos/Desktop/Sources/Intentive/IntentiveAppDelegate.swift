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

  func applicationDidFinishLaunching(_ notification: Notification) {
    setUpStatusItem()
    #if DEBUG
    if ProcessInfo.processInfo.environment["INTENTIVE_ACCEPTANCE_PROFILE_ROOT"] != nil {
      NSApp.activate(ignoringOtherApps: true)
      Task { @MainActor in
        try? await Task.sleep(nanoseconds: 250_000_000)
        NSApp.activate(ignoringOtherApps: true)
        NSApp.windows.forEach { $0.makeKeyAndOrderFront(nil) }
      }
    }
    #endif
  }

  /// Slice 07 — quit path. Omi's `OmiApp.applicationWillTerminate` flushes the
  /// Rewind chunk then marks clean shutdown. The Intentive equivalent routes
  /// through `DesktopViewModel.requestQuit()`, which finalizes the active
  /// video chunk and emits `session_end_marker` (reason `.quit`) before the OS
  /// terminates the process.
  func applicationWillTerminate(_ notification: Notification) {
    model?.requestQuit()
  }

  /// Wires the menu to the app's shared view model once SwiftUI has created it.
  func attach(model: DesktopViewModel) {
    self.model = model
  }

  private func setUpStatusItem() {
    let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    if let button = statusItem.button {
      // Neutral placeholder glyph; the branded mark lands with the future
      // branding revamp (deferred).
      let symbol = NSImage(
        systemSymbolName: "waveform.circle", accessibilityDescription: "Intentive")
      symbol?.isTemplate = true
      button.image = symbol
      button.toolTip = "Intentive"
      button.setAccessibilityIdentifier("menu-status-item")
    }
    let menu = NSMenu()
    menu.delegate = self
    statusItem.menu = menu
    self.statusItem = statusItem
  }

  // MARK: - NSMenuDelegate

  /// Rebuilds the menu against current model state each time the user opens it,
  /// so the capture toggles show the right verb and disable when their
  /// permission is missing.
  func menuNeedsUpdate(_ menu: NSMenu) {
    menu.removeAllItems()
    guard let model else { return }

    let captureItem = NSMenuItem()
    captureItem.view = makeToggleItemView(
      title: "Screen Capture",
      iconName: "rectangle.dashed.badge.record",
      isOn: model.captureState.isRunning,
      enabled: model.screenRecordingPermissionGranted,
      action: #selector(toggleCapture(_:))
    )
    menu.addItem(captureItem)

    let audioItem = NSMenuItem()
    audioItem.view = makeToggleItemView(
      title: "Audio Recording",
      iconName: "mic.fill",
      isOn: model.passiveAudioRunning,
      enabled: model.microphonePermissionStatus.isGranted,
      action: #selector(toggleAudio(_:))
    )
    menu.addItem(audioItem)

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

  @objc private func toggleCapture(_ sender: NSSwitch) {
    guard let model else { return }
    model.setCaptureEnabled(sender.state == .on)
  }

  @objc private func toggleAudio(_ sender: NSSwitch) {
    model?.setAmbientAudioCaptureEnabled(sender.state == .on)
  }

  @objc private func openApp() {
    NSApp.activate(ignoringOtherApps: true)
    NSApp.windows.forEach { $0.makeKeyAndOrderFront(nil) }
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
    // `applicationWillTerminate` handles the durable stop; `terminate` triggers it.
    NSApplication.shared.terminate(nil)
  }

  private func makeToggleItemView(
    title: String,
    iconName: String,
    isOn: Bool,
    enabled: Bool,
    action: Selector
  ) -> NSView {
    let view = NSView(frame: NSRect(x: 0, y: 0, width: 260, height: 36))
    view.setAccessibilityIdentifier("menu-\(title.lowercased().replacingOccurrences(of: " ", with: "-"))")
    let icon = NSImageView(frame: NSRect(x: 16, y: 10, width: 16, height: 16))
    icon.image = NSImage(systemSymbolName: iconName, accessibilityDescription: title)
    icon.contentTintColor = .secondaryLabelColor
    view.addSubview(icon)
    let label = NSTextField(labelWithString: title)
    label.frame = NSRect(x: 40, y: 10, width: 150, height: 16)
    label.font = .systemFont(ofSize: 13)
    view.addSubview(label)
    let toggle = NSSwitch()
    toggle.controlSize = .small
    toggle.state = isOn ? .on : .off
    toggle.isEnabled = enabled
    toggle.target = self
    toggle.action = action
    toggle.sizeToFit()
    toggle.frame.origin = NSPoint(x: 260 - toggle.frame.width - 16, y: (36 - toggle.frame.height) / 2)
    toggle.autoresizingMask = [.minXMargin]
    toggle.setAccessibilityIdentifier("menu-\(title.lowercased().replacingOccurrences(of: " ", with: "-"))-switch")
    view.addSubview(toggle)
    return view
  }
}
