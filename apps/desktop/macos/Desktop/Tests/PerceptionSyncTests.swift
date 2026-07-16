import Foundation
@testable import IntentiveDesktopCore
import XCTest

/// Slice 06 — the durable perception outbox driver (`PerceptionPublisher`) and
/// its archive wiring. Renovated from Omi's `ScreenActivitySyncService` sync
/// loop, but over the WS Protocol with crash-safe SQLite durability, expiry
/// enforcement, and tenant-scoped tombstones.
final class PerceptionSyncTests: XCTestCase {
  func testDurableOutboxDeliversEachEventExactlyOnceAcrossAnOutage() throws {
    let store = try SQLiteScreenMemoryStore(databaseURL: temporaryDatabaseURL())
    let client = ScriptedPerceptionRuntimeClient()
    client.connected = false
    let publisher = PerceptionPublisher(
      runtimeClient: client,
      outbox: store,
      isRuntimeConnected: { client.connected }
    )

    // Offline: every publish durably queues, nothing is delivered.
    for index in 0..<5 {
      try publisher.publish(artifact(id: "evt-\(index)"))
    }
    XCTAssertEqual(try store.pendingPerceptionEvents(limit: 100).count, 5)
    XCTAssertTrue(client.receivedEvents.isEmpty)

    // Reconnect, but the socket drops mid-flush after two deliveries.
    client.connected = true
    client.failEventsAfter = 2
    XCTAssertThrowsError(try publisher.flushPendingPerceptionEvents())
    XCTAssertEqual(client.receivedEvents.count, 2)
    XCTAssertEqual(try store.pendingPerceptionEvents(limit: 100).count, 3)

    // The drop clears; the tail is redelivered — no duplicates, no losses.
    client.failEventsAfter = nil
    let flushed = try publisher.flushPendingPerceptionEvents()
    XCTAssertEqual(flushed, 3)
    XCTAssertTrue(try store.pendingPerceptionEvents(limit: 100).isEmpty)
    let deliveredIDs = client.receivedEvents.map(\.eventId)
    XCTAssertEqual(deliveredIDs.count, 5)
    XCTAssertEqual(Set(deliveredIDs).count, 5)
  }

  func testPendingTailSurvivesRelaunchMidOutage() throws {
    let url = try temporaryDatabaseURL()
    let offlineClient = ScriptedPerceptionRuntimeClient()
    offlineClient.connected = false

    do {
      let store = try SQLiteScreenMemoryStore(databaseURL: url)
      let publisher = PerceptionPublisher(
        runtimeClient: offlineClient,
        outbox: store,
        isRuntimeConnected: { offlineClient.connected }
      )
      for index in 0..<3 {
        try publisher.publish(artifact(id: "durable-\(index)"))
      }
    }

    // A fresh store over the same file (a relaunch) sees the queued tail.
    let reopened = try SQLiteScreenMemoryStore(databaseURL: url)
    XCTAssertEqual(try reopened.pendingPerceptionEvents(limit: 100).count, 3)

    let onlineClient = ScriptedPerceptionRuntimeClient()
    let publisher = PerceptionPublisher(
      runtimeClient: onlineClient,
      outbox: reopened,
      isRuntimeConnected: { true }
    )
    let flushed = try publisher.flushPendingPerceptionEvents()
    XCTAssertEqual(flushed, 3)
    XCTAssertTrue(try reopened.pendingPerceptionEvents(limit: 100).isEmpty)
    XCTAssertEqual(Set(onlineClient.receivedEvents.map(\.eventId)).count, 3)
  }

  func testFlushDropsAlreadyExpiredUnsentRecordsWithoutSending() throws {
    let clock = Date(timeIntervalSince1970: 2_000_000_000)
    let store = InMemoryScreenMemoryStore()
    let client = ScriptedPerceptionRuntimeClient()
    let publisher = PerceptionPublisher(
      runtimeClient: client,
      outbox: store,
      isRuntimeConnected: { true },
      now: { clock }
    )
    try store.enqueuePerceptionEvent(
      event(id: "expired", expiresAt: clock.addingTimeInterval(-3600).protocolTimestamp)
    )
    try store.enqueuePerceptionEvent(
      event(id: "fresh", expiresAt: clock.addingTimeInterval(3600).protocolTimestamp)
    )

    let flushed = try publisher.flushPendingPerceptionEvents()
    XCTAssertEqual(flushed, 1)
    XCTAssertEqual(client.receivedEvents.map(\.eventId), ["fresh"])
    // The expired record is dropped — never sent, and no longer pending.
    XCTAssertTrue(try store.pendingPerceptionEvents(limit: 100).isEmpty)
  }

