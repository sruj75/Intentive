import Foundation
import SQLite3
@testable import IntentiveDesktopCore
import XCTest

/// Slice 06 — the durable perception outbox driver (`PerceptionPublisher`) and
/// its archive wiring. Renovated from Omi's `ScreenActivitySyncService` sync
/// loop, but over the WS Protocol with crash-safe SQLite durability, expiry
/// enforcement, and tenant-scoped tombstones.
final class PerceptionSyncTests: XCTestCase {
  private static let activeWindowId = "11111111-1111-4111-8111-111111111111"

  func testPublisherRejectsNewPerceptionWithoutAnActiveCoachingWindow() throws {
    let store = InMemoryScreenMemoryStore()
    let client = ScriptedPerceptionRuntimeClient()
    let publisher = PerceptionPublisher(
      runtimeClient: client,
      outbox: store,
      isRuntimeConnected: { true },
      windowIdProvider: { nil }
    )

    XCTAssertThrowsError(try publisher.publish(artifact(id: "windowless"))) { error in
      XCTAssertEqual(error as? ProtocolEventError, .coachingWindowRequired)
    }
    XCTAssertTrue(try store.pendingIngress(limit: 10).isEmpty)
    XCTAssertTrue(client.receivedEvents.isEmpty)
  }

  func testDurableOutboxKeepsRowsUntilAcknowledgedAcrossAnOutage() throws {
    let store = try SQLiteScreenMemoryStore(databaseURL: temporaryDatabaseURL())
    let client = ScriptedPerceptionRuntimeClient()
    client.connected = false
    var generation = 1
    let publisher = PerceptionPublisher(
      runtimeClient: client,
      outbox: store,
      isRuntimeConnected: { client.connected },
      connectionGeneration: { generation },
      windowIdProvider: { Self.activeWindowId }
    )

    // Offline: every publish durably queues, nothing is delivered.
    for index in 0..<5 {
      try publisher.publish(artifact(id: "evt-\(index)"))
    }
    XCTAssertEqual(try store.pendingPerceptionEvents(limit: 100).count, 5)
    XCTAssertTrue(client.receivedEvents.isEmpty)

    // Reconnect, but the socket drops mid-flush after two deliveries. Deletion is
    // acknowledgement-driven, so a send never removes a row — all five survive.
    client.connected = true
    client.failEventsAfter = 2
    XCTAssertThrowsError(try publisher.flushPendingIngress())
    XCTAssertEqual(client.receivedEvents.count, 2)
    XCTAssertEqual(try store.pendingPerceptionEvents(limit: 100).count, 5)

    // The drop is a new connection generation: the in-flight set resets and the
    // whole tail is redelivered (Runtime dedupes the two duplicates by ledger).
    generation = 2
    client.failEventsAfter = nil
    let flushed = try publisher.flushPendingIngress()
    XCTAssertEqual(flushed, 5)
    XCTAssertEqual(Set(client.receivedEvents.map(\.eventId)).count, 5)

    // A `runtime_ingress_ack` per event (emitted after the ledger commit) is the
    // only thing that empties the outbox.
    for index in 0..<5 {
      try publisher.acknowledge(
        RuntimeIngressAck(ingressKind: .perceptionEvent, ingressId: "evt-\(index)")
      )
    }
    XCTAssertTrue(try store.pendingPerceptionEvents(limit: 100).isEmpty)
  }

  func testDuplicateAcknowledgementIsIdempotent() throws {
    let store = InMemoryScreenMemoryStore()
    let client = ScriptedPerceptionRuntimeClient()
    let publisher = PerceptionPublisher(
      runtimeClient: client,
      outbox: store,
      isRuntimeConnected: { true },
      windowIdProvider: { Self.activeWindowId }
    )

    try publisher.publish(artifact(id: "evt-dup"))
    let ack = RuntimeIngressAck(ingressKind: .perceptionEvent, ingressId: "evt-dup")
    try publisher.acknowledge(ack)
    XCTAssertTrue(try store.pendingPerceptionEvents(limit: 10).isEmpty)
    // A redelivered/duplicate ack for an already-deleted row is a no-op.
    XCTAssertNoThrow(try publisher.acknowledge(ack))
    XCTAssertTrue(try store.pendingPerceptionEvents(limit: 10).isEmpty)
  }

  func testEventNeverRedeliversBehindItsLaterTombstone() throws {
    let store = try SQLiteScreenMemoryStore(databaseURL: temporaryDatabaseURL())
    let client = ScriptedPerceptionRuntimeClient()
    client.connected = false
    let publisher = PerceptionPublisher(
      runtimeClient: client,
      outbox: store,
      isRuntimeConnected: { client.connected },
      windowIdProvider: { Self.activeWindowId }
    )

    try publisher.publish(artifact(id: "evt-order"))
    try publisher.publishTombstone(
      PerceptionTombstone(
        tombstoneId: "tomb-order",
        reason: .manualDelete,
        eventRefs: ["evt-order"],
        emittedAt: Date().protocolTimestamp
      )
    )

    // The unified outbox preserves global enqueue order: the event drains before
    // its later tombstone, never after it.
    let kinds = try store.pendingIngress(limit: 100).map(\.kind)
    XCTAssertEqual(kinds, [.perceptionEvent, .perceptionTombstone])
  }

