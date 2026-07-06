import Foundation
import SQLite3
@testable import IntentiveDesktopCore
import XCTest

final class ScreenMemoryCompilerTests: XCTestCase {
  func testDesktopLocalProfileUsesIntentivePerUserDirectoryAndSanitizesUserID() throws {
    let base = try temporaryDirectory()
    let url = try DesktopLocalProfile.screenMemoryDatabaseURL(
      userID: "../local dev user",
      baseApplicationSupportURL: base
    )

    XCTAssertEqual(url.lastPathComponent, "screen-memory.sqlite")
    XCTAssertEqual(url.deletingLastPathComponent().lastPathComponent, "local-dev-user")
    XCTAssertEqual(url.deletingLastPathComponent().deletingLastPathComponent().lastPathComponent, "users")
    XCTAssertEqual(
      url.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().lastPathComponent,
      "Intentive"
    )
    XCTAssertFalse(url.path.contains("/Omi/"))
    XCTAssertTrue(FileManager.default.fileExists(atPath: url.deletingLastPathComponent().path))
  }

  func testDesktopLocalProfileKeepsOmiPathAsExplicitLegacyImportSourceOnly() throws {
    let base = try temporaryDirectory()

    let legacy = try DesktopLocalProfile.legacyOmiUserSupportURL(
      userID: "omi-user",
      baseApplicationSupportURL: base
    )
    let current = try DesktopLocalProfile.userSupportURL(
      userID: "omi-user",
      baseApplicationSupportURL: base
    )

    XCTAssertEqual(legacy.lastPathComponent, "omi-user")
    XCTAssertEqual(legacy.deletingLastPathComponent().deletingLastPathComponent().lastPathComponent, "Omi")
    XCTAssertEqual(current.deletingLastPathComponent().deletingLastPathComponent().lastPathComponent, "Intentive")
    XCTAssertFalse(FileManager.default.fileExists(atPath: legacy.path))
    XCTAssertTrue(FileManager.default.fileExists(atPath: current.path))
  }

  func testSQLiteScreenMemoryStoreDefaultDatabaseURLUsesLocalProfile() throws {
    let base = try temporaryDirectory()
    let url = try SQLiteScreenMemoryStore.applicationSupportURL(
      userID: "user@example.com",
      baseApplicationSupportURL: base
    )

    XCTAssertEqual(url.path, base.appendingPathComponent("Intentive/users/user-example.com/screen-memory.sqlite").path)
  }

  func testLegacyScreenMemoryImporterImportsIndexedOmiRowsIntoCurrentStore() throws {
    let base = try temporaryDirectory()
    let legacyDatabase = try createLegacyOmiDatabase(
      baseApplicationSupportURL: base,
      userID: "user@example.com",
      rows: [
        LegacyScreenshotFixture(
          id: 7,
          capturedAt: "2026-07-05T10:00:00.000Z",
          appName: "Code",
          windowTitle: "Intentive plan",
          ocrText: "handoff compiler local history",
          isIndexed: true
        ),
        LegacyScreenshotFixture(
          id: 8,
          capturedAt: "2026-07-05T10:01:00.000Z",
          appName: "Mail",
          windowTitle: "Inbox",
          ocrText: "unindexed row",
          isIndexed: false
        ),
        LegacyScreenshotFixture(
          id: 9,
          capturedAt: "2026-07-05T10:02:00.000Z",
          appName: "Safari",
          windowTitle: "Blank",
          ocrText: "   ",
          isIndexed: true
        ),
      ]
    )
    let store = try SQLiteScreenMemoryStore(databaseURL: temporaryDatabaseURL())

    let result = try LegacyScreenMemoryImporter(baseApplicationSupportURL: base)
      .importFirstAvailableSource(userID: "user@example.com", into: store, limit: 10)

    XCTAssertEqual(result.sourceDatabaseURL?.path, legacyDatabase.path)
    XCTAssertEqual(result.importedCount, 1)
    XCTAssertEqual(result.skippedCount, 2)
    let imported = try XCTUnwrap(try store.searchRecords("handoff compiler", limit: 10).first?.record)
    XCTAssertEqual(imported.id, "legacy-screen-memory-screenshot-7")
    XCTAssertEqual(imported.appName, "Code")
    XCTAssertEqual(imported.retentionClass, "screen_memory_30d")
    XCTAssertEqual(imported.sensitivityLabel, .normal)
    XCTAssertNotNil(imported.embedding)
  }