  func testTombstoneQueuesOfflineAndPropagatesOnReconnect() throws {
    let store = InMemoryScreenMemoryStore()
    let client = ScriptedPerceptionRuntimeClient()
    client.connected = false
    let publisher = PerceptionPublisher(
      runtimeClient: client,
      outbox: store,
      isRuntimeConnected: { client.connected }
    )

    try publisher.publishTombstone(
      PerceptionTombstone(
        tombstoneId: "t1",
        reason: .manualDelete,
        eventRefs: ["evt-1"],
        emittedAt: Date().protocolTimestamp
      )
    )
    XCTAssertEqual(try store.pendingPerceptionTombstones(limit: 10).count, 1)
    XCTAssertTrue(client.receivedTombstones.isEmpty)

    client.connected = true
    let flushed = try publisher.flushPendingPerceptionTombstones()
    XCTAssertEqual(flushed, 1)
    XCTAssertEqual(client.receivedTombstones.map(\.tombstoneId), ["t1"])
    XCTAssertTrue(try store.pendingPerceptionTombstones(limit: 10).isEmpty)
  }

  func testPublisherBuildsTextOnlyEventWithExpiryAndOpaqueRef() throws {
    let store = InMemoryScreenMemoryStore()
    let client = ScriptedPerceptionRuntimeClient()
    let publisher = PerceptionPublisher(runtimeClient: client, outbox: store, isRuntimeConnected: { true })

    let capturedAt = Date().protocolTimestamp
    let event = try publisher.publish(
      CompiledPerceptionArtifact(
        id: "rec-1",
        artifactType: .searchableScreenRecord,
        capturedAt: capturedAt,
        periodStart: capturedAt,
        periodEnd: capturedAt,
        summary: "reviewing Q3 invoices",
        signals: ["app_name": .string("Ledger"), "window_title": .string("Q3 invoices")],
        retentionClass: "screen_memory_7d",
        sensitivityLabel: .normal,
        confidence: 0.9,
        localRecordRef: "screen-memory://records/rec-1",
        embedding: nil,
        rawFrameBytes: nil
      )
    )

    XCTAssertFalse(event.expiresAt.isEmpty)
    XCTAssertEqual(event.localRecordRef, "screen-memory://records/rec-1")
    XCTAssertEqual(event.artifactType, .searchableScreenRecord)
    // The permitted representation carries no raw frame bytes / media / path fields.
    let json = try XCTUnwrap(
      JSONSerialization.jsonObject(with: try ProtocolEventCodec.encode(event)) as? [String: Any]
    )
    XCTAssertNil(json["image_data"])
    XCTAssertNil(json["media"])
    XCTAssertEqual(client.receivedEvents.map(\.eventId), ["rec-1"])
  }

  func testPublisherRejectsRawFrameBytes() {
    let publisher = PerceptionPublisher(runtimeClient: ScriptedPerceptionRuntimeClient())
    let capturedAt = Date().protocolTimestamp
    XCTAssertThrowsError(
      try publisher.publish(
        CompiledPerceptionArtifact(
          id: "leaky",
          artifactType: .searchableScreenRecord,
          capturedAt: capturedAt,
          periodStart: capturedAt,
          periodEnd: capturedAt,
          summary: "should never send bytes",
          signals: [:],
          retentionClass: "screen_memory_7d",
          sensitivityLabel: .normal,
          confidence: 0.9,
          localRecordRef: "screen-memory://records/leaky",
          embedding: nil,
          rawFrameBytes: Data([0, 1, 2])
        )
      )
    )
  }

  func testManualDeleteDropsPendingEventAndEnqueuesTenantScopedTombstone() async throws {
    let profile = try ScreenMemoryProfile(userID: "delete-user", rootURL: temporaryDirectory())
    let recordID = UUID(uuidString: "12121212-3434-5656-7878-909090909090")!
    let archive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: FixedAnalyzer(hash: 0x3, ocr: "some searchable text"),
      idFactory: { recordID }
    )
    _ = try await archive.ingest(
      ScreenMemoryCaptureInput(
        userID: profile.userID,
        imageData: Data([7, 8, 9]),
        capturedAt: Date().protocolTimestamp,
        appBundleID: "com.intentive.fixture",
        appName: "Notes",
        windowTitle: "scratch"
      )
    )
    // Seed a still-pending outbound event for the record (as the publisher would).
    try archive.enqueuePerceptionEvent(event(id: recordID.uuidString, expiresAt: "2099-01-01T00:00:00.000Z"))
    XCTAssertEqual(try archive.pendingPerceptionEvents(limit: 10).count, 1)

