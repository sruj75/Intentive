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
    let model = DesktopViewModel(
      launchConfiguration: configuration,
      composition: composition
    )
    self.composition = composition
    _model = StateObject(wrappedValue: model)
    appDelegate.attach(
      model: model,
      makePrimaryWindowContent: {
        AnyView(
          MainWindowView(model: model, composition: composition)
            .frame(minWidth: 940, minHeight: 620)
        )
      }
    )
  }

  var body: some Scene {
    // The Settings surface is owned by one retained NSWindowController in the
    // app delegate. A SwiftUI Window scene is intentionally not used here:
    // menu-bar-only login launch does not instantiate hidden scene content, so
    // a reopen action captured from that content is unavailable exactly when
    // Finder, Spotlight, or `open -a` needs to create the first window.
    Settings {
      EmptyView()
    }
    .commands {
      CommandGroup(replacing: .appSettings) {
        Button("Open Intentive…") {
          appDelegate.showPrimaryWindow()
        }
        .keyboardShortcut(",", modifiers: .command)
      }
    }
  }
}