  func testLegacyScreenMemoryImporterFallsBackToRootOmiDatabase() throws {
    let base = try temporaryDirectory()
    let root = try DesktopLocalProfile.legacyOmiApplicationSupportURL(baseApplicationSupportURL: base)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    let rootDatabase = try createLegacyDatabase(
      at: root.appendingPathComponent("omi.db"),
      rows: [
        LegacyScreenshotFixture(
          id: 11,
          capturedAt: "2026-07-05T10:00:00Z",
          appName: "Notes",
          windowTitle: "Daily plan",
          ocrText: "root legacy source",
          isIndexed: true
        )
      ]
    )
    let store = InMemoryScreenMemoryStore()

    let result = try LegacyScreenMemoryImporter(baseApplicationSupportURL: base)
      .importFirstAvailableSource(userID: "missing-user", into: store, limit: 10)

    XCTAssertEqual(result.sourceDatabaseURL?.path, rootDatabase.path)
    XCTAssertEqual(result.importedCount, 1)
    XCTAssertEqual(store.search("legacy source", limit: 10).first?.record.id, "legacy-screen-memory-screenshot-11")
  }

  func testLegacyScreenMemoryImporterDoesNothingWhenNoOmiDatabaseExists() throws {
    let base = try temporaryDirectory()
    let store = InMemoryScreenMemoryStore()

    let result = try LegacyScreenMemoryImporter(baseApplicationSupportURL: base)
      .importFirstAvailableSource(userID: "user@example.com", into: store, limit: 10)

    XCTAssertNil(result.sourceDatabaseURL)
    XCTAssertEqual(result.importedCount, 0)
    XCTAssertEqual(result.skippedCount, 0)
    XCTAssertTrue(store.recent(limit: 10).isEmpty)
  }

  func testLegacyScreenMemoryImporterKeepsSecretRowsLocalButSuppressesSummaryAndEmbedding() throws {
    let base = try temporaryDirectory()
    let legacyDatabase = try createLegacyOmiDatabase(
      baseApplicationSupportURL: base,
      userID: "user@example.com",
      rows: [
        LegacyScreenshotFixture(
          id: 12,
          capturedAt: "2026-07-05 10:00:00.000",
          appName: "Terminal",
          windowTitle: "deploy",
          ocrText: "export API_KEY=abc123",
          isIndexed: true
        )
      ]
    )
    let store = InMemoryScreenMemoryStore()

    let result = try LegacyScreenMemoryImporter(baseApplicationSupportURL: base)
      .importDatabase(at: legacyDatabase, into: store, limit: 10)

    XCTAssertEqual(result.importedCount, 1)
    let imported = try XCTUnwrap(store.search("API_KEY", limit: 10).first?.record)
    XCTAssertEqual(imported.capturedAt, "2026-07-05T10:00:00.000Z")
    XCTAssertEqual(imported.summary, "Secret-like content was detected and suppressed.")
    XCTAssertEqual(imported.sensitivityLabel, .secretDetected)
    XCTAssertNil(imported.embedding)
  }

  func testLegacyScreenMemoryImporterSkipsUnchangedSQLiteSourceAfterCheckpoint() throws {
    let base = try temporaryDirectory()
    let legacyDatabase = try createLegacyOmiDatabase(
      baseApplicationSupportURL: base,
      userID: "user@example.com",
      rows: [
        LegacyScreenshotFixture(
          id: 13,
          capturedAt: "2026-07-05T10:00:00.000Z",
          appName: "Code",
          windowTitle: "Migration",
          ocrText: "one time legacy import",
          isIndexed: true
        )
      ]
    )
    let store = try SQLiteScreenMemoryStore(databaseURL: temporaryDatabaseURL())
    let importer = LegacyScreenMemoryImporter(baseApplicationSupportURL: base)

    let first = try importer.importDatabase(at: legacyDatabase, into: store, limit: 10)
    let second = try importer.importDatabase(at: legacyDatabase, into: store, limit: 10)

    XCTAssertEqual(first.importedCount, 1)
    XCTAssertFalse(first.skippedBecauseUnchanged)
    XCTAssertEqual(second.sourceDatabaseURL?.path, legacyDatabase.path)
    XCTAssertEqual(second.importedCount, 0)
    XCTAssertEqual(second.skippedCount, 0)
    XCTAssertTrue(second.skippedBecauseUnchanged)
    XCTAssertEqual(try store.searchRecords("one time legacy", limit: 10).count, 1)

    let checkpoint = try XCTUnwrap(try store.legacyImportCheckpoint(for: legacyDatabase.standardizedFileURL.path))
    XCTAssertEqual(checkpoint.importedCount, 1)
    XCTAssertEqual(checkpoint.skippedCount, 0)
  }

