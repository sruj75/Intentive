@testable import IntentiveDesktopCore
import XCTest

final class DesktopLoginLaunchPolicyTests: XCTestCase {
  func testProductionLoginLauncherUsesAFreshVersionedServiceIdentity() {
    XCTAssertEqual(
      DesktopLoginLauncherRegistrationContract.currentIdentity(
        bundleIdentifier: "com.heyintentive.desktop"
      ),
      DesktopLoginLauncherRegistrationIdentity(
        label: "com.heyintentive.desktop.login-launcher-v1",
        plistName: "com.heyintentive.desktop.login-launcher-v1.plist"
      )
    )
  }

  func testPreviewLoginLauncherUsesItsOwnFreshVersionedServiceIdentity() {
    XCTAssertEqual(
      DesktopLoginLauncherRegistrationContract.currentIdentity(
        bundleIdentifier: "com.heyintentive.desktop.preview"
      ),
      DesktopLoginLauncherRegistrationIdentity(
        label: "com.heyintentive.desktop.preview.login-launcher-v1",
        plistName: "com.heyintentive.desktop.preview.login-launcher-v1.plist"
      )
    )
  }

  func testLegacyLoginLauncherIdentityRemainsAvailableOnlyForTargetedRetirement() {
    XCTAssertEqual(
      DesktopLoginLauncherRegistrationContract.legacyIdentity(
        bundleIdentifier: "com.heyintentive.desktop.preview"
      ),
      DesktopLoginLauncherRegistrationIdentity(
        label: "com.heyintentive.desktop.preview.login",
        plistName: "com.heyintentive.desktop.login.plist"
      )
    )
  }

  func testCompletedBackgroundLaunchStaysMenuBarOnlyDuringAuthRestore() {
    let progress = DesktopOnboardingProgress(completed: true)

    XCTAssertEqual(
      DesktopLaunchPresentationPolicy.initialDecision(
        launchedInBackground: true,
        onboardingProgress: progress
      ),
      .menuBarOnly
    )
  }

  func testCompletedProfileSuppressesOnboardingWhileAuthenticationRestoreIsProvisional() {
    XCTAssertFalse(
      DesktopInitialOnboardingPresentationPolicy.shouldPresent(
        setupSurface: .onboarding,
        progress: DesktopOnboardingProgress(completed: true),
        isAuthenticated: false,
        screenRecordingPermissionGranted: true,
        microphonePermissionGranted: true,
        systemAudioPermissionGranted: true,
        accessibilityPermissionGranted: true
      )
    )
  }

  func testCompletedProfileReturnsToSetupWhenALivePermissionIsMissing() {
    XCTAssertTrue(
      DesktopInitialOnboardingPresentationPolicy.shouldPresent(
        setupSurface: .onboarding,
        progress: DesktopOnboardingProgress(completed: true),
        isAuthenticated: false,
        screenRecordingPermissionGranted: true,
        microphonePermissionGranted: true,
        systemAudioPermissionGranted: false,
        accessibilityPermissionGranted: true
      )
    )
  }

  func testIncompleteSignedOutProfileStillPresentsOnboarding() {
    XCTAssertTrue(
      DesktopInitialOnboardingPresentationPolicy.shouldPresent(
        setupSurface: .onboarding,
        progress: DesktopOnboardingProgress(),
        isAuthenticated: false,
        screenRecordingPermissionGranted: true,
        microphonePermissionGranted: true,
        systemAudioPermissionGranted: true,
        accessibilityPermissionGranted: true
      )
    )
  }

  func testIncompleteBackgroundLaunchPresentsSetup() {
    XCTAssertEqual(
      DesktopLaunchPresentationPolicy.initialDecision(
        launchedInBackground: true,
        onboardingProgress: DesktopOnboardingProgress()
      ),
      .presentWindow
    )
  }

  func testForegroundLaunchAlwaysPresentsTheWindow() {
    XCTAssertEqual(
      DesktopLaunchPresentationPolicy.initialDecision(
        launchedInBackground: false,
        onboardingProgress: DesktopOnboardingProgress(completed: true)
      ),
      .presentWindow
    )
  }

