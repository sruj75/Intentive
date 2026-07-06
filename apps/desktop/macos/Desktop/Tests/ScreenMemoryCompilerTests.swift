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

  private func temporaryDatabaseURL() throws -> URL {
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("ScreenMemoryCompilerTests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory.appendingPathComponent("screen-memory.sqlite")
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
