import Foundation
import XCTest

@testable import IntentiveDesktopCore

final class ScreenMemoryPrivacyAndExpiryTests: XCTestCase {
  func testOmiPasswordManagerDefaultsPersistAcrossPolicyRecreation() throws {
    let persistence = InMemoryScreenMemoryPrivacyPersistence()
    let policy = ScreenMemoryPrivacyPolicy(persistence: persistence)

    XCTAssertTrue(policy.allows(appBundleID: "com.apple.Safari", appName: "Safari"))
    XCTAssertFalse(
      policy.allows(
        appBundleID: "com.1password.1password",
        appName: "1Password"
      )
    )

    let relaunched = ScreenMemoryPrivacyPolicy(persistence: persistence)
    XCTAssertTrue(relaunched.allows(appBundleID: "com.apple.Safari", appName: "Safari"))
    XCTAssertFalse(
      relaunched.allows(appBundleID: "com.1password.1password", appName: "1Password")
    )
  }

  func testBundleIdentifierWinsAndRemovedOmiDefaultDoesNotResurrect() throws {
    let persistence = InMemoryScreenMemoryPrivacyPersistence()
    let policy = ScreenMemoryPrivacyPolicy(persistence: persistence)
    let onePassword = try XCTUnwrap(
      ScreenMemoryPrivacyPolicy.defaultExcludedApplications.first {
        $0.bundleID == "com.1password.1password"
      }
    )

    XCTAssertTrue(
      policy.allows(
        appBundleID: "com.apple.Safari",
        appName: "1Password"
      ),
      "a present, non-matching bundle ID must not fall back to a misleading display name"
    )
    XCTAssertFalse(policy.allows(appBundleID: nil, appName: " 1PASSWORD "))

    try policy.include(onePassword)
    let relaunched = ScreenMemoryPrivacyPolicy(persistence: persistence)
    XCTAssertTrue(
      relaunched.allows(
        appBundleID: "com.1password.1password",
        appName: "1Password"
      )
    )
    XCTAssertFalse(relaunched.allows(appBundleID: "com.bitwarden.desktop", appName: "Bitwarden"))
  }

  func testResetPrivacyZonesRestoresEveryCanonicalDefaultAndClearsRemovedDefaults() throws {
    let persistence = InMemoryScreenMemoryPrivacyPersistence()
    let policy = ScreenMemoryPrivacyPolicy(persistence: persistence)
    let removedDefault = try XCTUnwrap(
      ScreenMemoryPrivacyPolicy.defaultExcludedApplications.first {
        $0.bundleID == "com.bitwarden.desktop"
      }
    )

    try policy.include(removedDefault)
    try policy.exclude(
      PrivacyZoneApplication(
        bundleID: "com.tinyspeck.slackmacgap",
        displayName: "Slack"
      )
    )

    try policy.resetPrivacyZonesToDefaults()

    XCTAssertEqual(
      policy.snapshot.excludedApplications,
      ScreenMemoryPrivacyPolicy.defaultExcludedApplications
    )

    let relaunched = ScreenMemoryPrivacyPolicy(persistence: persistence)
    XCTAssertEqual(
      relaunched.snapshot.excludedApplications,
      ScreenMemoryPrivacyPolicy.defaultExcludedApplications,
      "reset must clear removed-default identities so every protected app survives relaunch"
    )
  }

  func testCapturedBundleIdentifierIsAuthoritativeOverDisplayNameOnlyExclusion() throws {
    let persistence = InMemoryScreenMemoryPrivacyPersistence()
    let policy = ScreenMemoryPrivacyPolicy(persistence: persistence)
    // A user excludes an app by display name only, with no stored bundle ID.
    try policy.exclude(PrivacyZoneApplication(displayName: "Confidential Notes"))

    // A captured app that reports a bundle identifier is judged by that
    // authoritative identifier and must not be excluded by a colliding display
    // name from a bundle-less exclusion.
    XCTAssertTrue(
      policy.allows(appBundleID: "com.example.viewer", appName: "Confidential Notes"),
      "a captured bundle ID must not fall back to a display-name-only exclusion"
    )
    // With no captured bundle identifier, the normalized display-name fallback
    // still applies even though other stored exclusions carry bundle IDs.
    XCTAssertFalse(policy.allows(appBundleID: nil, appName: " confidential NOTES "))
    XCTAssertFalse(policy.allows(appBundleID: "  ", appName: "Confidential Notes"))
  }

