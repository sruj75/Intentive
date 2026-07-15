import AppKit
import IntentiveDesktopCore
import IntentiveDesktopNativeAdapters
import SwiftUI

@main
struct IntentiveApp: App {
  // The menu bar is an `NSStatusItem` owned by the delegate, not a SwiftUI
  // `MenuBarExtra` (which renders unreliably on Sequoia). See IntentiveAppDelegate.
  @NSApplicationDelegateAdaptor(IntentiveAppDelegate.self) private var appDelegate
  @StateObject private var model: DesktopViewModel
  private let composition: DesktopApplicationComposition

  init() {
    let applicationSupportRoot = FileManager.default.urls(
      for: .applicationSupportDirectory,
      in: .userDomainMask
    ).first
      ?? FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent("Library/Application Support", isDirectory: true)
    let configuration = DesktopLaunchConfiguration.production(profileRoot: applicationSupportRoot)
    let composition = DesktopApplicationAssembler.assemble(configuration: configuration)
    self.composition = composition
    _model = StateObject(
      wrappedValue: DesktopViewModel(
        launchConfiguration: configuration,
        composition: composition
      )
    )
  }

  var body: some Scene {
    WindowGroup {
      MainWindowView(model: model, composition: composition)
        .frame(minWidth: 940, minHeight: 620)
        .onAppear { appDelegate.attach(model: model) }
    }
    .commands {
      CommandGroup(after: .appInfo) {
        Button("Search Screen Memory") {
          NotificationCenter.default.post(name: .intentiveFocusScreenMemorySearch, object: nil)
        }
        .keyboardShortcut("f", modifiers: [.command])
      }
    }
  }
}

extension Notification.Name {
  static let intentiveFocusScreenMemorySearch = Notification.Name("intentiveFocusScreenMemorySearch")
}
