import XCTest

@testable import IntentiveDesktopCore

final class DesktopUtilitySettingsTests: XCTestCase {
  func testFloatingBarShortcutDefaultsToCommandShiftReturn() {
    XCTAssertEqual(DesktopUtilitySettings().floatingBarShortcut, "command+shift+return")
  }

  func testLegacyCommandODefaultMigratesWithoutOverridingCustomShortcut() throws {
    let legacy = Data(#"{"floatingBarShortcut":"command+o"}"#.utf8)
    let custom = Data(#"{"floatingBarShortcut":"custom:49:768:⌘,⇧,Space"}"#.utf8)

    XCTAssertEqual(
      try JSONDecoder().decode(DesktopUtilitySettings.self, from: legacy).floatingBarShortcut,
      "command+shift+return"
    )
    XCTAssertEqual(
      try JSONDecoder().decode(DesktopUtilitySettings.self, from: custom).floatingBarShortcut,
      "custom:49:768:⌘,⇧,Space"
    )
  }

  func testLegacySingleModifierPresetsMigrateToSafeDefault() throws {
    for preset in ["command+return", "command+j", "option+space"] {
      let encoded = try JSONSerialization.data(
        withJSONObject: ["floatingBarShortcut": preset]
      )
      XCTAssertEqual(
        try JSONDecoder().decode(DesktopUtilitySettings.self, from: encoded)
          .floatingBarShortcut,
        "command+shift+return"
      )
    }
  }

  func testPassiveAudioEnabledDefaultsToTrue() {
    XCTAssertTrue(DesktopUtilitySettings().passiveAudioEnabled)
  }

  func testProductAnalyticsRequiresExplicitOptInForNewProfiles() {
    XCTAssertFalse(DesktopUtilitySettings().analyticsEnabled)
  }

  func testLegacySettingsWithoutAnalyticsConsentRemainOptedOut() throws {
    let legacy = Data(#"{"retentionDays":14,"screenCaptureEnabled":true}"#.utf8)

    let settings = try JSONDecoder().decode(DesktopUtilitySettings.self, from: legacy)

    XCTAssertFalse(settings.analyticsEnabled)
  }

  func testLegacyImplicitAnalyticsDefaultMigratesToOptedOut() throws {
    let legacy = Data(#"{"analyticsEnabled":true}"#.utf8)

    let settings = try JSONDecoder().decode(DesktopUtilitySettings.self, from: legacy)

    XCTAssertFalse(settings.analyticsEnabled)
  }

  func testExplicitAnalyticsConsentSurvivesPersistence() throws {
    var settings = DesktopUtilitySettings()
    settings.analyticsEnabled = true

    let encoded = try JSONEncoder().encode(settings)
    let decoded = try JSONDecoder().decode(
      DesktopUtilitySettings.self,
      from: encoded
    )

    XCTAssertTrue(decoded.analyticsEnabled)
    let object = try XCTUnwrap(
      JSONSerialization.jsonObject(with: encoded) as? [String: Any]
    )
    XCTAssertEqual(object["analyticsConsentVersion"] as? Int, 1)
  }

  func testUtilityNavigationContainsOnlyApprovedDestinations() {
    XCTAssertEqual(
      DesktopUtilitySection.allCases,
      [.general, .rewind, .privacy, .about]
    )
  }

  func testUtilityPreferencesPersistAcrossRelaunchAndDriveCaptureEligibility() throws {
    let store = InMemoryDesktopUtilitySettingsStore()
    var settings = DesktopUtilitySettings()
    settings.retentionDays = 14
    settings.screenCaptureEnabled = false
    settings.passiveAudioEnabled = true
    settings.systemAudioMode = .always
    settings.notificationsEnabled = true
    settings.storeRecordings = false
    settings.floatingBarShortcut = "command+shift+space"
    settings.launchAtLogin = true
    settings.analyticsEnabled = false
    settings.automaticallyChecksForUpdates = false
    settings.automaticallyDownloadsUpdates = true
    settings.selectedSection = .privacy

    try store.save(settings)
    let relaunched = DesktopUtilitySettingsCoordinator(store: store)

    XCTAssertEqual(relaunched.settings, settings)
    XCTAssertFalse(relaunched.captureShouldRun(permissionGranted: true))

    settings.screenCaptureEnabled = true
    try relaunched.update(settings)
    XCTAssertTrue(relaunched.captureShouldRun(permissionGranted: true))
    XCTAssertFalse(relaunched.captureShouldRun(permissionGranted: false))
  }

  func testInvalidPersistedSettingsFallBackToSafeDefaults() {
    let defaults = InMemoryDesktopUtilitySettingsStore(settings: nil)
    XCTAssertEqual(
      DesktopUtilitySettingsCoordinator(store: defaults).settings, DesktopUtilitySettings())
  }

  func testStoreRecordingsOffStopsOnlyFutureAudioWritesAndPreservesExisting() {
    let underlying = RecordingAudioMemoryStore()
    var enabled = true
    let gated = ConditionalAudioMemoryStore(store: underlying) { enabled }
    let existing = audioRecord(id: "existing")
    let future = audioRecord(id: "future")

    gated.addAudioMemory(existing)
    enabled = false
    gated.addAudioMemory(future)

    XCTAssertEqual(gated.recentAudioMemory(limit: 10), [existing])
  }

  func testPrivateCloudSyncCannotBeEnabledInV1() {
    XCTAssertFalse(DesktopUtilitySettings(privateCloudSyncEnabled: true).privateCloudSyncEnabled)
  }

  private func audioRecord(id: String) -> AudioMemoryRecord {
    AudioMemoryRecord(
      id: id,
      capturedAt: "2026-07-19T00:00:00Z",
      periodStart: "2026-07-19T00:00:00Z",
      periodEnd: "2026-07-19T00:00:01Z",
      transcript: id,
      summary: id
    )
  }
}

private final class RecordingAudioMemoryStore: AudioMemoryStore {
  var records: [AudioMemoryRecord] = []
  func addAudioMemory(_ record: AudioMemoryRecord) { records.append(record) }
  func recentAudioMemory(limit: Int) -> [AudioMemoryRecord] { Array(records.prefix(limit)) }
}
