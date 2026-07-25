import Foundation
import IntentiveDesktopCore
import XCTest

final class DesktopOnboardingTests: XCTestCase {
  func testSignInIsOutsideSixStepRailAndRetainedOrderIsSemantic() {
    XCTAssertEqual(
      DesktopOnboardingStep.allCases,
      [.trust, .screenRecording, .microphone, .accessibility, .floatingBarShortcut, .floatingBarDemo]
    )
    XCTAssertNil(requirements(isAuthenticated: false).nextIncompleteStep)
    XCTAssertEqual(requirements(isAuthenticated: true).nextIncompleteStep, .trust)
  }

  func testCrossClientGateBlocksMacSetupUntilPhoneFinishes() {
    let state = requirements(isAuthenticated: true, crossClientSetupComplete: false)
    XCTAssertNil(state.nextIncompleteStep)
    XCTAssertFalse(state.isComplete)
  }

  func testPermissionSkipsResumeAtFirstUnsatisfiedRetainedStep() {
    let progress = DesktopOnboardingProgress()
      .completing(.trust)
      .decidingScreenRecording(.deferred)
      .decidingMicrophone(.denied)

    XCTAssertEqual(requirements(progress: progress, isAuthenticated: true).nextIncompleteStep, .accessibility)
  }

  func testLiveScreenGrantControlsCaptureReadinessWithoutReopeningCompletedSetup() {
    let progress = completedProgress(screen: .granted, microphone: .deferred)
    XCTAssertTrue(requirements(progress: progress, isAuthenticated: true, screenGranted: true).captureReady)
    XCTAssertFalse(requirements(progress: progress, isAuthenticated: true, screenGranted: false).captureReady)
    XCTAssertTrue(requirements(progress: progress, isAuthenticated: true, screenGranted: false).isComplete)
  }

  func testRelaunchPersistsSemanticProgress() throws {
    let suiteName = "DesktopOnboardingTests-\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
    defer { defaults.removePersistentDomain(forName: suiteName) }
    let store = UserDefaultsDesktopOnboardingProgressStore(defaults: defaults, key: "progress")
    let progress = DesktopOnboardingProgress()
      .completing(.trust)
      .decidingScreenRecording(.deferred)
    try store.save(progress)
    XCTAssertEqual(
      requirements(progress: store.load(), isAuthenticated: true).nextIncompleteStep,
      .microphone
    )
  }

  func testCompletedLegacyUserMigratesWithoutSeeingSetupAgain() throws {
    let legacy = """
      {"completedSteps":["value_privacy","screen_recording","audio_consent","privacy_controls","text_chat_shortcut","ready"],"completed":true}
      """.data(using: .utf8)!
    let progress = try JSONDecoder().decode(DesktopOnboardingProgress.self, from: legacy)
    XCTAssertTrue(requirements(progress: progress, isAuthenticated: true).isComplete)
    XCTAssertNil(requirements(progress: progress, isAuthenticated: true).nextIncompleteStep)
  }

  private func completedProgress(
    screen: DesktopPermissionDecision,
    microphone: DesktopPermissionDecision
  ) -> DesktopOnboardingProgress {
    DesktopOnboardingProgress()
      .completing(.trust)
      .decidingScreenRecording(screen)
      .decidingMicrophone(microphone)
      .completing(.accessibility)
      .completing(.floatingBarShortcut)
      .completing(.floatingBarDemo)
  }

  private func requirements(
    progress: DesktopOnboardingProgress = DesktopOnboardingProgress(),
    isAuthenticated: Bool = false,
    crossClientSetupComplete: Bool = true,
    screenGranted: Bool = false
  ) -> DesktopOnboardingRequirements {
    DesktopOnboardingRequirements(
      progress: progress,
      isAuthenticated: isAuthenticated,
      crossClientSetupComplete: crossClientSetupComplete,
      screenRecordingPermissionGranted: screenGranted,
      microphonePermissionGranted: false
    )
  }
}