  func testLoginLauncherDoesNothingWhileTheMainApplicationIsAlreadyRunning() {
    XCTAssertFalse(
      DesktopLoginLauncherPolicy.shouldLaunchMainApplication(
        currentProcessID: 10,
        runningApplicationProcessIDs: [10, 20]
      )
    )
  }

  func testLoginLauncherStartsTheMainApplicationWhenItIsTheOnlyBundleProcess() {
    XCTAssertTrue(
      DesktopLoginLauncherPolicy.shouldLaunchMainApplication(
        currentProcessID: 10,
        runningApplicationProcessIDs: [10]
      )
    )
  }

  func testLoginEnrollmentRegistersBeforePersistingTheEnabledPreference() throws {
    let registrar = RecordingLaunchAtLoginRegistrar()
    var persisted: [Bool] = []

    let settings = try DesktopLaunchAtLoginEnrollment.setEnabled(
      true,
      settings: DesktopUtilitySettings(),
      registrar: registrar
    ) { persisted.append($0.launchAtLogin) }

    XCTAssertEqual(registrar.actions, ["register"])
    XCTAssertEqual(persisted, [true])
    XCTAssertTrue(settings.launchAtLogin)
  }

  func testEnabledLoginSettingReconcilesAChangedRegistrationContract() throws {
    let registrar = RecordingLaunchAtLoginRegistrar()

    try DesktopLaunchAtLoginEnrollment.reconcileRegistrationIfNeeded(
      settings: DesktopUtilitySettings(launchAtLogin: true),
      registrar: registrar
    )

    XCTAssertEqual(registrar.actions, ["refresh-registration-if-needed"])
  }

  func testDisabledLoginSettingDoesNotRegisterOrRefresh() throws {
    let registrar = RecordingLaunchAtLoginRegistrar()

    try DesktopLaunchAtLoginEnrollment.reconcileRegistrationIfNeeded(
      settings: DesktopUtilitySettings(launchAtLogin: false),
      registrar: registrar
    )

    XCTAssertEqual(registrar.actions, [])
  }

  func testMissingBackgroundTaskRecordIsRegistered() {
    XCTAssertEqual(
      DesktopLaunchAtLoginRegistrationPolicy.action(for: .notFound),
      .register
    )
  }

  func testLegacyLoginRegistrationRetiresOnlyAfterPrivacyShutdown() throws {
    let registrar = RecordingLaunchAtLoginRegistrar()
    var actions: [String] = []
    registrar.onAction = { actions.append($0) }

    _ = try DesktopLaunchAtLoginEnrollment.retireLegacyRegistration(
      afterPrivacyShutdown: { actions.append("privacy-shutdown") },
      registrar: registrar
    )

    XCTAssertEqual(actions, ["privacy-shutdown", "retire-legacy-registration"])
  }

  func testLegacyRetirementFailureDoesNotVetoCompletedPrivacyShutdown() throws {
    let registrar = RecordingLaunchAtLoginRegistrar(
      retirementError: TestError.registrationFailed
    )
    var actions: [String] = []
    registrar.onAction = { actions.append($0) }

    let retirementError = try DesktopLaunchAtLoginEnrollment.retireLegacyRegistration(
      afterPrivacyShutdown: { actions.append("privacy-shutdown") },
      registrar: registrar
    )

    XCTAssertNotNil(retirementError)
    XCTAssertEqual(actions, ["privacy-shutdown", "retire-legacy-registration"])
  }

  func testFailedLoginRegistrationDoesNotPersistAnEnabledPreference() {
    let registrar = RecordingLaunchAtLoginRegistrar(error: TestError.registrationFailed)
    var persisted: [Bool] = []

    XCTAssertThrowsError(
      try DesktopLaunchAtLoginEnrollment.setEnabled(
        true,
        settings: DesktopUtilitySettings(),
        registrar: registrar
      ) { persisted.append($0.launchAtLogin) }
    )

    XCTAssertEqual(registrar.actions, ["register"])
    XCTAssertEqual(persisted, [])
  }

