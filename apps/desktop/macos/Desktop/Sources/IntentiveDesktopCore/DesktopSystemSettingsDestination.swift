import Foundation

/// Deep links to the concrete Privacy & Security TCC panes.
///
/// System Settings still dispatches these routes through the historical
/// `com.apple.preference.security` identity. On macOS 26.5.2, addressing the
/// backing `PrivacySecurity.extension` directly opens General instead of the
/// requested permission pane.
public enum DesktopSystemSettingsDestination: String, CaseIterable {
  case screenRecording = "Privacy_ScreenCapture"
  case microphone = "Privacy_Microphone"
  case systemAudioRecording = "Privacy_AudioCapture"
  case accessibility = "Privacy_Accessibility"

  public var url: URL {
    guard
      let url = URL(
        string:
          "x-apple.systempreferences:com.apple.preference.security?\(rawValue)"
      )
    else {
      preconditionFailure("Invalid built-in System Settings destination: \(rawValue)")
    }
    return url
  }
}
