import Foundation
import IntentiveDesktopCore
import XCTest

final class DesktopOnboardingTests: XCTestCase {
  func testFreshProfileStartsAtValuePrivacyAndUsesApprovedOrder() {
    let requirements = requirements()

    XCTAssertEqual(
      DesktopOnboardingStep.allCases,
      [.valuePrivacy, .authentication, .screenRecording, .audioConsent, .privacyControls,
       .textChatShortcut, .ready]
    )
    XCTAssertEqual(requirements.nextIncompleteStep, .valuePrivacy)
  }

  func testAuthenticationMustCompleteBeforeSensingSetup() {
    let progress = DesktopOnboardingProgress().completing(.valuePrivacy)

    XCTAssertEqual(requirements(progress: progress, isAuthenticated: false).nextIncompleteStep, .authentication)
    XCTAssertEqual(requirements(progress: progress, isAuthenticated: true).nextIncompleteStep, .screenRecording)
  }

  func testScreenRecordingDecisionIsHonestAndLiveGrantControlsCaptureReadiness() {
    let base = DesktopOnboardingProgress()
      .completing(.valuePrivacy)

    for decision in [DesktopPermissionDecision.denied, .deferred] {
      let progress = base.decidingScreenRecording(decision)
      let state = requirements(progress: progress, isAuthenticated: true, screenGranted: false)
      XCTAssertEqual(state.nextIncompleteStep, .audioConsent)
      XCTAssertFalse(state.captureReady)
    }

    let granted = base.decidingScreenRecording(.granted)
    XCTAssertEqual(
      requirements(progress: granted, isAuthenticated: true, screenGranted: false).screenRecordingState,
      .grantLost
    )
    XCTAssertFalse(requirements(progress: granted, isAuthenticated: true, screenGranted: false).captureReady)
    XCTAssertTrue(requirements(progress: granted, isAuthenticated: true, screenGranted: true).captureReady)
  }

  func testOptionalAudioDeniedOrDeferredNeverBlocksTextChatOrCompletion() {
    for decision in [DesktopPermissionDecision.denied, .deferred] {
      var progress = progressThroughPrivacy(screen: .deferred, audio: decision)
      progress = progress.completing(.textChatShortcut).completingOnboarding()

      let state = requirements(
        progress: progress,
        isAuthenticated: true,
        screenGranted: false,
        microphoneGranted: false,
        systemAudioGranted: false
      )
      XCTAssertTrue(state.isComplete)
      XCTAssertTrue(state.textChatReady)
      XCTAssertFalse(state.captureReady)
    }
  }

  func testRelaunchResumesAtFirstIncompleteStep() throws {
    let suiteName = "DesktopOnboardingTests-\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
    defer { defaults.removePersistentDomain(forName: suiteName) }
    let store = UserDefaultsDesktopOnboardingProgressStore(defaults: defaults, key: "progress")
    let saved = DesktopOnboardingProgress()
      .completing(.valuePrivacy)
      .decidingScreenRecording(.deferred)
      .decidingAudio(.denied)
    try store.save(saved)

    XCTAssertEqual(
      requirements(progress: store.load(), isAuthenticated: true).nextIncompleteStep,
      .privacyControls
    )
  }

  func testCompletionPersistsAndDoesNotReturnOnNextLaunch() throws {
    let suiteName = "DesktopOnboardingTests-\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
    defer { defaults.removePersistentDomain(forName: suiteName) }
    let store = UserDefaultsDesktopOnboardingProgressStore(defaults: defaults, key: "progress")
    let completed = progressThroughPrivacy(screen: .granted, audio: .deferred)
      .completing(.textChatShortcut)
      .completingOnboarding()
    try store.save(completed)

    let relaunched = requirements(
      progress: store.load(), isAuthenticated: true, screenGranted: true)
    XCTAssertTrue(relaunched.isComplete)
    XCTAssertNil(relaunched.nextIncompleteStep)
    XCTAssertTrue(relaunched.captureReady)
  }

  private func progressThroughPrivacy(
    screen: DesktopPermissionDecision,
    audio: DesktopPermissionDecision
  ) -> DesktopOnboardingProgress {
    DesktopOnboardingProgress()
      .completing(.valuePrivacy)
      .decidingScreenRecording(screen)
      .decidingAudio(audio)
      .completing(.privacyControls)
  }

  private func requirements(
    progress: DesktopOnboardingProgress = DesktopOnboardingProgress(),
    isAuthenticated: Bool = false,
    screenGranted: Bool = false,
    microphoneGranted: Bool = false,
    systemAudioGranted: Bool = false
  ) -> DesktopOnboardingRequirements {
    DesktopOnboardingRequirements(
      progress: progress,
      isAuthenticated: isAuthenticated,
      screenRecordingPermissionGranted: screenGranted,
      microphonePermissionGranted: microphoneGranted,
      systemAudioPermissionGranted: systemAudioGranted
    )
  }
}
