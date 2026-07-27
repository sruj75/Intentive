import Foundation
import XCTest
@testable import IntentiveDesktopCore

final class PublicReleaseOperationsTests: XCTestCase {
  func testDownloadedUpdateDefersInstallAndFailureSurvivesRelaunch() throws {
    let driver = RecordingUpdateDriver()
    let store = InMemoryUpdateStateStore()
    let updater = PublicReleaseUpdater(driver: driver, stateStore: store)

    updater.checkForUpdates(manual: false)
    XCTAssertEqual(driver.backgroundChecks, 1)
    XCTAssertEqual(updater.snapshot.phase, .checking)

    driver.emit(.downloadStarted(version: "2.0.0"))
    XCTAssertEqual(updater.snapshot.phase, .downloading)
    driver.emit(.downloaded(version: "2.0.0"))
    XCTAssertEqual(updater.snapshot.phase, .downloadedAwaitingInstall)
    XCTAssertEqual(driver.installRequests, 0)

    updater.resumeDeferredInstall()
    XCTAssertEqual(driver.installRequests, 1)
    XCTAssertEqual(updater.snapshot.phase, .installing)

    driver.emit(.failed(message: "signature verification failed"))
    let relaunched = PublicReleaseUpdater(driver: RecordingUpdateDriver(), stateStore: store)
    XCTAssertEqual(relaunched.snapshot.phase, .failed)
    XCTAssertEqual(relaunched.snapshot.failureMessage, "signature verification failed")
    relaunched.checkForUpdates(manual: false)
    XCTAssertEqual(relaunched.snapshot.failureMessage, "signature verification failed")
  }

  func testTelemetryForwardsOnlyAllowListedOperationalProperties() {
    let sink = RecordingTelemetryClient()
    let telemetry = PrivacyFilteringTelemetryClient(
      downstream: sink,
      analyticsConsent: { true }
    )

    telemetry.track(
      TelemetryEvent(
        name: .updateCheckCompleted,
        properties: [
          "result": .string("available"),
          "duration_ms": .integer(42),
          "window_title": .string("Secret roadmap"),
          "token": .string("bearer private"),
          "source_path": .string("/Users/person/private/file.txt"),
          "reason": .string("private conversation content"),
        ]
      )
    )

    XCTAssertEqual(
      sink.events,
      [TelemetryEvent(
        name: .updateCheckCompleted,
        properties: ["result": .string("available"), "duration_ms": .integer(42)]
      )]
    )

    telemetry.captureError(
      TelemetryError(
        category: .update,
        code: .signatureFailed,
        metadata: [
          "phase": .string("verification"),
          "conversation_text": .string("private user message"),
        ]
      )
    )
    XCTAssertEqual(
      sink.errors,
      [TelemetryError(
        category: .update,
        code: .signatureFailed,
        metadata: ["phase": .string("verification")]
      )]
    )
  }

  func testProductAnalyticsHonorsConsentButErrorsRemainAvailable() {
    let sink = RecordingTelemetryClient()
    let telemetry = PrivacyFilteringTelemetryClient(
      downstream: sink,
      analyticsConsent: { false }
    )

    telemetry.track(TelemetryEvent(name: .appLaunched))
    telemetry.captureError(TelemetryError(category: .application, code: .uncleanExit))

    XCTAssertTrue(sink.events.isEmpty)
    XCTAssertEqual(sink.errors.count, 1)
  }

  func testCoachingTelemetryKeepsOnlyContentFreeOperationalDimensions() {
    let sink = RecordingTelemetryClient()
    let telemetry = PrivacyFilteringTelemetryClient(
      downstream: sink,
      analyticsConsent: { true }
    )

    telemetry.track(
      TelemetryEvent(
        name: .coachingWindowEnded,
        properties: [
          "reason": .string("pause"),
          "duration_ms": .integer(120_000),
          "window_id": .string("11111111-1111-4111-8111-111111111111"),
          "message": .string("private coaching body"),
        ]
      )
    )

    XCTAssertEqual(
      sink.events,
      [
        TelemetryEvent(
          name: .coachingWindowEnded,
          properties: [
            "reason": .string("pause"),
            "duration_ms": .integer(120_000),
          ]
        )
      ]
    )
  }

  func testDiagnosticsRotateByAgeAndBudgetThenExportAndClear() throws {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent("intentive-diagnostics-tests-\(UUID().uuidString)", isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)

    let now = Date(timeIntervalSince1970: 2_000_000)
    let store = try PersistentDiagnosticsStore(
      directory: root,
      now: { now },
      maximumAge: 14 * 24 * 60 * 60,
      maximumBytes: 220,
      maximumFileBytes: 80
    )
    let expired = root.appendingPathComponent("expired.jsonl")
    try Data(repeating: 1, count: 60).write(to: expired)
    try FileManager.default.setAttributes(
      [.modificationDate: now.addingTimeInterval(-15 * 24 * 60 * 60)],
      ofItemAtPath: expired.path
    )

    for index in 0..<5 {
      try store.append(
        DiagnosticEntry(
          timestamp: now.addingTimeInterval(Double(index)),
          level: .info,
          category: "update",
          message: "scheduled check \(index)"
        )
      )
    }
    try store.rotate()

    let retained = try store.retainedFiles()
    XCTAssertFalse(retained.contains(expired))
    let retainedBytes = try retained.reduce(0) {
      $0 + (try $1.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0)
    }
    XCTAssertLessThanOrEqual(retainedBytes, 220)

    let exportRoot = root.appendingPathComponent("exports", isDirectory: true)
    let export = try store.export(to: exportRoot)
    let exportedFiles = try FileManager.default.contentsOfDirectory(at: export, includingPropertiesForKeys: nil)
    XCTAssertEqual(exportedFiles.count, retained.count)

    try store.clear()
    XCTAssertTrue(try store.retainedFiles().isEmpty)
  }
}

private final class RecordingUpdateDriver: UpdateDriver {
  var eventHandler: ((UpdateDriverEvent) -> Void)?
  var manualChecks = 0
  var backgroundChecks = 0
  var installRequests = 0

  func checkForUpdates(manual: Bool) {
    if manual { manualChecks += 1 } else { backgroundChecks += 1 }
  }

  func installDownloadedUpdate() { installRequests += 1 }
  func emit(_ event: UpdateDriverEvent) { eventHandler?(event) }
}

private final class RecordingTelemetryClient: TelemetryClient {
  var events: [TelemetryEvent] = []
  var errors: [TelemetryError] = []

  func track(_ event: TelemetryEvent) { events.append(event) }
  func captureError(_ error: TelemetryError) { errors.append(error) }
  func flush() {}
}
