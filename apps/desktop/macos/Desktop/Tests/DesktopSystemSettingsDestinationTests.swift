import XCTest

@testable import IntentiveDesktopCore

final class DesktopSystemSettingsDestinationTests: XCTestCase {
  func testPrivacyDestinationsUseTheSecurityPaneRoutesAcceptedBySystemSettings() {
    XCTAssertEqual(
      DesktopSystemSettingsDestination.screenRecording.url.absoluteString,
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
    )
    XCTAssertEqual(
      DesktopSystemSettingsDestination.microphone.url.absoluteString,
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
    )
    XCTAssertEqual(
      DesktopSystemSettingsDestination.systemAudioRecording.url.absoluteString,
      "x-apple.systempreferences:com.apple.preference.security?Privacy_AudioCapture"
    )
    XCTAssertEqual(
      DesktopSystemSettingsDestination.accessibility.url.absoluteString,
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
    )
  }
}