  func testRunningApplicationExclusionPreservesBundleIdentifierAcrossRelaunch() throws {
    let persistence = InMemoryScreenMemoryPrivacyPersistence()
    let policy = ScreenMemoryPrivacyPolicy(persistence: persistence)
    let textEdit = PrivacyZoneApplication(
      bundleID: "com.apple.TextEdit",
      displayName: "TextEdit"
    )

    try policy.exclude(textEdit)

    XCTAssertFalse(
      policy.allows(appBundleID: "com.apple.TextEdit", appName: "TextEdit"),
      "a running-app exclusion must block capture using its real bundle identifier"
    )
    let relaunched = ScreenMemoryPrivacyPolicy(persistence: persistence)
    XCTAssertTrue(relaunched.snapshot.excludedApplications.contains(textEdit))
    XCTAssertFalse(relaunched.allows(appBundleID: "com.apple.TextEdit", appName: "TextEdit"))

    try relaunched.include(textEdit)
    XCTAssertTrue(relaunched.allows(appBundleID: "com.apple.TextEdit", appName: "TextEdit"))
  }

  func testSelectedRunningApplicationPersistsBundleIdentifierAndDisplayName() throws {
    let persistence = InMemoryScreenMemoryPrivacyPersistence()
    let policy = ScreenMemoryPrivacyPolicy(persistence: persistence)
    let slack = PrivacyZoneApplication(
      bundleID: "com.tinyspeck.slackmacgap",
      displayName: "Slack"
    )

    try policy.exclude(slack)

    let relaunched = ScreenMemoryPrivacyPolicy(persistence: persistence)
    XCTAssertTrue(relaunched.snapshot.excludedApplications.contains(slack))
    XCTAssertFalse(
      relaunched.allows(
        appBundleID: "com.tinyspeck.slackmacgap",
        appName: "Slack"
      )
    )
    XCTAssertTrue(
      relaunched.allows(
        appBundleID: "com.example.slack-lookalike",
        appName: "Slack"
      ),
      "a selected app exclusion must remain scoped to its persisted bundle identifier"
    )
  }

  func testChangingRetentionUpdatesExistingRecordsAndPersistsForReopen() async throws {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent("intentive-retention-\(UUID().uuidString)", isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let profile = try ScreenMemoryProfile(userID: "retention-user", rootURL: root)
    let persistence = InMemoryScreenMemoryRetentionPersistence(initial: .thirtyDays)
    let now = Date(timeIntervalSince1970: 1_752_537_600) // 2025-07-15T00:00:00Z
    let archive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: PrivacyFixtureAnalyzer(),
      retentionPersistence: persistence,
      now: { now }
    )
    let recordID = ScreenMemoryRecordID(UUID())
    archive.add(
      ScreenMemoryRecord(
        id: recordID.value.uuidString,
        capturedAt: "2025-07-14T00:00:00.000Z",
        appName: "Xcode",
        windowTitle: "Intentive",
        summary: "Working on retention",
        ocrText: "Working on retention",
        retentionClass: ScreenMemoryRetentionPeriod.thirtyDays.retentionClass
      )
    )

    _ = try await archive.applyRetentionPolicy(.sevenDays)

    XCTAssertEqual(archive.record(recordID)?.record.retentionClass, "screen_memory_7d")
    XCTAssertEqual(archive.record(recordID)?.record.expiresAt, "2025-07-21T00:00:00.000Z")
    XCTAssertEqual(persistence.loadRetentionPeriod(), .sevenDays)
  }