    _ = try await archive.delete(recordID: ScreenMemoryRecordID(recordID), confirmChunkDeletion: true)

    // Deleting drops the still-pending event and queues a tenant-scoped tombstone.
    XCTAssertTrue(try archive.pendingPerceptionEvents(limit: 10).isEmpty)
    let tombstones = try archive.pendingPerceptionTombstones(limit: 10)
    XCTAssertEqual(tombstones.count, 1)
    XCTAssertEqual(tombstones.first?.reason, .manualDelete)
    XCTAssertEqual(tombstones.first?.eventRefs, [recordID.uuidString])
  }

  func testClearAllEnqueuesClearAllTombstone() async throws {
    let profile = try ScreenMemoryProfile(userID: "clear-user", rootURL: temporaryDirectory())
    let archive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: FixedAnalyzer(hash: 0x4, ocr: "clearable content")
    )
    _ = try await archive.ingest(
      ScreenMemoryCaptureInput(
        userID: profile.userID,
        imageData: Data([1]),
        capturedAt: Date().protocolTimestamp,
        appBundleID: "com.intentive.fixture",
        appName: "App",
        windowTitle: "Window"
      )
    )
    try archive.enqueuePerceptionEvent(event(id: "any", expiresAt: "2099-01-01T00:00:00.000Z"))

    _ = try await archive.clearAll()

    XCTAssertTrue(try archive.pendingPerceptionEvents(limit: 10).isEmpty)
    let tombstones = try archive.pendingPerceptionTombstones(limit: 10)
    XCTAssertEqual(tombstones.count, 1)
    XCTAssertEqual(tombstones.first?.reason, .clearAll)
    XCTAssertTrue(tombstones.first?.eventRefs.isEmpty ?? false)
  }

  // MARK: - Helpers

  private func artifact(id: String) -> CompiledPerceptionArtifact {
    let capturedAt = Date().protocolTimestamp
    return CompiledPerceptionArtifact(
      id: id,
      artifactType: .searchableScreenRecord,
      capturedAt: capturedAt,
      periodStart: capturedAt,
      periodEnd: capturedAt,
      summary: "summary for \(id)",
      signals: ["app_name": .string("Code")],
      retentionClass: "screen_memory_30d",
      sensitivityLabel: .normal,
      confidence: 0.9,
      localRecordRef: "screen-memory://records/\(id)",
      embedding: nil,
      rawFrameBytes: nil
    )
  }

  private func event(id: String, expiresAt: String) -> PerceptionEvent {
    let capturedAt = "2026-07-05T10:00:00.000Z"
    return PerceptionEvent(
      eventId: id,
      capturedAt: capturedAt,
      periodStart: capturedAt,
      periodEnd: capturedAt,
      artifactType: .searchableScreenRecord,
      summary: "summary \(id)",
      sensitivityLabel: .normal,
      retentionClass: "screen_memory_30d",
      confidence: 0.9,
      expiresAt: expiresAt,
      localRecordRef: "screen-memory://records/\(id)"
    )
  }

  private func temporaryDirectory() throws -> URL {
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("perception-sync-tests", isDirectory: true)
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  private func temporaryDatabaseURL() throws -> URL {
    try temporaryDirectory().appendingPathComponent("intentive.db")
  }
}

private final class ScriptedPerceptionRuntimeClient: RuntimeChatClient {
  var connected = true
  var failEventsAfter: Int?
  private(set) var receivedEvents: [PerceptionEvent] = []
  private(set) var receivedTombstones: [PerceptionTombstone] = []
  private var eventSendCount = 0

  enum TransportError: Error { case dropped }

  @discardableResult
  func sendUserMessage(_ body: String) throws -> ChatMessage {
    ChatMessage(id: UUID().uuidString, author: .user, body: body, at: Date().protocolTimestamp, status: .confirmed)
  }

  func sendPerceptionEvent(_ event: PerceptionEvent) throws {
    eventSendCount += 1
    if let limit = failEventsAfter, eventSendCount > limit {
      throw TransportError.dropped
    }
    receivedEvents.append(event)
  }

  func sendPerceptionTombstone(_ tombstone: PerceptionTombstone) throws {
    receivedTombstones.append(tombstone)
  }

  func acknowledge(messageId: String) throws {}
}

private struct FixedAnalyzer: ScreenMemoryImageAnalyzing {
  let hash: UInt64
  let ocr: String

  func perceptualHash(imageData: Data) throws -> UInt64 { hash }

  func recognizeText(imageData: Data) async throws -> ScreenMemoryOCRResult {
    ScreenMemoryOCRResult(fullText: ocr, blocks: [])
  }
}
