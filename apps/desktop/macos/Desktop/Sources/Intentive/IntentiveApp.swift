import IntentiveDesktopCore
import SwiftUI

@main
struct IntentiveApp: App {
  var body: some Scene {
    WindowGroup {
      MainWindowView()
        .frame(minWidth: 940, minHeight: 620)
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
