import XCTest

@testable import IntentiveDesktopCore

final class DesktopUtilitySettingsTests: XCTestCase {
  func testPassiveAudioEnabledDefaultsToTrue() {
    XCTAssertTrue(DesktopUtilitySettings().passiveAudioEnabled)
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
