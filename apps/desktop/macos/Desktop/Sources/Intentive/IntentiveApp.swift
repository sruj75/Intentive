import AppKit
import IntentiveDesktopCore
import IntentiveDesktopNativeAdapters
import SwiftUI

@main
struct IntentiveApp: App {
  // The menu bar is an `NSStatusItem` owned by the delegate, not a SwiftUI
  // `MenuBarExtra` (which renders unreliably on Sequoia). See IntentiveAppDelegate.
  @NSApplicationDelegateAdaptor(IntentiveAppDelegate.self) private var appDelegate
  @StateObject private var model = DesktopViewModel()

  init() {
    Task {
      try? await DefaultRunAnywhereVoiceClient().warmUp()
    }
  }

  var body: some Scene {
    WindowGroup {
      MainWindowView(model: model)
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