  func testScreenMemorySearchRanksMatchingRecords() throws {
    let store = InMemoryScreenMemoryStore()
    store.add(
      ScreenMemoryRecord(
        id: "1",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Code",
        windowTitle: "Runtime Bridge",
        summary: "Implementing runtime bridge tests",
        ocrText: "runtime bridge generation queue"
      )
    )
    store.add(
      ScreenMemoryRecord(
        id: "2",
        capturedAt: "2026-07-05T09:00:00.000Z",
        appName: "Mail",
        windowTitle: "Inbox",
        summary: "Reading unrelated mail",
        ocrText: "newsletter"
      )
    )

    let results = store.search("runtime queue", limit: 10)
    XCTAssertEqual(results.first?.record.id, "1")
    XCTAssertEqual(results.first?.rank, 2)
  }

  func testSwitchableScreenMemoryStoreRoutesThroughReplacement() {
    let first = InMemoryScreenMemoryStore()
    let second = InMemoryScreenMemoryStore()
    let store = SwitchableScreenMemoryStore(first)

    store.add(
      ScreenMemoryRecord(
        id: "first",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Code",
        windowTitle: "Anonymous",
        summary: "anonymous profile row",
        ocrText: "anonymous"
      )
    )

    store.replace(with: second)
    store.add(
      ScreenMemoryRecord(
        id: "second",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Code",
        windowTitle: "Signed in",
        summary: "signed in profile row",
        ocrText: "signed"
      )
    )

    XCTAssertEqual(store.search("signed", limit: 10).first?.record.id, "second")
    XCTAssertTrue(store.search("anonymous", limit: 10).isEmpty)
    XCTAssertEqual(first.search("anonymous", limit: 10).first?.record.id, "first")
  }

  func testSQLiteScreenMemoryPersistsRecordsAcrossReopen() throws {
    let url = try temporaryDatabaseURL()
    let embedding = try LocalEmbeddingService(dim: 8).embed("runtime bridge queue")

    do {
      let store = try SQLiteScreenMemoryStore(databaseURL: url)
      try store.addRecord(
        ScreenMemoryRecord(
          id: "persisted",
          capturedAt: "2026-07-05T10:00:00.000Z",
          appName: "Code",
          windowTitle: "Runtime Bridge",
          summary: "Implementing runtime bridge tests",
          ocrText: "runtime bridge generation queue",
          embedding: embedding
        )
      )
    }

    let reopened = try SQLiteScreenMemoryStore(databaseURL: url)
    let results = try reopened.searchRecords("runtime queue", limit: 10)
    XCTAssertEqual(results.first?.record.id, "persisted")
    XCTAssertEqual(results.first?.rank, 2)
    XCTAssertEqual(results.first?.record.embedding, embedding)
  }

  func testSQLiteScreenMemoryDeleteRemovesFTSResult() throws {
    let store = try SQLiteScreenMemoryStore(databaseURL: temporaryDatabaseURL())
    try store.addRecord(
      ScreenMemoryRecord(
        id: "delete-me",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Safari",
        windowTitle: "Intentive plan",
        summary: "Screen Memory search result",
        ocrText: "delete marker"
      )
    )

    XCTAssertEqual(try store.searchRecords("delete marker", limit: 10).count, 1)
    try store.deleteRecord(id: "delete-me")
    XCTAssertTrue(try store.searchRecords("delete marker", limit: 10).isEmpty)
  }

  func testLocalEmbeddingHasPinnedDimension() throws {
    let embedding = try LocalEmbeddingService(dim: 8).embed("Screen Memory local embedding")
    XCTAssertEqual(embedding.modelId, "intentive-local-hash-v1")
    XCTAssertEqual(embedding.vector.count, 8)
  }

  func testCompilerSuppressesSecretLikeContent() throws {
    let compiler = ContextCompiler()
    let artifacts = try compiler.compile(
      frame: CapturedFrame(
        id: "secret",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Terminal",
        windowTitle: "deploy",
        ocrText: "export API_KEY=abc123"
      )
    )

    XCTAssertEqual(artifacts.first?.sensitivityLabel, .secretDetected)
    XCTAssertEqual(artifacts.first?.summary, "Secret-like content was detected and suppressed.")
    XCTAssertNil(artifacts.first?.embedding)
  }

  func testCompilerSkipsExcludedAppsCaseInsensitively() throws {
    let compiler = ContextCompiler(
      settings: CompilerSettings(excludedApps: ["Safari", "1Password"])
    )

    let artifacts = try compiler.compile(
      frame: CapturedFrame(
        id: "excluded",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "safari",
        windowTitle: "Private workspace",
        ocrText: "local-only private content"
      )
    )

    XCTAssertTrue(artifacts.isEmpty)
  }