  @MainActor
  func testExcludedAppsNeverCapture() async throws {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent("intentive-excluded-apps-\(UUID().uuidString)", isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let profile = try ScreenMemoryProfile(userID: "excluded-user", rootURL: root)
    let analyzer = CountingPrivacyFixtureAnalyzer()
    let archive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: analyzer,
      videoArchive: PrivacyFixtureVideoArchive(),
      retentionPersistence: InMemoryScreenMemoryRetentionPersistence(initial: .sevenDays)
    )

    let persistence = InMemoryScreenMemoryPrivacyPersistence()
    let policy = ScreenMemoryPrivacyPolicy(persistence: persistence)

    let runtime = PrivacyFixtureRuntimeClient()
    let captureSource = PrivacyFixtureCaptureSource(
      context: DesktopWindowContext(
        appBundleID: "com.1password.1password",
        appName: "1Password",
        windowTitle: "Vault"
      )
    )
    let capture = CaptureCoordinator(
      compiler: ContextCompiler(),
      screenMemory: archive,
      publisher: PerceptionPublisher(
        runtimeClient: runtime,
        outbox: archive,
        isRuntimeConnected: { false }
      ),
      archiveProvider: { archive },
      privacyPolicy: policy
    )

    // 1Password is a default Privacy Zone, so a capture over it never reads a
    // pixel, never analyzes, and never lands in the archive/outbox/runtime.
    let excludedEvents = try await capture.captureOnce(from: captureSource)
    XCTAssertEqual(excludedEvents, [])
    XCTAssertEqual(captureSource.pixelCaptureCount, 0)
    XCTAssertEqual(analyzer.recognitionCount, 0)
    XCTAssertTrue(archive.search("Vault", limit: 10).isEmpty)
    XCTAssertTrue(try archive.pendingPerceptionEvents(limit: 10).isEmpty)
    XCTAssertTrue(runtime.perceptionEvents.isEmpty)
  }

  func testExpiryDeletesWholeChunkFromEarliestFrameAndKeepsUnexpiredChunk() async throws {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent("intentive-chunk-expiry-\(UUID().uuidString)", isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let profile = try ScreenMemoryProfile(userID: "expiry-user", rootURL: root)
    let video = RetentionFixtureVideoArchive()
    let archive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: BytePrivacyFixtureAnalyzer(),
      videoArchive: video,
      retentionPersistence: InMemoryScreenMemoryRetentionPersistence(initial: .sevenDays),
      now: { Self.fixedNow }
    )

    let expired = try await archive.ingest(
      fixtureInput(profile, byte: 10, at: "2025-07-07T00:00:00.000Z", text: "expired earliest")
    )
    let newerAdjacent = try await archive.ingest(
      fixtureInput(profile, byte: 40, at: "2025-07-14T00:00:00.000Z", text: "newer adjacent")
    )
    let retained = try await archive.ingest(
      fixtureInput(profile, byte: 80, at: "2025-07-14T01:00:00.000Z", text: "retained chunk")
    )
    try await archive.finalizeActiveVideoChunk()

    let result = try await archive.applyRetentionPolicy(.sevenDays)

    let expiredID = try storedID(expired)
    let adjacentID = try storedID(newerAdjacent)
    let retainedID = try storedID(retained)
    XCTAssertEqual(Set(result.recordIDs), Set([expiredID.value.uuidString, adjacentID.value.uuidString]))
    XCTAssertNil(archive.record(expiredID))
    XCTAssertNil(archive.record(adjacentID))
    XCTAssertNotNil(archive.record(retainedID))
    XCTAssertTrue(archive.search("newer adjacent", limit: 10).isEmpty)
    XCTAssertEqual(archive.search("retained chunk", limit: 10).first?.recordID, retainedID)
    let deletedChunkCount = await video.deletedChunkCount()
    XCTAssertEqual(deletedChunkCount, 1)
  }

