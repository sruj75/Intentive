import Foundation
@testable import IntentiveDesktopCore
import XCTest

final class ScreenMemoryCompilerTests: XCTestCase {
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

  private func temporaryDatabaseURL() throws -> URL {
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("ScreenMemoryCompilerTests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory.appendingPathComponent("screen-memory.sqlite")
  }
}

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
