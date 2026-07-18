import XCTest

@testable import IntentiveDesktopCore

final class DesktopUtilitySettingsTests: XCTestCase {
  func testPassiveAudioEnabledDefaultsToTrue() {
    XCTAssertTrue(DesktopUtilitySettings().passiveAudioEnabled)
  }

  func testUtilityNavigationContainsOnlyApprovedDestinations() {
    XCTAssertEqual(
      DesktopUtilitySection.allCases,
      [.screenMemory, .privacy, .sensing, .account, .updates, .diagnostics]
    )
  }

  func testUtilityPreferencesPersistAcrossRelaunchAndDriveCaptureEligibility() throws {
    let store = InMemoryDesktopUtilitySettingsStore()
    var settings = DesktopUtilitySettings()
    settings.retentionDays = 14
    settings.screenCaptureEnabled = false
    settings.passiveAudioEnabled = true
    settings.floatingBarShortcut = "command+shift+space"
    settings.launchAtLogin = true
    settings.analyticsEnabled = false
    settings.selectedSection = .privacy

    try store.save(settings)
    let relaunched = DesktopUtilitySettingsCoordinator(store: store)

    XCTAssertEqual(relaunched.settings, settings)
    XCTAssertFalse(relaunched.captureShouldRun(permissionGranted: true, privateMode: false))

    settings.screenCaptureEnabled = true
    try relaunched.update(settings)
    XCTAssertTrue(relaunched.captureShouldRun(permissionGranted: true, privateMode: false))
    XCTAssertFalse(relaunched.captureShouldRun(permissionGranted: false, privateMode: false))
    XCTAssertFalse(relaunched.captureShouldRun(permissionGranted: true, privateMode: true))
  }

  func testInvalidPersistedSettingsFallBackToSafeDefaults() {
    let defaults = InMemoryDesktopUtilitySettingsStore(settings: nil)
    XCTAssertEqual(
      DesktopUtilitySettingsCoordinator(store: defaults).settings, DesktopUtilitySettings())
  }
}