  func testManualChunkDeletionRequiresConfirmationAndClearAllRemovesLocalArtifacts() async throws {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent("intentive-clear-all-\(UUID().uuidString)", isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let profile = try ScreenMemoryProfile(userID: "clear-user", rootURL: root)
    let video = RetentionFixtureVideoArchive()
    let archive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: BytePrivacyFixtureAnalyzer(),
      videoArchive: video,
      retentionPersistence: InMemoryScreenMemoryRetentionPersistence(initial: .thirtyDays),
      now: { Self.fixedNow }
    )
    let first = try await archive.ingest(
      fixtureInput(profile, byte: 10, at: "2025-07-14T00:00:00.000Z", text: "delete first")
    )
    let second = try await archive.ingest(
      fixtureInput(profile, byte: 40, at: "2025-07-14T00:00:03.000Z", text: "delete second")
    )
    try await archive.finalizeActiveVideoChunk()
    let firstID = try storedID(first)
    let secondID = try storedID(second)

    let declined = try await archive.delete(recordID: firstID, confirmChunkDeletion: false)
    XCTAssertTrue(declined.requiredChunkConfirmation)
    XCTAssertNotNil(archive.record(firstID))
    XCTAssertNotNil(archive.record(secondID))

    let confirmed = try await archive.delete(recordID: firstID, confirmChunkDeletion: true)
    XCTAssertEqual(Set(confirmed.recordIDs), Set([firstID.value.uuidString, secondID.value.uuidString]))
    XCTAssertNil(archive.record(firstID))
    XCTAssertNil(archive.record(secondID))

    archive.addAudioMemory(
      AudioMemoryRecord(
        id: "audio-clear",
        capturedAt: "2025-07-14T00:00:00.000Z",
        periodStart: "2025-07-14T00:00:00.000Z",
        periodEnd: "2025-07-14T00:01:00.000Z",
        transcript: "private local transcript",
        summary: "local summary"
      )
    )
    let partial = profile.videoArchiveURL.appendingPathComponent("orphan.partial.mp4")
    try Data(repeating: 7, count: 128).write(to: partial)
    let thumbnail = profile.databaseURL.deletingLastPathComponent().appendingPathComponent("thumbnail.png")
    try Data(repeating: 8, count: 64).write(to: thumbnail)

    let before = try archive.storageReport()
    XCTAssertGreaterThan(before.videoBytes, 0)
    XCTAssertGreaterThan(before.otherArchiveBytes, 0)

    _ = try await archive.clearAll()

    XCTAssertTrue(archive.recent(limit: 10).isEmpty)
    XCTAssertTrue(archive.recentAudioMemory(limit: 10).isEmpty)
    XCTAssertTrue(try archive.pendingPerceptionEvents(limit: 10).isEmpty)
    XCTAssertFalse(FileManager.default.fileExists(atPath: partial.path))
    XCTAssertFalse(FileManager.default.fileExists(atPath: thumbnail.path))
    let after = try archive.storageReport()
    XCTAssertEqual(after.videoBytes, 0)
    XCTAssertEqual(after.otherArchiveBytes, 0)
    XCTAssertGreaterThan(after.databaseBytes, 0)
  }

  func testStandaloneRecordDeletesIndividuallyWithoutChunkConfirmation() async throws {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent("intentive-standalone-delete-\(UUID().uuidString)", isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let profile = try ScreenMemoryProfile(userID: "standalone-user", rootURL: root)
    let archive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: BytePrivacyFixtureAnalyzer(),
      retentionPersistence: InMemoryScreenMemoryRetentionPersistence(initial: .sevenDays),
      now: { Self.fixedNow }
    )
    let keepID = ScreenMemoryRecordID(UUID())
    let dropID = ScreenMemoryRecordID(UUID())
    archive.add(standaloneRecord(id: keepID, text: "keep standalone"))
    archive.add(standaloneRecord(id: dropID, text: "drop standalone"))

    let deleted = try await archive.delete(recordID: dropID, confirmChunkDeletion: false)
    XCTAssertFalse(deleted.requiredChunkConfirmation)
    XCTAssertEqual(deleted.recordIDs, [dropID.value.uuidString])
    XCTAssertNil(archive.record(dropID))
    XCTAssertNotNil(archive.record(keepID))
    XCTAssertEqual(archive.search("keep standalone", limit: 10).first?.recordID, keepID)
    XCTAssertTrue(archive.search("drop standalone", limit: 10).isEmpty)
  }

