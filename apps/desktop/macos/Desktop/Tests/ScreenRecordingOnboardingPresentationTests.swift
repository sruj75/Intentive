import Combine
import XCTest

@testable import IntentiveDesktopPresentation

@MainActor
final class ScreenRecordingOnboardingPresentationTests: XCTestCase {
  func testStartingScreenRecordingPermissionFlowRequestsBeforeOpeningSettings() {
    let model = SetupPresentationSpy()

    model.startScreenRecordingPermissionFlow()

    XCTAssertEqual(model.screenRecordingEvents, [.request, .openSettings])
  }

  func testGrantedScreenRecordingRequestDoesNotOpenSettings() {
    let model = SetupPresentationSpy(grantsScreenRecordingWhenRequested: true)

    model.startScreenRecordingPermissionFlow()

    XCTAssertEqual(model.screenRecordingEvents, [.request])
  }

  func testApplicationActivationRefreshesPermissionWithoutRequestingAgain() {
    let model = SetupPresentationSpy()

    model.refreshSetupPermissionsAfterApplicationActivation()

    XCTAssertEqual(model.permissionRefreshCount, 1)
    XCTAssertTrue(model.screenRecordingEvents.isEmpty)
  }
}

@MainActor
private final class SetupPresentationSpy: @preconcurrency IntentiveSetupPresenting {
  enum ScreenRecordingEvent: Equatable {
    case request
    case openSettings
  }

  let objectWillChange = ObservableObjectPublisher()
  private let grantsScreenRecordingWhenRequested: Bool
  var screenRecordingEvents: [ScreenRecordingEvent] = []
  var permissionRefreshCount = 0
  var screenRecordingGranted = false

  init(grantsScreenRecordingWhenRequested: Bool = false) {
    self.grantsScreenRecordingWhenRequested = grantsScreenRecordingWhenRequested
  }

  var isAuthenticated: Bool { true }
  var crossClientSetupComplete: Bool { true }
  var authenticationLoading: Bool { false }
  var authenticationError: String? { nil }
  var setupStep: IntentiveSetupStep { .screenRecording }
  var microphoneGranted: Bool { false }
  var accessibilityGranted: Bool { false }
  var shortcutLabel: String { "⌘ ⇧ Space" }

  func signIn() {}
  func cancelSignIn() {}
  func completeCurrentSetupStep() {}
  func skipCurrentSetupStep() {}
  func requestScreenRecording() {
    screenRecordingEvents.append(.request)
    screenRecordingGranted = grantsScreenRecordingWhenRequested
  }
  func openScreenRecordingSettings() { screenRecordingEvents.append(.openSettings) }
  func refreshSetupPermissions() { permissionRefreshCount += 1 }
  func requestMicrophone() {}
  func openMicrophoneSettings() {}
  func requestAccessibility() {}
  func openAccessibilitySettings() {}
  func openFloatingBar() {}
}
