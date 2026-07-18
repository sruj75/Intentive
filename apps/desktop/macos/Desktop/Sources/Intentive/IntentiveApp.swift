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
    #if DEBUG
    let acceptanceRoot = ProcessInfo.processInfo.environment["INTENTIVE_ACCEPTANCE_PROFILE_ROOT"]
      .map { URL(fileURLWithPath: $0, isDirectory: true) }
    let configuration = acceptanceRoot.map {
      DesktopLaunchConfiguration.assembledTest(
        profileRoot: $0,
        permissions: DesktopPermissionSnapshot(screenRecording: .granted, microphone: .granted),
        authentication: .signedIn(
          userID: "acceptance-user",
          email: "acceptance@example.com"
        ),
        runtime: .connected,
        systemBoundaries: DesktopSystemBoundaryPolicy(
          captureEnabled: true,
          networkEnabled: false,
          updatesEnabled: true,
          telemetryEnabled: false
        )
      )
    } ?? DesktopLaunchConfiguration.production(profileRoot: applicationSupportRoot)
    #else
    let configuration = DesktopLaunchConfiguration.production(profileRoot: applicationSupportRoot)
    #endif
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