  func testCoachingLifecycleAndWindowBoundPerceptionShareOneDurableOrder() throws {
    let store = InMemoryScreenMemoryStore()
    let client = ScriptedPerceptionRuntimeClient()
    client.connected = false
    let windowId = "11111111-1111-4111-8111-111111111111"
    let publisher = PerceptionPublisher(
      runtimeClient: client,
      outbox: store,
      isRuntimeConnected: { client.connected },
      windowIdProvider: { windowId }
    )
    let at = "2026-07-26T08:00:00.000Z"

    try publisher.publishWindowStarted(
      CoachingWindowStarted(windowId: windowId, startedAt: at, reason: .appLaunch)
    )
    let event = try publisher.publish(artifact(id: "window-event"))
    try publisher.publishWindowEnded(
      CoachingWindowEnded(windowId: windowId, endedAt: at, reason: .pause)
    )

    XCTAssertEqual(event.windowId, windowId)
    XCTAssertEqual(
      try store.pendingIngress(limit: 10).map(\.kind),
      [.coachingWindowStarted, .perceptionEvent, .coachingWindowEnded]
    )
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
        isRuntimeConnected: { offlineClient.connected },
        windowIdProvider: { Self.activeWindowId }
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
      isRuntimeConnected: { true },
      windowIdProvider: { Self.activeWindowId }
    )
    let flushed = try publisher.flushPendingIngress()
    XCTAssertEqual(flushed, 3)
    // Redelivery does not delete: rows survive until acknowledged.
    XCTAssertEqual(try reopened.pendingPerceptionEvents(limit: 100).count, 3)
    XCTAssertEqual(Set(onlineClient.receivedEvents.map(\.eventId)).count, 3)
    for index in 0..<3 {
      try publisher.acknowledge(
        RuntimeIngressAck(ingressKind: .perceptionEvent, ingressId: "durable-\(index)")
      )
    }
    XCTAssertTrue(try reopened.pendingPerceptionEvents(limit: 100).isEmpty)
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

