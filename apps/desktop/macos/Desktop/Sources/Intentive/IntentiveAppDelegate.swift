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
      title: model.compilerSettings.captureEnabled ? "Pause Screen Capture" : "Enable Screen Capture",
      action: #selector(toggleCapture), keyEquivalent: "")
    captureItem.target = self
    captureItem.isEnabled = model.screenRecordingPermissionGranted
    menu.addItem(captureItem)

    let ambientItem = NSMenuItem(
      title: model.compilerSettings.ambientAudioCaptureEnabled ? "Mute Ambient Capture" : "Enable Ambient Capture",
      action: #selector(toggleAmbient), keyEquivalent: "")
    ambientItem.target = self
    ambientItem.isEnabled = model.microphonePermissionStatus.isGranted
    menu.addItem(ambientItem)

    menu.addItem(.separator())

    let openItem = NSMenuItem(
      title: "Open Intentive", action: #selector(openApp), keyEquivalent: "o")
    openItem.target = self
    menu.addItem(openItem)

    menu.addItem(.separator())

    let resetItem = NSMenuItem(
      title: "Reset Onboarding…", action: #selector(resetOnboarding), keyEquivalent: "")
    resetItem.target = self
    menu.addItem(resetItem)

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

  @objc private func toggleAmbient() {
    guard let model else { return }
    model.setAmbientAudioCaptureEnabled(!model.compilerSettings.ambientAudioCaptureEnabled)
  }

  @objc private func openApp() {
    NSApp.activate(ignoringOtherApps: true)
  }

  @objc private func resetOnboarding() {
    model?.resetOnboarding()
  }

  @objc private func signOut() {
    model?.signOut()
  }

  @objc private func quitApp() {
    NSApplication.shared.terminate(nil)
  }
}