  func testDeletionJournalRetriesPhysicalChunkFailureOnReopen() async throws {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent("intentive-deletion-recovery-\(UUID().uuidString)", isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let profile = try ScreenMemoryProfile(userID: "recovery-user", rootURL: root)
    let video = RetentionFixtureVideoArchive(deleteFailures: 1)
    var archive: ScreenMemoryArchive? = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: BytePrivacyFixtureAnalyzer(),
      videoArchive: video,
      retentionPersistence: InMemoryScreenMemoryRetentionPersistence(initial: .sevenDays),
      now: { Self.fixedNow }
    )
    let outcome = try await archive!.ingest(
      fixtureInput(profile, byte: 10, at: "2025-07-07T00:00:00.000Z", text: "recover deletion")
    )
    let recordID = try storedID(outcome)
    try await archive!.finalizeActiveVideoChunk()

    do {
      _ = try await archive!.applyRetentionPolicy(.sevenDays)
      XCTFail("expected injected physical deletion failure")
    } catch RetentionFixtureVideoArchive.Failure.injectedDeletion {
      XCTAssertNotNil(archive!.record(recordID))
    }
    archive = nil

    let reopened = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: BytePrivacyFixtureAnalyzer(),
      videoArchive: video,
      retentionPersistence: InMemoryScreenMemoryRetentionPersistence(initial: .sevenDays),
      now: { Self.fixedNow }
    )
    let recovered = try await reopened.prepare()

    XCTAssertEqual(recovered.recordIDs, [recordID.value.uuidString])
    XCTAssertNil(reopened.record(recordID))
    XCTAssertTrue(reopened.search("recover deletion", limit: 10).isEmpty)
    let deletedChunkCount = await video.deletedChunkCount()
    XCTAssertEqual(deletedChunkCount, 1)
  }

  func testScheduledCleanupIsThrottledForSixHoursButRetentionChangesEnforcePromptly() async throws {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent("intentive-scheduled-expiry-\(UUID().uuidString)", isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let profile = try ScreenMemoryProfile(userID: "schedule-user", rootURL: root)
    let clock = PrivacyFixtureClock(now: Self.fixedNow)
    let archive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: BytePrivacyFixtureAnalyzer(),
      retentionPersistence: InMemoryScreenMemoryRetentionPersistence(initial: .sevenDays),
      now: { clock.now }
    )
    let firstID = ScreenMemoryRecordID(UUID())
    archive.add(expiredStandaloneRecord(id: firstID, text: "first scheduled"))

    let first = try await archive.prepare()
    XCTAssertEqual(first.recordIDs, [firstID.value.uuidString])

    let throttledID = ScreenMemoryRecordID(UUID())
    archive.add(expiredStandaloneRecord(id: throttledID, text: "throttled scheduled"))
    clock.now = Self.fixedNow.addingTimeInterval(60 * 60)
    let throttled = try await archive.runScheduledCleanup()
    XCTAssertTrue(throttled.recordIDs.isEmpty)
    XCTAssertNotNil(archive.record(throttledID))

    clock.now = Self.fixedNow.addingTimeInterval(6 * 60 * 60)
    let afterSixHours = try await archive.runScheduledCleanup()
    XCTAssertEqual(
      afterSixHours.recordIDs,
      [throttledID.value.uuidString]
    )

    let promptID = ScreenMemoryRecordID(UUID())
    archive.add(
      ScreenMemoryRecord(
        id: promptID.value.uuidString,
        capturedAt: "2025-07-01T00:00:00.000Z",
        appName: "Safari",
        windowTitle: "prompt policy",
        summary: "prompt policy",
        ocrText: "prompt policy",
        retentionClass: ScreenMemoryRetentionPeriod.thirtyDays.retentionClass,
        expiresAt: "2025-07-31T00:00:00.000Z"
      )
    )
    let prompt = try await archive.applyRetentionPolicy(.sevenDays)
    XCTAssertEqual(prompt.recordIDs, [promptID.value.uuidString])
  }

  private static let fixedNow = Date(timeIntervalSince1970: 1_752_537_600)

  private func fixtureInput(
    _ profile: ScreenMemoryProfile,
    byte: UInt8,
    at: String,
    text: String
  ) -> ScreenMemoryCaptureInput {
    ScreenMemoryCaptureInput(
      userID: profile.userID,
      imageData: Data([byte]) + Data(text.utf8),
      capturedAt: at,
      appBundleID: "com.apple.Safari",
      appName: "Safari",
      windowTitle: text
    )
  }

  private func storedID(_ outcome: ScreenMemoryIngestOutcome) throws -> ScreenMemoryRecordID {
    guard case .stored(let id) = outcome else {
      throw NSError(domain: "ScreenMemoryPrivacyAndExpiryTests", code: 1)
    }
    return id
  }

  private func expiredStandaloneRecord(
    id: ScreenMemoryRecordID,
    text: String
  ) -> ScreenMemoryRecord {
    ScreenMemoryRecord(
      id: id.value.uuidString,
      capturedAt: "2025-07-01T00:00:00.000Z",
      appName: "Safari",
      windowTitle: text,
      summary: text,
      ocrText: text,
      expiresAt: "2025-07-08T00:00:00.000Z"
    )
  }

  private func standaloneRecord(
    id: ScreenMemoryRecordID,
    text: String
  ) -> ScreenMemoryRecord {
    ScreenMemoryRecord(
      id: id.value.uuidString,
      capturedAt: "2025-07-15T00:00:00.000Z",
      appName: "Safari",
      windowTitle: text,
      summary: text,
      ocrText: text,
      expiresAt: "2025-07-22T00:00:00.000Z"
    )
  }
}

