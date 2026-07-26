import Combine
import XCTest

@testable import IntentiveDesktopPresentation

@MainActor
final class ScreenRecordingOnboardingPresentationTests: XCTestCase {
  func testStartingScreenRecordingPermissionFlowDelegatesTheWholeFlowToTheModel() {
    let model = SetupPresentationSpy()

    model.startScreenRecordingPermissionFlow()

    XCTAssertEqual(model.screenRecordingEvents, [.request])
  }

  func testApplicationActivationRefreshesPermissionWithoutRequestingAgain() {
    let model = SetupPresentationSpy()

    model.refreshSetupPermissionsAfterApplicationActivation()

    XCTAssertEqual(model.permissionRefreshCount, 1)
    XCTAssertTrue(model.screenRecordingEvents.isEmpty)
  }

  func testLaunchAtLoginApprovalErrorOffersLoginItemsSettingsRecovery() {
    let model = SetupPresentationSpy()
    model.setupCompletionError =
      "Launch at Login needs approval in System Settings > General > Login Items."

    XCTAssertTrue(model.launchAtLoginApprovalRecoveryAvailable)
  }

  func testUnrelatedSetupErrorDoesNotOfferLoginItemsSettingsRecovery() {
    let model = SetupPresentationSpy()
    model.setupCompletionError = "Every required permission must be complete."

    XCTAssertFalse(model.launchAtLoginApprovalRecoveryAvailable)
  }
}

@MainActor
private final class SetupPresentationSpy: @preconcurrency IntentiveSetupPresenting {
  enum ScreenRecordingEvent: Equatable {
    case request
    case openSettings
  }

  let objectWillChange = ObservableObjectPublisher()
  var screenRecordingEvents: [ScreenRecordingEvent] = []
  var permissionRefreshCount = 0
  var screenRecordingGranted = false
  var setupCompletionError: String?

  var isAuthenticated: Bool { true }
  var crossClientSetupComplete: Bool { true }
  var authenticationLoading: Bool { false }
  var authenticationError: String? { nil }
  var setupStep: IntentiveSetupStep { .screenRecording }
  var microphoneGranted: Bool { false }
  var systemAudioGranted: Bool { false }
  var accessibilityGranted: Bool { false }
  var shortcutLabel: String { "⌘ ⇧ Space" }

  func signIn() {}
  func cancelSignIn() {}
  func completeCurrentSetupStep() {}
  func requestScreenRecording() {
    screenRecordingEvents.append(.request)
  }
  func openScreenRecordingSettings() { screenRecordingEvents.append(.openSettings) }
  func refreshSetupPermissions() { permissionRefreshCount += 1 }
  func requestMicrophone() {}
  func openMicrophoneSettings() {}
  func requestSystemAudio() {}
  func openSystemAudioSettings() {}
  func requestAccessibility() {}
  func openAccessibilitySettings() {}
  func openLoginItemsSettings() {}
  func openFloatingBar() {}
}
