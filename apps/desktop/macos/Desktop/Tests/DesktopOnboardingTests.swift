import Foundation
import IntentiveDesktopCore
import XCTest

final class DesktopOnboardingTests: XCTestCase {
  func testOnboardingCompletionRequiresAllReviewedStepsAndLivePermissions() {
    let reviewed = DesktopOnboardingStep.allCases.reduce(DesktopOnboardingProgress()) { progress, step in
      progress.completing(step)
    }

    XCTAssertFalse(
      DesktopOnboardingRequirements(
        progress: reviewed,
        screenRecordingPermissionGranted: false,
        accessibilityPermissionGranted: true,
        microphonePermissionGranted: true
      ).isComplete
    )
    XCTAssertFalse(
      DesktopOnboardingRequirements(
        progress: reviewed,
        screenRecordingPermissionGranted: true,
        accessibilityPermissionGranted: false,
        microphonePermissionGranted: true
      ).isComplete
    )
    XCTAssertFalse(
      DesktopOnboardingRequirements(
        progress: reviewed,
        screenRecordingPermissionGranted: true,
        accessibilityPermissionGranted: true,
        microphonePermissionGranted: false
      ).isComplete
    )
    XCTAssertTrue(
      DesktopOnboardingRequirements(
        progress: reviewed,
        screenRecordingPermissionGranted: true,
        accessibilityPermissionGranted: true,
        microphonePermissionGranted: true
      ).isComplete
    )
  }

  func testNextIncompleteStepFollowsTrustPermissionNotificationFloatingBarVoiceOrder() {
    var progress = DesktopOnboardingProgress()
    var requirements = DesktopOnboardingRequirements(
      progress: progress,
      screenRecordingPermissionGranted: true,
      accessibilityPermissionGranted: true,
      microphonePermissionGranted: true
    )
    XCTAssertEqual(requirements.nextIncompleteStep, .trustPrimer)

    progress = progress.completing(.trustPrimer)
    requirements = DesktopOnboardingRequirements(
      progress: progress,
      screenRecordingPermissionGranted: true,
      accessibilityPermissionGranted: true,
      microphonePermissionGranted: true
    )
    XCTAssertEqual(requirements.nextIncompleteStep, .permissions)

    progress = progress
      .completing(.permissions)
      .completing(.notificationPreview)
      .completing(.floatingBarShortcut)
      .completing(.floatingBarDemo)
    requirements = DesktopOnboardingRequirements(
      progress: progress,
      screenRecordingPermissionGranted: true,
      accessibilityPermissionGranted: true,
      microphonePermissionGranted: true
    )
    XCTAssertEqual(requirements.nextIncompleteStep, .voiceShortcut)

    progress = progress.completing(.voiceShortcut)
    requirements = DesktopOnboardingRequirements(
      progress: progress,
      screenRecordingPermissionGranted: true,
      accessibilityPermissionGranted: true,
      microphonePermissionGranted: true
    )
    XCTAssertEqual(requirements.nextIncompleteStep, .voiceDemo)

    progress = progress.completing(.voiceDemo)
    requirements = DesktopOnboardingRequirements(
      progress: progress,
      screenRecordingPermissionGranted: true,
      accessibilityPermissionGranted: true,
      microphonePermissionGranted: true
    )
    XCTAssertEqual(requirements.nextIncompleteStep, .ambientAudioConsent)
  }

  func testUserDefaultsOnboardingStorePersistsProgress() throws {
    let suiteName = "DesktopOnboardingTests-\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
    defer { defaults.removePersistentDomain(forName: suiteName) }

    let store = UserDefaultsDesktopOnboardingProgressStore(defaults: defaults, key: "progress")
    let progress = DesktopOnboardingProgress()
      .completing(.trustPrimer)
      .completing(.permissions)

    try store.save(progress)

    XCTAssertEqual(store.load(), progress)
  }
}