private struct PrivacyFixtureAnalyzer: ScreenMemoryImageAnalyzing {
  func perceptualHash(imageData: Data) throws -> UInt64 { 1 }
  func recognizeText(imageData: Data) async throws -> ScreenMemoryOCRResult {
    ScreenMemoryOCRResult(fullText: "fixture", blocks: [])
  }
}

private final class CountingPrivacyFixtureAnalyzer: ScreenMemoryImageAnalyzing, @unchecked Sendable {
  private(set) var recognitionCount = 0
  func perceptualHash(imageData: Data) throws -> UInt64 {
    UInt64(bitPattern: Int64(imageData.hashValue))
  }
  func recognizeText(imageData: Data) async throws -> ScreenMemoryOCRResult {
    recognitionCount += 1
    return ScreenMemoryOCRResult(fullText: String(decoding: imageData, as: UTF8.self), blocks: [])
  }
}

private struct BytePrivacyFixtureAnalyzer: ScreenMemoryImageAnalyzing {
  func perceptualHash(imageData: Data) throws -> UInt64 {
    UInt64(imageData.first ?? 0) &* 0x0101_0101_0101_0101
  }
  func recognizeText(imageData: Data) async throws -> ScreenMemoryOCRResult {
    ScreenMemoryOCRResult(fullText: String(decoding: imageData.dropFirst(), as: UTF8.self), blocks: [])
  }
}

private actor RetentionFixtureVideoArchive: ScreenMemoryVideoArchiving {
  enum Failure: Error { case injectedDeletion }
  private let firstChunk = ScreenMemoryVideoChunkID(UUID())
  private let secondChunk = ScreenMemoryVideoChunkID(UUID())
  private var appendCount = 0
  private var active: ScreenMemoryVideoChunkID?
  private var deleted = Set<ScreenMemoryVideoChunkID>()
  private var deleteFailures: Int

  init(deleteFailures: Int = 0) {
    self.deleteFailures = deleteFailures
  }

  func appendFrame(imageData: Data, capturedAt: Date) async throws -> ScreenMemoryVideoWriteOutcome {
    let location: ScreenMemoryVideoFrameLocation
    let finalized: [ScreenMemoryVideoChunkFinalization]
    if appendCount < 2 {
      location = ScreenMemoryVideoFrameLocation(chunkID: firstChunk, sampleOrdinal: appendCount)
      finalized = []
      active = firstChunk
    } else {
      location = ScreenMemoryVideoFrameLocation(chunkID: secondChunk, sampleOrdinal: appendCount - 2)
      finalized = [ScreenMemoryVideoChunkFinalization(chunkID: firstChunk, sampleCount: 2)]
      active = secondChunk
    }
    appendCount += 1
    return .accepted(location: location, finalizedChunks: finalized)
  }
  func activeChunkID() async -> ScreenMemoryVideoChunkID? { active }
  func finalizeActiveChunk() async throws -> ScreenMemoryVideoChunkFinalization? {
    guard let active else { return nil }
    self.active = nil
    let count = active == firstChunk ? min(appendCount, 2) : max(0, appendCount - 2)
    return ScreenMemoryVideoChunkFinalization(chunkID: active, sampleCount: count)
  }
  func loadFrame(at location: ScreenMemoryVideoFrameLocation) async throws -> Data { Data([1]) }
  func recoveryState(
    for chunkID: ScreenMemoryVideoChunkID,
    expectedSampleCount: Int
  ) async -> ScreenMemoryVideoChunkRecoveryState { .finalized(sampleCount: expectedSampleCount) }
  func discardChunk(_ chunkID: ScreenMemoryVideoChunkID) async { deleted.insert(chunkID) }
  func deleteChunk(_ chunkID: ScreenMemoryVideoChunkID) async throws {
    if deleteFailures > 0 {
      deleteFailures -= 1
      throw Failure.injectedDeletion
    }
    deleted.insert(chunkID)
  }
  func deleteAllMedia() async throws { deleted.formUnion([firstChunk, secondChunk]) }
  func deletedChunkCount() -> Int { deleted.count }
}

