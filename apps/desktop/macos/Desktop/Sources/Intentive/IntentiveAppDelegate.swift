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

    let captureItem = NSMenuItem(
      title: captureToggleTitle,
      action: #selector(toggleCapture), keyEquivalent: "")
    captureItem.target = self
    captureItem.isEnabled = model.screenRecordingPermissionGranted
    menu.addItem(captureItem)

    menu.addItem(.separator())

    let conversationItem = NSMenuItem(
      title: "Open Floating Conversation", action: #selector(openFloatingConversation), keyEquivalent: "")
    conversationItem.target = self
    menu.addItem(conversationItem)

    let openItem = NSMenuItem(
      title: "Open Intentive", action: #selector(openApp), keyEquivalent: "o")
    openItem.target = self
    menu.addItem(openItem)

    let updateItem = NSMenuItem(
      title: "Check for Updates…", action: #selector(checkForUpdates), keyEquivalent: "")
    updateItem.target = self
    updateItem.isEnabled = model.launchConfiguration.systemBoundaries.updatesEnabled
    menu.addItem(updateItem)

    menu.addItem(.separator())

    let signOutItem = NSMenuItem(title: "Sign Out", action: #selector(signOut), keyEquivalent: "")
    signOutItem.target = self
    menu.addItem(signOutItem)

    menu.addItem(.separator())

    let quitItem = NSMenuItem(
      title: "Quit Intentive", action: #selector(quitApp), keyEquivalent: "q")
    quitItem.target = self
    menu.addItem(quitItem)
  }

  // MARK: - Actions

  @objc private func toggleCapture() {
    guard let model else { return }
    model.setCaptureEnabled(!model.compilerSettings.captureEnabled)
  }

  @objc private func openApp() {
    NSApp.activate(ignoringOtherApps: true)
  }

  @objc private func openFloatingConversation() {
    model?.openFloatingConversation()
  }

  @objc private func checkForUpdates() {
    model?.checkForUpdates()
  }

  @objc private func signOut() {
    model?.signOut()
  }

  @objc private func quitApp() {
    // `applicationWillTerminate` handles the durable stop; `terminate` triggers it.
    NSApplication.shared.terminate(nil)
  }

  /// Slice 07 — the menu title reflects the live running state mirrored with
  /// the saved enabled flag, exactly as Omi's `makeToggleItemView` reads
  /// `screenAnalysisEnabled && isMonitoring`. This keeps the menu, the in-app
  /// toggle, and the auto-resumed loop in sync after sleep/wake or
  /// competing-recorder backoff.
  private var captureToggleTitle: String {
    guard let model else { return "Enable Screen Capture" }
    if model.captureRunning { return "Pause Screen Capture" }
    return model.compilerSettings.captureEnabled ? "Resume Screen Capture" : "Enable Screen Capture"
  }
}
