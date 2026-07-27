import Foundation
import IntentiveDesktopCore
import XCTest

final class DesktopOnboardingTests: XCTestCase {
  func testSignInIsOutsideSevenStepRailAndRetainedOrderIsSemantic() {
    XCTAssertEqual(
      DesktopOnboardingStep.allCases,
      [
        .trust,
        .screenRecording,
        .microphone,
        .systemAudio,
        .accessibility,
        .floatingBarShortcut,
        .floatingBarDemo,
      ]
    )
    XCTAssertNil(requirements(isAuthenticated: false).nextIncompleteStep)
    XCTAssertEqual(requirements(isAuthenticated: true).nextIncompleteStep, .trust)
  }

  func testCrossClientGateBlocksMacSetupUntilPhoneFinishes() {
    let state = requirements(isAuthenticated: true, crossClientSetupComplete: false)
    XCTAssertNil(state.nextIncompleteStep)
    XCTAssertFalse(state.isComplete)
  }

  func testPermissionDecisionsDoNotBypassMissingLiveGrants() {
    let progress = DesktopOnboardingProgress()
      .completing(.trust)
      .decidingScreenRecording(.deferred)
      .decidingMicrophone(.denied)

    XCTAssertEqual(requirements(progress: progress, isAuthenticated: true).nextIncompleteStep, .screenRecording)
  }

  func testCompletedSetupRequiresEveryLiveCoachingPermission() {
    let progress = completedProgress(screen: .granted, microphone: .granted)
    let complete = DesktopOnboardingRequirements(
      progress: progress,
      isAuthenticated: true,
      screenRecordingPermissionGranted: true,
      microphonePermissionGranted: true,
      systemAudioPermissionGranted: true,
      accessibilityPermissionGranted: true
    )

    XCTAssertTrue(complete.isComplete)
    XCTAssertFalse(
      DesktopOnboardingRequirements(
        progress: progress,
        isAuthenticated: true,
        screenRecordingPermissionGranted: false,
        microphonePermissionGranted: true,
        systemAudioPermissionGranted: true,
        accessibilityPermissionGranted: true
      ).isComplete
    )
    XCTAssertFalse(
      DesktopOnboardingRequirements(
        progress: progress,
        isAuthenticated: true,
        screenRecordingPermissionGranted: true,
        microphonePermissionGranted: false,
        systemAudioPermissionGranted: true,
        accessibilityPermissionGranted: true
      ).isComplete
    )
    XCTAssertFalse(
      DesktopOnboardingRequirements(
        progress: progress,
        isAuthenticated: true,
        screenRecordingPermissionGranted: true,
        microphonePermissionGranted: true,
        systemAudioPermissionGranted: false,
        accessibilityPermissionGranted: true
      ).isComplete
    )
    XCTAssertFalse(
      DesktopOnboardingRequirements(
        progress: progress,
        isAuthenticated: true,
        screenRecordingPermissionGranted: true,
        microphonePermissionGranted: true,
        systemAudioPermissionGranted: true,
        accessibilityPermissionGranted: false
      ).isComplete
    )
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
      .screenRecording
    )
  }

  func testCompletedLegacyUserMustRestoreMissingLiveGrants() throws {
    let legacy = """
      {"completedSteps":["value_privacy","screen_recording","audio_consent","privacy_controls","text_chat_shortcut","ready"],"completed":true}
      """.data(using: .utf8)!
    let progress = try JSONDecoder().decode(DesktopOnboardingProgress.self, from: legacy)
    XCTAssertFalse(requirements(progress: progress, isAuthenticated: true).isComplete)
    XCTAssertEqual(
      requirements(progress: progress, isAuthenticated: true).nextIncompleteStep,
      .screenRecording
    )
    XCTAssertTrue(
      requirements(
        progress: progress,
        isAuthenticated: true,
        screenGranted: true,
        microphoneGranted: true,
        systemAudioGranted: true,
        accessibilityGranted: true
      ).isComplete
    )
  }

  private func completedProgress(
    screen: DesktopPermissionDecision,
    microphone: DesktopPermissionDecision
  ) -> DesktopOnboardingProgress {
    DesktopOnboardingProgress()
      .completing(.trust)
      .decidingScreenRecording(screen)
      .decidingMicrophone(microphone)
      .decidingSystemAudio(.granted)
      .completing(.accessibility)
      .completing(.floatingBarShortcut)
      .completing(.floatingBarDemo)
  }

  private func requirements(
    progress: DesktopOnboardingProgress = DesktopOnboardingProgress(),
    isAuthenticated: Bool = false,
    crossClientSetupComplete: Bool = true,
    screenGranted: Bool = false,
    microphoneGranted: Bool = false,
    systemAudioGranted: Bool = false,
    accessibilityGranted: Bool = false
  ) -> DesktopOnboardingRequirements {
    DesktopOnboardingRequirements(
      progress: progress,
      isAuthenticated: isAuthenticated,
      crossClientSetupComplete: crossClientSetupComplete,
      screenRecordingPermissionGranted: screenGranted,
      microphonePermissionGranted: microphoneGranted,
      systemAudioPermissionGranted: systemAudioGranted,
      accessibilityPermissionGranted: accessibilityGranted
    )
  }
}