private final class PrivacyFixtureClock: @unchecked Sendable {
  var now: Date
  init(now: Date) { self.now = now }
}

private actor PrivacyFixtureVideoArchive: ScreenMemoryVideoArchiving {
  private let chunkID = ScreenMemoryVideoChunkID(UUID())
  private var active = false
  private var finalized = false

  func appendFrame(imageData: Data, capturedAt: Date) async throws -> ScreenMemoryVideoWriteOutcome {
    active = true
    return .accepted(
      location: ScreenMemoryVideoFrameLocation(chunkID: chunkID, sampleOrdinal: 0),
      finalizedChunks: []
    )
  }
  func activeChunkID() async -> ScreenMemoryVideoChunkID? { active ? chunkID : nil }
  func finalizeActiveChunk() async throws -> ScreenMemoryVideoChunkFinalization? {
    guard active else { return nil }
    active = false
    finalized = true
    return ScreenMemoryVideoChunkFinalization(chunkID: chunkID, sampleCount: 1)
  }
  func loadFrame(at location: ScreenMemoryVideoFrameLocation) async throws -> Data {
    finalized ? Data("finalized".utf8) : Data()
  }
  func recoveryState(
    for chunkID: ScreenMemoryVideoChunkID,
    expectedSampleCount: Int
  ) async -> ScreenMemoryVideoChunkRecoveryState {
    finalized ? .finalized(sampleCount: 1) : .staged
  }
  func discardChunk(_ chunkID: ScreenMemoryVideoChunkID) async {
    active = false
    finalized = false
  }
}

private final class PrivacyFixtureCaptureSource: DesktopWindowContextSource {
  let context: DesktopWindowContext
  private(set) var pixelCaptureCount = 0

  init(context: DesktopWindowContext) { self.context = context }
  func activeWindowContext() throws -> DesktopWindowContext { context }
  func captureFrame() async throws -> CapturedFrame {
    pixelCaptureCount += 1
    return CapturedFrame(
      id: UUID().uuidString,
      capturedAt: Date().protocolTimestamp,
      appBundleID: context.appBundleID,
      appName: context.appName,
      windowTitle: context.windowTitle,
      ocrText: "excluded",
      rawFrameBytes: Data("excluded".utf8)
    )
  }
}

private final class PrivacyFixtureRuntimeClient: RuntimeChatClient {
  private(set) var perceptionEvents: [PerceptionEvent] = []
  func sendUserMessage(_ body: String) throws -> ChatMessage {
    ChatMessage(id: UUID().uuidString, author: .user, body: body, at: Date().protocolTimestamp, status: .confirmed)
  }
  func sendPerceptionEvent(_ event: PerceptionEvent) throws { perceptionEvents.append(event) }
  private(set) var tombstones: [PerceptionTombstone] = []
  func sendPerceptionTombstone(_ tombstone: PerceptionTombstone) throws { tombstones.append(tombstone) }
  private(set) var markers: [SessionEndMarker] = []
  func sendSessionEndMarker(_ marker: SessionEndMarker) throws { markers.append(marker) }
  func acknowledge(messageId: String) throws {}
}