    let flushed = try publisher.flushPendingIngress()
    XCTAssertEqual(flushed, 1)
    XCTAssertEqual(client.receivedEvents.map(\.eventId), ["fresh"])
    // The expired record is dropped — never sent. The fresh record was sent but
    // stays pending until acknowledged.
    XCTAssertEqual(try store.pendingPerceptionEvents(limit: 100).map(\.eventId), ["fresh"])
  }

  func testExtendingRetentionRefreshesPendingOutboxPayloadAndPreventsPrematureDrop() throws {
    let store = try SQLiteScreenMemoryStore(databaseURL: temporaryDatabaseURL())
    let capturedAt = "2026-07-05T10:00:00.000Z"
    try store.enqueuePerceptionEvent(
      PerceptionEvent(
        eventId: UUID().uuidString,
        capturedAt: capturedAt,
        periodStart: capturedAt,
        periodEnd: capturedAt,
        artifactType: .searchableScreenRecord,
        summary: "pending historical record",
        sensitivityLabel: .normal,
        retentionClass: "screen_memory_7d",
        confidence: 0.9,
        expiresAt: "2026-07-12T10:00:00.000Z",
        localRecordRef: UUID().uuidString
      )
    )

    try store.applyRetentionPeriod(.thirtyDays)

    let pending = try XCTUnwrap(store.pendingPerceptionEvents(limit: 10).first)
    XCTAssertEqual(pending.retentionClass, "screen_memory_30d")
    XCTAssertEqual(pending.expiresAt, "2026-08-04T10:00:00.000Z")
    XCTAssertEqual(
      try store.dropExpiredPerceptionEvents(
        now: try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-07-20T10:00:00Z"))
      ),
      0
    )
    XCTAssertEqual(try store.pendingPerceptionEvents(limit: 10).count, 1)
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
    let flushed = try publisher.flushPendingIngress()
    XCTAssertEqual(flushed, 1)
    XCTAssertEqual(client.receivedTombstones.map(\.tombstoneId), ["t1"])
    // Still pending until the Runtime acknowledges the tombstone.
    XCTAssertEqual(try store.pendingPerceptionTombstones(limit: 10).count, 1)
    try publisher.acknowledge(RuntimeIngressAck(ingressKind: .perceptionTombstone, ingressId: "t1"))
    XCTAssertTrue(try store.pendingPerceptionTombstones(limit: 10).isEmpty)
  }

  func testPublisherBuildsTextOnlyEventWithExpiryAndOpaqueRef() throws {
    let store = InMemoryScreenMemoryStore()
    let client = ScriptedPerceptionRuntimeClient()
    let publisher = PerceptionPublisher(
      runtimeClient: client,
      outbox: store,
      isRuntimeConnected: { true },
      windowIdProvider: { Self.activeWindowId }
    )

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

  func testManualDeleteKeepsDurableIntentWhenTombstonePersistenceFails() async throws {
    let profile = try ScreenMemoryProfile(userID: "delete-recovery-user", rootURL: temporaryDirectory())
    let recordID = UUID(uuidString: "23232323-4545-6767-8989-010101010101")!
    let archive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: FixedAnalyzer(hash: 0x5, ocr: "recoverable searchable text"),
      idFactory: { recordID }
    )
    _ = try await archive.ingest(
      ScreenMemoryCaptureInput(
        userID: profile.userID,
        imageData: Data([4, 5, 6]),
        capturedAt: Date().protocolTimestamp,
        appBundleID: "com.intentive.fixture",
        appName: "Notes",
        windowTitle: "recoverable"
      )
    )
    try archive.enqueuePerceptionEvent(
      event(id: recordID.uuidString, expiresAt: "2099-01-01T00:00:00.000Z")
    )
    try executeSQL(
      at: profile.databaseURL,
      """
      CREATE TRIGGER reject_deletion_tombstone
      BEFORE INSERT ON runtime_ingress_outbox
      WHEN NEW.ingress_kind = 'perception_tombstone'
      BEGIN
        SELECT RAISE(ABORT, 'injected tombstone persistence failure');
      END
      """
    )

    do {
      _ = try await archive.delete(
        recordID: ScreenMemoryRecordID(recordID),
        confirmChunkDeletion: true
      )
      XCTFail("Expected the injected tombstone persistence failure")
    } catch {
      // Expected: the SQLite trigger rejects the tombstone insert.
    }

    // The record, its pending event, and deletion journal must remain one
    // recoverable unit when the tombstone cannot be made durable.
    XCTAssertNotNil(archive.record(ScreenMemoryRecordID(recordID)))
    XCTAssertEqual(try archive.pendingPerceptionEvents(limit: 10).map(\.eventId), [recordID.uuidString])

    try executeSQL(at: profile.databaseURL, "DROP TRIGGER reject_deletion_tombstone")
    let recovered = try await archive.prepare()

    XCTAssertEqual(recovered.recordIDs, [recordID.uuidString])
    XCTAssertNil(archive.record(ScreenMemoryRecordID(recordID)))
    XCTAssertTrue(try archive.pendingPerceptionEvents(limit: 10).isEmpty)
    let tombstone = try XCTUnwrap(archive.pendingPerceptionTombstones(limit: 10).first)
    XCTAssertEqual(tombstone.reason, .manualDelete)
    XCTAssertEqual(tombstone.eventRefs, [recordID.uuidString])
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
    let marker = SessionEndMarker(
      markerId: "clear-all-session-marker",
      sessionId: "clear-all-session",
      endedAt: "2026-07-25T00:00:00.000Z",
      reason: .userToggle
    )
    try archive.enqueueSessionEndMarker(marker)

    _ = try await archive.clearAll()

    XCTAssertTrue(try archive.pendingPerceptionEvents(limit: 10).isEmpty)
    let tombstones = try archive.pendingPerceptionTombstones(limit: 10)
    XCTAssertEqual(tombstones.count, 1)
    XCTAssertEqual(tombstones.first?.reason, .clearAll)
    XCTAssertTrue(tombstones.first?.eventRefs.isEmpty ?? false)
    XCTAssertTrue(
      try archive.pendingIngress(limit: 10).contains(.sessionEndMarker(marker))
    )
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

  private func executeSQL(at databaseURL: URL, _ sql: String) throws {
    var database: OpaquePointer?
    guard sqlite3_open(databaseURL.path, &database) == SQLITE_OK, let database else {
      defer { sqlite3_close(database) }
      throw NSError(domain: "PerceptionSyncTests.SQLite", code: 1)
    }
    defer { sqlite3_close(database) }
    var errorMessage: UnsafeMutablePointer<CChar>?
    guard sqlite3_exec(database, sql, nil, nil, &errorMessage) == SQLITE_OK else {
      let message = errorMessage.map { String(cString: $0) } ?? "unknown SQLite error"
      sqlite3_free(errorMessage)
      throw NSError(
        domain: "PerceptionSyncTests.SQLite",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: message]
      )
    }
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
  private(set) var receivedMarkers: [SessionEndMarker] = []
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

  func sendSessionEndMarker(_ marker: SessionEndMarker) throws {
    receivedMarkers.append(marker)
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