  func testFinishingSetupRegistersLoginBeforePersistingCompletedProgress() throws {
    let registrar = RecordingLaunchAtLoginRegistrar()
    var actions: [String] = []
    registrar.onAction = { actions.append($0) }
    let progress = DesktopOnboardingProgress()
      .completing(.trust)
      .decidingScreenRecording(.granted)
      .decidingMicrophone(.granted)
      .decidingSystemAudio(.granted)
      .completing(.accessibility)
      .completing(.floatingBarShortcut)

    let result = try DesktopOnboardingCompletion.finish(
      progress: progress,
      requirements: {
        DesktopOnboardingRequirements(
          progress: $0,
          isAuthenticated: true,
          screenRecordingPermissionGranted: true,
          microphonePermissionGranted: true,
          systemAudioPermissionGranted: true,
          accessibilityPermissionGranted: true
        )
      },
      settings: DesktopUtilitySettings(),
      registrar: registrar,
      persistSettings: { _ in actions.append("persist-settings") },
      persistProgress: { _ in actions.append("persist-progress") }
    )

    XCTAssertEqual(actions, ["register", "persist-settings", "persist-progress"])
    XCTAssertTrue(result.settings.launchAtLogin)
    XCTAssertTrue(result.progress.completed)
    XCTAssertTrue(result.progress.isReviewed(.floatingBarDemo))
  }

  func testFinishingSetupRegistrationFailureLeavesProgressUnpersisted() {
    let registrar = RecordingLaunchAtLoginRegistrar(error: TestError.registrationFailed)
    var persistedProgress = false

    XCTAssertThrowsError(
      try DesktopOnboardingCompletion.finish(
        progress: DesktopOnboardingProgress(),
        requirements: {
          DesktopOnboardingRequirements(
            progress: $0,
            isAuthenticated: true,
            screenRecordingPermissionGranted: true,
            microphonePermissionGranted: true,
            systemAudioPermissionGranted: true,
            accessibilityPermissionGranted: true
          )
        },
        settings: DesktopUtilitySettings(),
        registrar: registrar,
        persistSettings: { _ in },
        persistProgress: { _ in persistedProgress = true }
      )
    )

    XCTAssertFalse(persistedProgress)
  }

  func testFinishingSetupProgressFailureRollsBackLoginEnrollmentAndSetting() {
    let registrar = RecordingLaunchAtLoginRegistrar()
    var persistedLaunchSettings: [Bool] = []

    XCTAssertThrowsError(
      try DesktopOnboardingCompletion.finish(
        progress: DesktopOnboardingProgress(),
        requirements: {
          DesktopOnboardingRequirements(
            progress: $0,
            isAuthenticated: true,
            screenRecordingPermissionGranted: true,
            microphonePermissionGranted: true,
            systemAudioPermissionGranted: true,
            accessibilityPermissionGranted: true
          )
        },
        settings: DesktopUtilitySettings(launchAtLogin: false),
        registrar: registrar,
        persistSettings: { persistedLaunchSettings.append($0.launchAtLogin) },
        persistProgress: { _ in throw TestError.progressPersistenceFailed }
      )
    )

    XCTAssertEqual(registrar.actions, ["register", "unregister"])
    XCTAssertEqual(persistedLaunchSettings, [true, false])
  }
}

private final class RecordingLaunchAtLoginRegistrar: DesktopLaunchAtLoginRegistering {
  private(set) var actions: [String] = []
  private let error: Error?
  private let retirementError: Error?
  var onAction: ((String) -> Void)?

  init(error: Error? = nil, retirementError: Error? = nil) {
    self.error = error
    self.retirementError = retirementError
  }

  func register() throws {
    actions.append("register")
    onAction?("register")
    if let error { throw error }
  }

  func unregister() throws {
    actions.append("unregister")
    onAction?("unregister")
    if let error { throw error }
  }

  func refreshRegistrationIfNeeded() throws {
    actions.append("refresh-registration-if-needed")
    onAction?("refresh-registration-if-needed")
    if let error { throw error }
  }

  func retireLegacyRegistration() throws {
    actions.append("retire-legacy-registration")
    onAction?("retire-legacy-registration")
    if let retirementError { throw retirementError }
  }
}

private enum TestError: Error {
  case registrationFailed
  case progressPersistenceFailed
}