  func testUserDefaultsScreenMemorySettingsStorePersistsSettings() throws {
    let suiteName = "ScreenMemorySettingsStoreTests-\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
    defer { defaults.removePersistentDomain(forName: suiteName) }

    let store = UserDefaultsScreenMemorySettingsStore(defaults: defaults, key: "settings")
    let settings = CompilerSettings(
      captureEnabled: false,
      excludedApps: ["Safari", "1Password"],
      contextChangeDebounceSeconds: 3,
      sameContextMinimumSeconds: 60,
      messagingFallbackSeconds: 15
    )

    try store.save(settings)

    let loaded = store.load()
    XCTAssertFalse(loaded.captureEnabled)
    XCTAssertEqual(loaded.excludedApps, ["Safari", "1Password"])
    XCTAssertEqual(loaded.contextChangeDebounceSeconds, 3)
    XCTAssertEqual(loaded.sameContextMinimumSeconds, 60)
    XCTAssertEqual(loaded.messagingFallbackSeconds, 15)
  }

  func testPerceptionPublisherRejectsRawFrameBytes() throws {
    let runtime = RecordingRuntimeClient()
    let publisher = PerceptionPublisher(runtimeClient: runtime)
    let artifact = CompiledPerceptionArtifact(
      id: "bad",
      artifactType: .searchableScreenRecord,
      capturedAt: "2026-07-05T10:00:00.000Z",
      periodStart: "2026-07-05T10:00:00.000Z",
      periodEnd: "2026-07-05T10:00:00.000Z",
      summary: "raw bytes should not publish",
      signals: [:],
      retentionClass: "screen_memory_30d",
      sensitivityLabel: .normal,
      confidence: 1,
      localRecordRef: "local",
      embedding: nil,
      rawFrameBytes: Data([1, 2, 3])
    )

    XCTAssertThrowsError(try publisher.publish(artifact))
    XCTAssertTrue(runtime.perceptionEvents.isEmpty)
  }

  func testCaptureCoordinatorStoresAndPublishesPerception() throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let coordinator = CaptureCoordinator(
      compiler: ContextCompiler(),
      screenMemory: store,
      publisher: PerceptionPublisher(runtimeClient: runtime)
    )

    let events = try coordinator.accept(
      frame: CapturedFrame(
        id: "frame-1",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Code",
        windowTitle: "Intentive",
        ocrText: "perception event compiler"
      )
    )

