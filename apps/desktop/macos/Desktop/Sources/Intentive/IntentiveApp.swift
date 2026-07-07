import AppKit
import IntentiveDesktopCore
import IntentiveDesktopNativeAdapters
import SwiftUI

@main
struct IntentiveApp: App {
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
    }
    .commands {
      CommandGroup(after: .appInfo) {
        Button("Search Screen Memory") {
          NotificationCenter.default.post(name: .intentiveFocusScreenMemorySearch, object: nil)
        }
        .keyboardShortcut("f", modifiers: [.command])
      }
    }

    MenuBarExtra {
      Button(model.compilerSettings.ambientAudioCaptureEnabled ? "Mute Ambient Capture" : "Enable Ambient Capture") {
        model.setAmbientAudioCaptureEnabled(!model.compilerSettings.ambientAudioCaptureEnabled)
      }
      .disabled(!model.microphonePermissionStatus.isGranted)

      Button("Open Intentive") {
        NSApp.activate(ignoringOtherApps: true)
      }
    } label: {
      Label(
        model.compilerSettings.ambientAudioCaptureEnabled ? "Intentive Capturing" : "Intentive",
        systemImage: model.compilerSettings.ambientAudioCaptureEnabled ? "waveform.circle.fill" : "waveform.circle"
      )
    }
  }
}

extension Notification.Name {
  static let intentiveFocusScreenMemorySearch = Notification.Name("intentiveFocusScreenMemorySearch")
}