    XCTAssertEqual(events.count, 1)
    XCTAssertEqual(runtime.perceptionEvents.count, 1)
    XCTAssertEqual(store.search("compiler", limit: 10).count, 1)
  }

  func testCaptureCoordinatorStoresPerceptionInSQLiteScreenMemory() throws {
    let runtime = RecordingRuntimeClient()
    let store = try SQLiteScreenMemoryStore(databaseURL: temporaryDatabaseURL())
    let coordinator = CaptureCoordinator(
      compiler: ContextCompiler(),
      screenMemory: store,
      publisher: PerceptionPublisher(runtimeClient: runtime)
    )

    _ = try coordinator.accept(
      frame: CapturedFrame(
        id: "frame-sqlite",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Code",
        windowTitle: "Intentive",
        ocrText: "durable perception event compiler"
      )
    )

    XCTAssertNil(store.lastError)
    XCTAssertEqual(runtime.perceptionEvents.count, 1)
    XCTAssertEqual(try store.searchRecords("durable compiler", limit: 10).first?.record.id, "screen-frame-sqlite")
  }

  func testCaptureCoordinatorKeepsFullOCRLocalWhilePublishingCompactSummary() throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let coordinator = CaptureCoordinator(
      compiler: ContextCompiler(),
      screenMemory: store,
      publisher: PerceptionPublisher(runtimeClient: runtime)
    )
    let fullOCR = ((0..<35).map { "word\($0)" } + ["tail-local-only-token"]).joined(separator: " ")

    _ = try coordinator.accept(
      frame: CapturedFrame(
        id: "full-ocr",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Code",
        windowTitle: "Intentive spec",
        ocrText: fullOCR
      )
    )

    let localRecord = try XCTUnwrap(store.search("tail-local-only-token", limit: 10).first?.record)
    XCTAssertEqual(localRecord.id, "screen-full-ocr")
    XCTAssertEqual(localRecord.windowTitle, "Intentive spec")
    XCTAssertEqual(localRecord.ocrText, fullOCR)
    let published = try XCTUnwrap(runtime.perceptionEvents.first)
    XCTAssertFalse(published.summary.contains("tail-local-only-token"))
  }

  func testCaptureCoordinatorCapturesFromSourceAndStripsRawFrameBytes() async throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let coordinator = CaptureCoordinator(
      compiler: ContextCompiler(),
      screenMemory: store,
      publisher: PerceptionPublisher(runtimeClient: runtime)
    )
    let source = FixedDesktopCaptureSource(
      frame: CapturedFrame(
        id: "native-frame",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Safari",
        windowTitle: "Intentive plan",
        ocrText: "Screen Memory capture source",
        rawFrameBytes: Data([1, 2, 3])
      )
    )

    let events = try await coordinator.captureOnce(from: source)

    XCTAssertEqual(events.count, 1)
    XCTAssertEqual(runtime.perceptionEvents.first?.eventId, "screen-native-frame")
    XCTAssertEqual(store.search("capture source", limit: 10).first?.record.id, "screen-native-frame")
    XCTAssertFalse(try ProtocolEventCodec.encode(events[0]).contains("raw_frame".data(using: .utf8)!))
  }

  func testCaptureCoordinatorSkipsExcludedContextBeforeReadingFrame() async throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let coordinator = CaptureCoordinator(
      compiler: ContextCompiler(settings: CompilerSettings(excludedApps: ["1Password"])),
      screenMemory: store,
      publisher: PerceptionPublisher(runtimeClient: runtime)
    )
    let source = ContextAwareCountingDesktopCaptureSource(
      context: DesktopWindowContext(appName: "1Password", windowTitle: "Vault"),
      frame: CapturedFrame(
        id: "excluded-before-capture",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "1Password",
        windowTitle: "Vault",
        ocrText: "this text should not be read"
      )
    )

    let events = try await coordinator.captureOnce(from: source)

    XCTAssertTrue(events.isEmpty)
    XCTAssertEqual(source.contextReadCount, 1)
    XCTAssertEqual(source.captureCount, 0)
    XCTAssertTrue(runtime.perceptionEvents.isEmpty)
    XCTAssertTrue(store.search("should not be read", limit: 10).isEmpty)
  }

  private func temporaryDatabaseURL() throws -> URL {
    try temporaryDirectory().appendingPathComponent("screen-memory.sqlite")
  }

  private func temporaryDirectory() throws -> URL {
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("ScreenMemoryCompilerTests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }

  private func createLegacyOmiDatabase(
    baseApplicationSupportURL: URL,
    userID: String,
    rows: [LegacyScreenshotFixture]
  ) throws -> URL {
    let legacyUserDirectory = try DesktopLocalProfile.legacyOmiUserSupportURL(
      userID: userID,
      baseApplicationSupportURL: baseApplicationSupportURL
    )
    try FileManager.default.createDirectory(at: legacyUserDirectory, withIntermediateDirectories: true)
    return try createLegacyDatabase(at: legacyUserDirectory.appendingPathComponent("omi.db"), rows: rows)
  }

  private func createLegacyDatabase(at url: URL, rows: [LegacyScreenshotFixture]) throws -> URL {
    var handle: OpaquePointer?
    guard
      sqlite3_open_v2(url.path, &handle, SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX, nil)
        == SQLITE_OK,
      let handle
    else {
      let message = handle.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown SQLite open error"
      sqlite3_close(handle)
      throw LegacyTestDatabaseError.openFailed(message)
    }
    defer { sqlite3_close(handle) }

    try executeLegacySQL(
      """
      CREATE TABLE screenshots (
        id INTEGER PRIMARY KEY,
        timestamp TEXT NOT NULL,
        appName TEXT NOT NULL,
        windowTitle TEXT,
        ocrText TEXT,
        isIndexed INTEGER NOT NULL DEFAULT 0
      )
      """,
      handle: handle
    )

    for row in rows {
      try insertLegacyScreenshot(row, handle: handle)
    }

    return url
  }

  private func executeLegacySQL(_ sql: String, handle: OpaquePointer) throws {
    var error: UnsafeMutablePointer<CChar>?
    guard sqlite3_exec(handle, sql, nil, nil, &error) == SQLITE_OK else {
      let message = error.map { String(cString: $0) } ?? String(cString: sqlite3_errmsg(handle))
      sqlite3_free(error)
      throw LegacyTestDatabaseError.execFailed(message)
    }
  }

  private func insertLegacyScreenshot(_ row: LegacyScreenshotFixture, handle: OpaquePointer) throws {
    var statement: OpaquePointer?
    guard
      sqlite3_prepare_v2(
        handle,
        """
        INSERT INTO screenshots (id, timestamp, appName, windowTitle, ocrText, isIndexed)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        -1,
        &statement,
        nil
      ) == SQLITE_OK,
      let statement
    else {
      throw LegacyTestDatabaseError.execFailed(String(cString: sqlite3_errmsg(handle)))
    }
    defer { sqlite3_finalize(statement) }

    sqlite3_bind_int64(statement, 1, row.id)
    sqlite3_bind_text(statement, 2, row.capturedAt, -1, TEST_SQLITE_TRANSIENT)
    sqlite3_bind_text(statement, 3, row.appName, -1, TEST_SQLITE_TRANSIENT)
    sqlite3_bind_text(statement, 4, row.windowTitle, -1, TEST_SQLITE_TRANSIENT)
    sqlite3_bind_text(statement, 5, row.ocrText, -1, TEST_SQLITE_TRANSIENT)
    sqlite3_bind_int(statement, 6, row.isIndexed ? 1 : 0)

    guard sqlite3_step(statement) == SQLITE_DONE else {
      throw LegacyTestDatabaseError.execFailed(String(cString: sqlite3_errmsg(handle)))
    }
  }
}

private struct LegacyScreenshotFixture {
  var id: Int64
  var capturedAt: String
  var appName: String
  var windowTitle: String
  var ocrText: String
  var isIndexed: Bool
}

private enum LegacyTestDatabaseError: Error {
  case openFailed(String)
  case execFailed(String)
}

private let TEST_SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

@MainActor
final class ScreenMemoryCaptureLoopTests: XCTestCase {
  func testCaptureTickStoresAndPublishesSourceFrame() async throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let loop = ScreenMemoryCaptureLoop(
      coordinator: CaptureCoordinator(
        compiler: ContextCompiler(),
        screenMemory: store,
        publisher: PerceptionPublisher(runtimeClient: runtime)
      ),
      source: FixedDesktopCaptureSource(
        frame: CapturedFrame(
          id: "loop-frame",
          capturedAt: "2026-07-05T10:00:00.000Z",
          appName: "Code",
          windowTitle: "Intentive",
          ocrText: "Screen Memory running capture loop"
        )
      )
    )

    let event = await loop.captureTick()

    XCTAssertEqual(event, .captured(eventCount: 1))
    XCTAssertEqual(loop.state.capturedFrameCount, 1)
    XCTAssertEqual(loop.state.publishedEventCount, 1)
    XCTAssertEqual(loop.state.failedCaptureCount, 0)
    XCTAssertEqual(runtime.perceptionEvents.count, 1)
    XCTAssertEqual(store.search("running loop", limit: 10).first?.record.id, "screen-loop-frame")
  }

  func testCaptureLoopRecordsFailureAndContinuesOnNextTick() async throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let source = FailsOnceDesktopCaptureSource(
      frame: CapturedFrame(
        id: "recovered-frame",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Safari",
        windowTitle: "Intentive plan",
        ocrText: "capture recovered"
      )
    )
    let loop = ScreenMemoryCaptureLoop(
      coordinator: CaptureCoordinator(
        compiler: ContextCompiler(),
        screenMemory: store,
        publisher: PerceptionPublisher(runtimeClient: runtime)
      ),
      source: source
    )

    let first = await loop.captureTick()
    let second = await loop.captureTick()

    XCTAssertEqual(first, .failed("transient capture failure"))
    XCTAssertEqual(second, .captured(eventCount: 1))
    XCTAssertEqual(loop.state.failedCaptureCount, 1)
    XCTAssertEqual(loop.state.capturedFrameCount, 1)
    XCTAssertNil(loop.state.lastError)
    XCTAssertEqual(runtime.perceptionEvents.first?.eventId, "screen-recovered-frame")
  }

  func testStartStopAreIdempotent() {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let loop = ScreenMemoryCaptureLoop(
      coordinator: CaptureCoordinator(
        compiler: ContextCompiler(),
        screenMemory: store,
        publisher: PerceptionPublisher(runtimeClient: runtime)
      ),
      source: FixedDesktopCaptureSource(
        frame: CapturedFrame(
          id: "loop-start",
          capturedAt: "2026-07-05T10:00:00.000Z",
          appName: "Code",
          windowTitle: "Intentive",
          ocrText: "loop start"
        )
      ),
      intervalSeconds: 30
    )

    XCTAssertTrue(loop.start())
    XCTAssertFalse(loop.start())
    XCTAssertTrue(loop.state.isRunning)

    loop.stop()

    XCTAssertFalse(loop.state.isRunning)
  }

  func testCaptureLoopSkipsWithoutReadingSourceWhenDisabled() async throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let source = CountingDesktopCaptureSource(
      frame: CapturedFrame(
        id: "disabled-frame",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Code",
        windowTitle: "Intentive",
        ocrText: "disabled capture"
      )
    )
    let loop = ScreenMemoryCaptureLoop(
      coordinator: CaptureCoordinator(
        compiler: ContextCompiler(settings: CompilerSettings(captureEnabled: false)),
        screenMemory: store,
        publisher: PerceptionPublisher(runtimeClient: runtime)
      ),
      source: source,
      settingsProvider: { CompilerSettings(captureEnabled: false) }
    )

    let event = await loop.captureTick()

    XCTAssertEqual(event, .skipped("capture disabled"))
    XCTAssertEqual(loop.state.skippedCaptureCount, 1)
    XCTAssertEqual(loop.state.capturedFrameCount, 0)
    XCTAssertEqual(source.captureCount, 0)
    XCTAssertTrue(runtime.perceptionEvents.isEmpty)
    XCTAssertTrue(store.search("disabled capture", limit: 10).isEmpty)
  }

  func testCaptureLoopSkipsWithoutReadingSourceWhenPermissionIsMissing() async throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let source = CountingDesktopCaptureSource(
      frame: CapturedFrame(
        id: "permission-frame",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Code",
        windowTitle: "Intentive",
        ocrText: "permission capture"
      )
    )
    let loop = ScreenMemoryCaptureLoop(
      coordinator: CaptureCoordinator(
        compiler: ContextCompiler(),
        screenMemory: store,
        publisher: PerceptionPublisher(runtimeClient: runtime)
      ),
      source: source,
      permissionProvider: { false }
    )

    let event = await loop.captureTick()

    XCTAssertEqual(event, .skipped("screen recording permission required"))
    XCTAssertEqual(loop.state.skippedCaptureCount, 1)
    XCTAssertEqual(loop.state.capturedFrameCount, 0)
    XCTAssertEqual(source.captureCount, 0)
    XCTAssertTrue(runtime.perceptionEvents.isEmpty)
    XCTAssertTrue(store.search("permission capture", limit: 10).isEmpty)
  }

  func testCaptureLoopCountsExcludedContextAsSkipWithoutReadingFrame() async throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let settings = CompilerSettings(excludedApps: ["1Password"])
    let source = ContextAwareCountingDesktopCaptureSource(
      context: DesktopWindowContext(appName: "1Password", windowTitle: "Vault"),
      frame: CapturedFrame(
        id: "excluded-loop-frame",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "1Password",
        windowTitle: "Vault",
        ocrText: "excluded loop capture"
      )
    )
    let loop = ScreenMemoryCaptureLoop(
      coordinator: CaptureCoordinator(
        compiler: ContextCompiler(settings: settings),
        screenMemory: store,
        publisher: PerceptionPublisher(runtimeClient: runtime)
      ),
      source: source,
      settingsProvider: { settings }
    )

    let event = await loop.captureTick()

    XCTAssertEqual(event, .skipped("current app skipped"))
    XCTAssertEqual(loop.state.skippedCaptureCount, 1)
    XCTAssertEqual(loop.state.capturedFrameCount, 0)
    XCTAssertEqual(source.contextReadCount, 1)
    XCTAssertEqual(source.captureCount, 0)
    XCTAssertTrue(runtime.perceptionEvents.isEmpty)
    XCTAssertTrue(store.search("excluded loop", limit: 10).isEmpty)
  }

  func testCaptureLoopThrottlesSameContextUntilFallbackWindow() async throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    var now = Date(timeIntervalSince1970: 0)
    let source = ContextAwareCountingDesktopCaptureSource(
      context: DesktopWindowContext(appName: "Code", windowTitle: "Intentive"),
      frame: CapturedFrame(
        id: "cadence-frame",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Code",
        windowTitle: "Intentive",
        ocrText: "cadence capture"
      )
    )
    let loop = ScreenMemoryCaptureLoop(
      coordinator: CaptureCoordinator(
        compiler: ContextCompiler(),
        screenMemory: store,
        publisher: PerceptionPublisher(runtimeClient: runtime)
      ),
      source: source,
      now: { now }
    )

    let first = await loop.captureTick()
    now = Date(timeIntervalSince1970: 3)
    let second = await loop.captureTick()
    now = Date(timeIntervalSince1970: 61)
    let third = await loop.captureTick()

    XCTAssertEqual(first, .captured(eventCount: 1))
    XCTAssertEqual(second, .skipped("same context throttled"))
    XCTAssertEqual(third, .captured(eventCount: 1))
    XCTAssertEqual(loop.state.capturedFrameCount, 2)
    XCTAssertEqual(loop.state.skippedCaptureCount, 1)
    XCTAssertEqual(source.captureCount, 2)
    XCTAssertEqual(runtime.perceptionEvents.count, 2)
  }

  func testCaptureLoopUsesShorterFallbackForMessagingApps() async throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    var now = Date(timeIntervalSince1970: 0)
    let source = ContextAwareCountingDesktopCaptureSource(
      context: DesktopWindowContext(appName: "Slack", windowTitle: "Intentive"),
      frame: CapturedFrame(
        id: "slack-cadence-frame",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Slack",
        windowTitle: "Intentive",
        ocrText: "messaging cadence capture"
      )
    )
    let loop = ScreenMemoryCaptureLoop(
      coordinator: CaptureCoordinator(
        compiler: ContextCompiler(),
        screenMemory: store,
        publisher: PerceptionPublisher(runtimeClient: runtime)
      ),
      source: source,
      now: { now }
    )

    let first = await loop.captureTick()
    now = Date(timeIntervalSince1970: 14)
    let second = await loop.captureTick()
    now = Date(timeIntervalSince1970: 16)
    let third = await loop.captureTick()

    XCTAssertEqual(first, .captured(eventCount: 1))
    XCTAssertEqual(second, .skipped("same context throttled"))
    XCTAssertEqual(third, .captured(eventCount: 1))
    XCTAssertEqual(loop.state.capturedFrameCount, 2)
    XCTAssertEqual(loop.state.skippedCaptureCount, 1)
    XCTAssertEqual(source.captureCount, 2)
  }

  func testCaptureLoopDebouncesContextChangesBeforeCapture() async throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    var now = Date(timeIntervalSince1970: 0)
    let source = ContextAwareCountingDesktopCaptureSource(
      context: DesktopWindowContext(appName: "Code", windowTitle: "Intentive"),
      frame: CapturedFrame(
        id: "debounce-code",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Code",
        windowTitle: "Intentive",
        ocrText: "initial context"
      )
    )
    let loop = ScreenMemoryCaptureLoop(
      coordinator: CaptureCoordinator(
        compiler: ContextCompiler(),
        screenMemory: store,
        publisher: PerceptionPublisher(runtimeClient: runtime)
      ),
      source: source,
      now: { now }
    )

    let first = await loop.captureTick()
    source.context = DesktopWindowContext(appName: "Safari", windowTitle: "Plan")
    source.frame = CapturedFrame(
      id: "debounce-safari",
      capturedAt: "2026-07-05T10:00:05.000Z",
      appName: "Safari",
      windowTitle: "Plan",
      ocrText: "stable context after debounce"
    )
    now = Date(timeIntervalSince1970: 1)
    let second = await loop.captureTick()
    now = Date(timeIntervalSince1970: 5)
    let third = await loop.captureTick()

    XCTAssertEqual(first, .captured(eventCount: 1))
    XCTAssertEqual(second, .skipped("context change debounce"))
    XCTAssertEqual(third, .captured(eventCount: 2))
    XCTAssertEqual(loop.state.capturedFrameCount, 2)
    XCTAssertEqual(loop.state.skippedCaptureCount, 1)
    XCTAssertEqual(source.captureCount, 2)
    XCTAssertEqual(runtime.perceptionEvents.map(\.eventId), ["screen-debounce-code", "screen-debounce-safari", "focus-debounce-safari"])
  }
}

private struct FixedDesktopCaptureSource: DesktopCaptureSource {
  var frame: CapturedFrame

  func captureFrame() async throws -> CapturedFrame {
    frame
  }
}

private enum DesktopCaptureTestError: Error, LocalizedError {
  case transient

  var errorDescription: String? {
    "transient capture failure"
  }
}

private final class FailsOnceDesktopCaptureSource: DesktopCaptureSource {
  private var hasFailed = false
  var frame: CapturedFrame

  init(frame: CapturedFrame) {
    self.frame = frame
  }

  func captureFrame() async throws -> CapturedFrame {
    if !hasFailed {
      hasFailed = true
      throw DesktopCaptureTestError.transient
    }
    return frame
  }
}

private final class CountingDesktopCaptureSource: DesktopCaptureSource {
  private(set) var captureCount = 0
  var frame: CapturedFrame

  init(frame: CapturedFrame) {
    self.frame = frame
  }

  func captureFrame() async throws -> CapturedFrame {
    captureCount += 1
    return frame
  }
}

private final class ContextAwareCountingDesktopCaptureSource: DesktopWindowContextSource {
  private(set) var contextReadCount = 0
  private(set) var captureCount = 0
  var context: DesktopWindowContext
  var frame: CapturedFrame

  init(context: DesktopWindowContext, frame: CapturedFrame) {
    self.context = context
    self.frame = frame
  }

  func activeWindowContext() throws -> DesktopWindowContext {
    contextReadCount += 1
    return context
  }

  func captureFrame() async throws -> CapturedFrame {
    captureCount += 1
    return frame
  }
}

final class RecordingRuntimeClient: RuntimeChatClient {
  private(set) var userMessages: [String] = []
  private(set) var perceptionEvents: [PerceptionEvent] = []
  private(set) var acknowledgements: [String] = []

  @discardableResult
  func sendUserMessage(_ body: String) throws -> ChatMessage {
    userMessages.append(body)
    return ChatMessage(
      id: "user-\(userMessages.count)",
      author: .user,
      body: body,
      at: Date().protocolTimestamp,
      status: .confirmed
    )
  }

  func sendPerceptionEvent(_ event: PerceptionEvent) throws {
    perceptionEvents.append(event)
  }

  func acknowledge(messageId: String) throws {
    acknowledgements.append(messageId)
  }
}
