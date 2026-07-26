import Foundation
import SQLite3

public struct ScreenMemoryRecord: Codable, Equatable, Identifiable, Sendable {
  public var id: String
  public var capturedAt: String
  public var appBundleID: String
  public var appName: String
  public var windowTitle: String
  public var summary: String
  public var ocrText: String
  public var ocrBlocks: [ScreenMemoryOCRBlock]
  public var perceptualHash: UInt64?
  public var retentionClass: String
  public var expiresAt: String?
  public var sensitivityLabel: SensitivityLabel
  public var embedding: PerceptionEmbeddingRef?

  public init(
    id: String,
    capturedAt: String,
    appBundleID: String = "",
    appName: String,
    windowTitle: String,
    summary: String,
    ocrText: String,
    ocrBlocks: [ScreenMemoryOCRBlock] = [],
    perceptualHash: UInt64? = nil,
    retentionClass: String = "screen_memory_7d",
    expiresAt: String? = nil,
    sensitivityLabel: SensitivityLabel = .normal,
    embedding: PerceptionEmbeddingRef? = nil
  ) {
    self.id = id
    self.capturedAt = capturedAt
    self.appBundleID = appBundleID
    self.appName = appName
    self.windowTitle = windowTitle
    self.summary = summary
    self.ocrText = ocrText
    self.ocrBlocks = ocrBlocks
    self.perceptualHash = perceptualHash
    self.retentionClass = retentionClass
    self.expiresAt = expiresAt
    self.sensitivityLabel = sensitivityLabel
    self.embedding = embedding
  }
}

public struct ScreenMemorySearchResult: Equatable, Sendable {
  public var record: ScreenMemoryRecord
  public var rank: Int

  public var recordID: ScreenMemoryRecordID? {
    UUID(uuidString: record.id).map(ScreenMemoryRecordID.init)
  }

  public var capturedAt: String { record.capturedAt }
  public var appBundleID: String { record.appBundleID }
  public var appName: String { record.appName }
  public var windowTitle: String { record.windowTitle }
  public var ocrText: String { record.ocrText }
  public var ocrBlocks: [ScreenMemoryOCRBlock] { record.ocrBlocks }
}

public struct AudioMemoryRecord: Codable, Equatable, Identifiable, Sendable {
  public var id: String
  public var capturedAt: String
  public var periodStart: String
  public var periodEnd: String
  public var transcript: String
  public var summary: String
  public var retentionClass: String
  public var expiresAt: String?
  public var sensitivityLabel: SensitivityLabel
  public var embedding: PerceptionEmbeddingRef?

  public init(
    id: String,
    capturedAt: String,
    periodStart: String,
    periodEnd: String,
    transcript: String,
    summary: String,
    retentionClass: String = "audio_memory_7d",
    expiresAt: String? = nil,
    sensitivityLabel: SensitivityLabel = .normal,
    embedding: PerceptionEmbeddingRef? = nil
  ) {
    self.id = id
    self.capturedAt = capturedAt
    self.periodStart = periodStart
    self.periodEnd = periodEnd
    self.transcript = transcript
    self.summary = summary
    self.retentionClass = retentionClass
    self.expiresAt = expiresAt
    self.sensitivityLabel = sensitivityLabel
    self.embedding = embedding
  }
}

public protocol ScreenMemoryStore: AnyObject {
  func add(_ record: ScreenMemoryRecord)
  func recent(limit: Int) -> [ScreenMemoryRecord]
  func search(_ query: String, limit: Int) -> [ScreenMemorySearchResult]
  func delete(id: String)
}

public protocol AudioMemoryStore: AnyObject {
  func addAudioMemory(_ record: AudioMemoryRecord)
  func recentAudioMemory(limit: Int) -> [AudioMemoryRecord]
}

/// One durable, ordered outbox for every stateful ingress the Runtime
/// acknowledges (`perception_event`, `perception_tombstone`,
/// `session_end_marker`). Renovated from Omi's WAL reconcile: an item is
/// enqueued, sent when connected, and removed only when the Runtime confirms the
/// commit with a `runtime_ingress_ack` — never merely because the socket
/// accepted the send. A single global enqueue order (one table keyed by
/// `(ingress_kind, ingress_id)`) guarantees an event can never be replayed
/// behind its own later tombstone.
public protocol PerceptionEventOutbox: AnyObject {
  func enqueuePerceptionEvent(_ event: PerceptionEvent) throws
  func enqueuePerceptionTombstone(_ tombstone: PerceptionTombstone) throws
  func enqueueSessionEndMarker(_ marker: SessionEndMarker) throws
  func enqueueCoachingWindowStarted(_ event: CoachingWindowStarted) throws
  func enqueueCoachingWindowEnded(_ event: CoachingWindowEnded) throws
  /// Pending items in durable enqueue order across all kinds, for redelivery.
  func pendingIngress(limit: Int) throws -> [RuntimeIngressOutboxItem]
  /// Remove one acknowledged item. Idempotent on redelivery.
  func removeIngress(kind: RuntimeIngressKind, ingressId: String) throws
  /// Drop already-expired unsent perception events. Returns the count dropped.
  @discardableResult
  func dropExpiredPerceptionEvents(now: Date) throws -> Int
}

/// A decoded durable-ingress item read back from the outbox, tagged with the
/// stable `(kind, ingressId)` the Runtime acknowledges.
public enum RuntimeIngressOutboxItem: Equatable, Sendable {
  case perceptionEvent(PerceptionEvent)
  case perceptionTombstone(PerceptionTombstone)
  case sessionEndMarker(SessionEndMarker)
  case coachingWindowStarted(CoachingWindowStarted)
  case coachingWindowEnded(CoachingWindowEnded)

  public var kind: RuntimeIngressKind {
    switch self {
    case .perceptionEvent: return .perceptionEvent
    case .perceptionTombstone: return .perceptionTombstone
    case .sessionEndMarker: return .sessionEndMarker
    case .coachingWindowStarted: return .coachingWindowStarted
    case .coachingWindowEnded: return .coachingWindowEnded
    }
  }

  public var ingressId: String {
    switch self {
    case .perceptionEvent(let event): return event.eventId
    case .perceptionTombstone(let tombstone): return tombstone.tombstoneId
    case .sessionEndMarker(let marker): return marker.markerId
    case .coachingWindowStarted(let event): return event.windowId
    case .coachingWindowEnded(let event): return event.windowId
    }
  }

  /// Authoritative expiry, present only for perception events.
  public var expiresAt: String? {
    if case .perceptionEvent(let event) = self { return event.expiresAt }
    return nil
  }
}

extension PerceptionEventOutbox {
  /// Pending perception events in durable enqueue order — a typed filter over
  /// the unified outbox. `limit` bounds the underlying read.
  public func pendingPerceptionEvents(limit: Int) throws -> [PerceptionEvent] {
    try pendingIngress(limit: limit).compactMap {
      if case .perceptionEvent(let event) = $0 { return event }
      return nil
    }
  }

  /// Pending tombstones in durable enqueue order — a typed filter over the
  /// unified outbox.
  public func pendingPerceptionTombstones(limit: Int) throws -> [PerceptionTombstone] {
    try pendingIngress(limit: limit).compactMap {
      if case .perceptionTombstone(let tombstone) = $0 { return tombstone }
      return nil
    }
  }

  public func removePerceptionEvent(eventId: String) throws {
    try removeIngress(kind: .perceptionEvent, ingressId: eventId)
  }

  public func removePerceptionTombstone(tombstoneId: String) throws {
    try removeIngress(kind: .perceptionTombstone, ingressId: tombstoneId)
  }
}

public final class InMemoryScreenMemoryStore: ScreenMemoryStore, AudioMemoryStore, PerceptionEventOutbox {
  private var records: [ScreenMemoryRecord] = []
  private var audioRecords: [AudioMemoryRecord] = []
  private var ingressOutbox: [RuntimeIngressOutboxItem] = []

  public init(records: [ScreenMemoryRecord] = []) {
    self.records = records
  }

  public func add(_ record: ScreenMemoryRecord) {
    if let index = records.firstIndex(where: { $0.id == record.id }) {
      records[index] = record
    } else {
      records.append(record)
    }
  }

  public func recent(limit: Int) -> [ScreenMemoryRecord] {
    records
      .sorted { $0.capturedAt > $1.capturedAt }
      .prefix(max(0, limit))
      .map { $0 }
  }

  public func search(_ query: String, limit: Int) -> [ScreenMemorySearchResult] {
    let terms = query
      .lowercased()
      .split(whereSeparator: \.isWhitespace)
      .map(String.init)

    guard !terms.isEmpty else {
      return recent(limit: limit).map { ScreenMemorySearchResult(record: $0, rank: 0) }
    }

    return records
      .compactMap { record -> ScreenMemorySearchResult? in
        let haystack = "\(record.appName) \(record.windowTitle) \(record.summary) \(record.ocrText)"
          .lowercased()
        let rank = terms.reduce(0) { partial, term in
          partial + (haystack.contains(term) ? 1 : 0)
        }
        guard rank > 0 else { return nil }
        return ScreenMemorySearchResult(record: record, rank: rank)
      }
      .sorted {
        if $0.rank == $1.rank {
          return $0.record.capturedAt > $1.record.capturedAt
        }
        return $0.rank > $1.rank
      }
      .prefix(max(0, limit))
      .map { $0 }
  }

  public func delete(id: String) {
    records.removeAll { $0.id == id }
  }

  public func addAudioMemory(_ record: AudioMemoryRecord) {
    if let index = audioRecords.firstIndex(where: { $0.id == record.id }) {
      audioRecords[index] = record
    } else {
      audioRecords.append(record)
    }
  }

  public func recentAudioMemory(limit: Int) -> [AudioMemoryRecord] {
    audioRecords
      .sorted { $0.capturedAt > $1.capturedAt }
      .prefix(max(0, limit))
      .map { $0 }
  }

  public func enqueuePerceptionEvent(_ event: PerceptionEvent) throws {
    upsertIngress(.perceptionEvent(event))
  }

  public func enqueuePerceptionTombstone(_ tombstone: PerceptionTombstone) throws {
    upsertIngress(.perceptionTombstone(tombstone))
  }

  public func enqueueSessionEndMarker(_ marker: SessionEndMarker) throws {
    upsertIngress(.sessionEndMarker(marker))
  }

  public func enqueueCoachingWindowStarted(_ event: CoachingWindowStarted) throws {
    upsertIngress(.coachingWindowStarted(event))
  }

  public func enqueueCoachingWindowEnded(_ event: CoachingWindowEnded) throws {
    upsertIngress(.coachingWindowEnded(event))
  }

  public func pendingIngress(limit: Int) throws -> [RuntimeIngressOutboxItem] {
    Array(ingressOutbox.prefix(max(0, limit)))
  }

  public func removeIngress(kind: RuntimeIngressKind, ingressId: String) throws {
    ingressOutbox.removeAll { $0.kind == kind && $0.ingressId == ingressId }
  }

  @discardableResult
  public func dropExpiredPerceptionEvents(now: Date) throws -> Int {
    let before = ingressOutbox.count
    ingressOutbox.removeAll { item in
      guard case .perceptionEvent(let event) = item,
            let expiry = ISO8601DateFormatter.intentiveProtocol.date(from: event.expiresAt)
      else { return false }
      return expiry <= now
    }
    return before - ingressOutbox.count
  }

  /// Upsert preserving enqueue position: a re-enqueue of the same
  /// `(kind, ingressId)` updates in place so a later item never jumps ahead.
  private func upsertIngress(_ item: RuntimeIngressOutboxItem) {
    if let index = ingressOutbox.firstIndex(where: {
      $0.kind == item.kind && $0.ingressId == item.ingressId
    }) {
      ingressOutbox[index] = item
    } else {
      ingressOutbox.append(item)
    }
  }
}

public final class SwitchableScreenMemoryStore: ScreenMemoryStore, AudioMemoryStore, PerceptionEventOutbox {
  private var store: ScreenMemoryStore
  private var profileID: String

  public init(_ store: ScreenMemoryStore, profileID: String) {
    self.store = store
    self.profileID = profileID
  }

  public var activeArchive: ScreenMemoryArchive? {
    store as? ScreenMemoryArchive
  }

  public func replace(with store: ScreenMemoryStore, profileID: String) {
    if profileID == self.profileID {
      carryPendingPerceptionEvents(to: store)
    }
    self.store = store
    self.profileID = profileID
  }

  public func add(_ record: ScreenMemoryRecord) {
    store.add(record)
  }

  public func recent(limit: Int) -> [ScreenMemoryRecord] {
    store.recent(limit: limit)
  }

  public func search(_ query: String, limit: Int) -> [ScreenMemorySearchResult] {
    store.search(query, limit: limit)
  }

  public func delete(id: String) {
    store.delete(id: id)
  }

  public func addAudioMemory(_ record: AudioMemoryRecord) {
    (store as? AudioMemoryStore)?.addAudioMemory(record)
  }

  public func recentAudioMemory(limit: Int) -> [AudioMemoryRecord] {
    (store as? AudioMemoryStore)?.recentAudioMemory(limit: limit) ?? []
  }

  public func enqueuePerceptionEvent(_ event: PerceptionEvent) throws {
    try (store as? PerceptionEventOutbox)?.enqueuePerceptionEvent(event)
  }

  public func enqueuePerceptionTombstone(_ tombstone: PerceptionTombstone) throws {
    try (store as? PerceptionEventOutbox)?.enqueuePerceptionTombstone(tombstone)
  }

  public func enqueueSessionEndMarker(_ marker: SessionEndMarker) throws {
    try (store as? PerceptionEventOutbox)?.enqueueSessionEndMarker(marker)
  }

  public func enqueueCoachingWindowStarted(_ event: CoachingWindowStarted) throws {
    try (store as? PerceptionEventOutbox)?.enqueueCoachingWindowStarted(event)
  }

  public func enqueueCoachingWindowEnded(_ event: CoachingWindowEnded) throws {
    try (store as? PerceptionEventOutbox)?.enqueueCoachingWindowEnded(event)
  }

  public func pendingIngress(limit: Int) throws -> [RuntimeIngressOutboxItem] {
    try (store as? PerceptionEventOutbox)?.pendingIngress(limit: limit) ?? []
  }

  public func removeIngress(kind: RuntimeIngressKind, ingressId: String) throws {
    try (store as? PerceptionEventOutbox)?.removeIngress(kind: kind, ingressId: ingressId)
  }

  @discardableResult
  public func dropExpiredPerceptionEvents(now: Date) throws -> Int {
    try (store as? PerceptionEventOutbox)?.dropExpiredPerceptionEvents(now: now) ?? 0
  }

  private func carryPendingPerceptionEvents(to replacement: ScreenMemoryStore) {
    guard
      let currentOutbox = store as? PerceptionEventOutbox,
      let replacementOutbox = replacement as? PerceptionEventOutbox
    else {
      return
    }

    // Carry every pending durable-ingress item to replacement storage for the
    // same profile in enqueue order. Cross-profile switches never enter this
    // path: their pending rows remain in the owning profile's durable store.
    for item in (try? currentOutbox.pendingIngress(limit: 10_000)) ?? [] {
      do {
        switch item {
        case .perceptionEvent(let event):
          try replacementOutbox.enqueuePerceptionEvent(event)
        case .perceptionTombstone(let tombstone):
          try replacementOutbox.enqueuePerceptionTombstone(tombstone)
        case .sessionEndMarker(let marker):
          try replacementOutbox.enqueueSessionEndMarker(marker)
        case .coachingWindowStarted(let event):
          try replacementOutbox.enqueueCoachingWindowStarted(event)
        case .coachingWindowEnded(let event):
          try replacementOutbox.enqueueCoachingWindowEnded(event)
        }
        try currentOutbox.removeIngress(kind: item.kind, ingressId: item.ingressId)
      } catch {
        continue
      }
    }
  }
}

public enum ScreenMemoryStoreError: Error, Equatable, LocalizedError {
  case openFailed(String)
  case migrationFailed(String)
  case prepareFailed(String)
  case stepFailed(String)
  case closed
  case invalidText

  public var errorDescription: String? {
    switch self {
    case .openFailed(let message):
      return "Screen Memory database could not be opened: \(message)"
    case .migrationFailed(let message):
      return "Screen Memory database migration failed: \(message)"
    case .prepareFailed(let message):
      return "Screen Memory query could not be prepared: \(message)"
    case .stepFailed(let message):
      return "Screen Memory query failed: \(message)"
    case .closed:
      return "Screen Memory database is closed."
    case .invalidText:
      return "Screen Memory database returned invalid text."
    }
  }
}

public final class SQLiteScreenMemoryStore: ScreenMemoryStore, AudioMemoryStore, PerceptionEventOutbox
{
  public private(set) var lastError: ScreenMemoryStoreError?

  private var db: OpaquePointer?
  private let encoder = JSONEncoder()
  private let decoder = JSONDecoder()

  public init(databaseURL: URL) throws {
    var handle: OpaquePointer?
    let flags = SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX
    guard sqlite3_open_v2(databaseURL.path, &handle, flags, nil) == SQLITE_OK, let handle else {
      let message = handle.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown SQLite open error"
      sqlite3_close(handle)
      throw ScreenMemoryStoreError.openFailed(message)
    }
    db = handle
    do {
      try migrate()
    } catch let error as ScreenMemoryStoreError {
      sqlite3_close(handle)
      db = nil
      throw error
    } catch {
      sqlite3_close(handle)
      db = nil
      throw ScreenMemoryStoreError.migrationFailed(error.localizedDescription)
    }
  }

  deinit {
    sqlite3_close(db)
  }

  public static func applicationSupportURL(
    fileManager: FileManager = .default,
    userID: String,
    baseApplicationSupportURL: URL? = nil
  ) throws -> URL {
    try DesktopLocalProfile.screenMemoryDatabaseURL(
      userID: userID,
      fileManager: fileManager,
      baseApplicationSupportURL: baseApplicationSupportURL
    )
  }

  public func add(_ record: ScreenMemoryRecord) {
    captureError {
      try addRecord(record)
    }
  }

  public func recent(limit: Int) -> [ScreenMemoryRecord] {
    captureError(default: []) {
      try recentRecords(limit: limit)
    }
  }

  public func search(_ query: String, limit: Int) -> [ScreenMemorySearchResult] {
    captureError(default: []) {
      try searchRecords(query, limit: limit)
    }
  }

  public func delete(id: String) {
    captureError {
      try deleteRecord(id: id)
    }
  }

  public func addAudioMemory(_ record: AudioMemoryRecord) {
    captureError {
      try addAudioMemoryRecord(record)
    }
  }

  public func recentAudioMemory(limit: Int) -> [AudioMemoryRecord] {
    captureError(default: []) {
      try recentAudioMemoryRecords(limit: limit)
    }
  }

  public func addRecord(_ record: ScreenMemoryRecord) throws {
    try withTransaction {
      try addRecordStatements(record, semanticVector: nil)
    }
  }

  func addRecord(
    _ record: ScreenMemoryRecord,
    videoWrite: ScreenMemoryVideoWriteOutcome?,
    semanticVector: [Float]? = nil
  ) throws {
    try withTransaction {
      try addRecordStatements(record, semanticVector: semanticVector)
      guard let videoWrite else { return }
      switch videoWrite {
      case .rejected:
        break
      case .accepted(let location, let finalizedChunks):
        try execute(
          """
          INSERT INTO screen_memory_video_chunks (chunk_id, state, created_at, finalized_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(chunk_id) DO UPDATE SET
            state = excluded.state,
            finalized_at = NULL
          """,
          bindings: [
            .text(location.chunkID.value.uuidString),
            .text(ScreenMemoryVideoChunkState.active.rawValue),
            .text(record.capturedAt),
            .null,
          ]
        )
        try execute(
          """
          INSERT INTO screen_memory_video_frames (record_id, chunk_id, sample_ordinal, captured_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(record_id) DO UPDATE SET
            chunk_id = excluded.chunk_id,
            sample_ordinal = excluded.sample_ordinal,
            captured_at = excluded.captured_at
          """,
          bindings: [
            .text(record.id),
            .text(location.chunkID.value.uuidString),
            .int(location.sampleOrdinal),
            .text(record.capturedAt),
          ]
        )
        for finalized in finalizedChunks {
          _ = try markVideoChunkFinalizedStatements(finalized)
        }
      }
    }
  }

  private func addRecordStatements(
    _ record: ScreenMemoryRecord,
    semanticVector: [Float]?
  ) throws {
    let embeddingJSON = try record.embedding.map { embedding in
      String(data: try encoder.encode(embedding), encoding: .utf8) ?? ""
    }
    let ocrBlocksJSON = String(data: try encoder.encode(record.ocrBlocks), encoding: .utf8) ?? "[]"
    let perceptualHash = record.perceptualHash.map { String(format: "%016llx", $0) }
    let semanticBlob = semanticVector.map(semanticVectorData)
    try execute(
      """
      INSERT INTO screen_memory_records (
        id, captured_at, app_bundle_id, app_name, window_title, summary, ocr_text,
        ocr_blocks_json, perceptual_hash, retention_class, expires_at, sensitivity_label,
        embedding_json, semantic_embedding
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        captured_at = excluded.captured_at,
        app_bundle_id = excluded.app_bundle_id,
        app_name = excluded.app_name,
        window_title = excluded.window_title,
        summary = excluded.summary,
        ocr_text = excluded.ocr_text,
        ocr_blocks_json = excluded.ocr_blocks_json,
        perceptual_hash = excluded.perceptual_hash,
        retention_class = excluded.retention_class,
        expires_at = excluded.expires_at,
        sensitivity_label = excluded.sensitivity_label,
        embedding_json = excluded.embedding_json,
        semantic_embedding = excluded.semantic_embedding
      """,
      bindings: [
        .text(record.id),
        .text(record.capturedAt),
        .text(record.appBundleID),
        .text(record.appName),
        .text(record.windowTitle),
        .text(record.summary),
        .text(record.ocrText),
        .text(ocrBlocksJSON),
        perceptualHash.map(SQLiteBinding.text) ?? .null,
        .text(record.retentionClass),
        record.expiresAt.map(SQLiteBinding.text) ?? .text(Self.defaultExpiry(for: record.capturedAt)),
        .text(record.sensitivityLabel.rawValue),
        embeddingJSON.map(SQLiteBinding.text) ?? .null,
        semanticBlob.map(SQLiteBinding.blob) ?? .null,
      ]
    )

    try execute("DELETE FROM screen_memory_records_fts WHERE id = ?", bindings: [.text(record.id)])
    try execute(
      """
      INSERT INTO screen_memory_records_fts(id, app_name, window_title, summary, ocr_text)
      VALUES (?, ?, ?, ?, ?)
      """,
      bindings: [
        .text(record.id),
        .text(record.appName),
        .text(record.windowTitle),
        .text(record.summary),
        .text(record.ocrText),
      ]
    )
  }

  /// Records captured within a time range, oldest first. Renovated from Omi's
  /// day-scoped timeline load.
  public func records(from start: String, through end: String, limit: Int) throws -> [ScreenMemoryRecord] {
    try queryRecords(
      """
      SELECT id, captured_at, app_bundle_id, app_name, window_title, summary, ocr_text,
             ocr_blocks_json, perceptual_hash, retention_class, expires_at, sensitivity_label, embedding_json
      FROM screen_memory_records
      WHERE captured_at >= ? AND captured_at <= ?
      ORDER BY captured_at ASC
      LIMIT ?
      """,
      bindings: [.text(start), .text(end), .int(max(0, limit))]
    )
  }

  /// Evenly sampled records across a time range, oldest first — Omi's
  /// `getScreenshotsSampled`: return all when under `targetCount`, else pick
  /// every Nth so a dense day stays scrubbable without loading every frame.
  public func sampledRecords(
    from start: String,
    through end: String,
    targetCount: Int
  ) throws -> [ScreenMemoryRecord] {
    let all = try records(from: start, through: end, limit: Int.max)
    guard all.count > targetCount, targetCount > 0 else { return all }
    let step = Double(all.count) / Double(targetCount)
    var sampled: [ScreenMemoryRecord] = []
    var cursor = 0.0
    while Int(cursor) < all.count, sampled.count < targetCount {
      sampled.append(all[Int(cursor)])
      cursor += step
    }
    return sampled
  }

  /// Distinct app names present in the archive, alphabetically — Omi's
  /// `getUniqueAppNames`, used to populate the timeline's app filter.
  public func uniqueAppNames() throws -> [String] {
    try queryStrings(
      "SELECT DISTINCT app_name FROM screen_memory_records WHERE app_name != '' ORDER BY app_name ASC"
    )
  }

  public func recentRecords(limit: Int) throws -> [ScreenMemoryRecord] {
    try queryRecords(
      """
      SELECT id, captured_at, app_bundle_id, app_name, window_title, summary, ocr_text,
             ocr_blocks_json, perceptual_hash, retention_class, expires_at, sensitivity_label, embedding_json
      FROM screen_memory_records
      ORDER BY captured_at DESC
      LIMIT ?
      """,
      bindings: [.int(max(0, limit))]
    )
  }

  public func searchRecords(_ query: String, limit: Int) throws -> [ScreenMemorySearchResult] {
    let terms = searchTerms(query)
    guard !terms.isEmpty else {
      return try recentRecords(limit: limit).map { ScreenMemorySearchResult(record: $0, rank: 0) }
    }

    let records = try queryRecords(
      """
      SELECT records.id, records.captured_at, records.app_bundle_id, records.app_name,
             records.window_title, records.summary, records.ocr_text,
             records.ocr_blocks_json, records.perceptual_hash, records.retention_class,
             records.expires_at, records.sensitivity_label, records.embedding_json
      FROM screen_memory_records_fts AS fts
      JOIN screen_memory_records AS records ON records.id = fts.id
      WHERE screen_memory_records_fts MATCH ?
      ORDER BY bm25(screen_memory_records_fts), records.captured_at DESC
      LIMIT ?
      """,
      bindings: [.text(terms.joined(separator: " ")), .int(max(0, limit))]
    )

    return records.map { record in
      let haystack = "\(record.appName) \(record.windowTitle) \(record.summary) \(record.ocrText)"
        .lowercased()
      let rank = terms.reduce(0) { partial, term in
        partial + (haystack.contains(term.lowercased()) ? 1 : 0)
      }
      return ScreenMemorySearchResult(record: record, rank: rank)
    }
  }

  public func deleteRecord(id: String) throws {
    try execute("DELETE FROM screen_memory_records_fts WHERE id = ?", bindings: [.text(id)])
    try execute("DELETE FROM screen_memory_records WHERE id = ?", bindings: [.text(id)])
  }

  func applyRetentionPeriod(_ period: ScreenMemoryRetentionPeriod) throws {
    try withTransaction {
      try execute(
        """
        UPDATE screen_memory_records
        SET retention_class = ?,
            expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', captured_at, ?)
        """,
        bindings: [
          .text(period.retentionClass),
          .text("+\(period.rawValue) days"),
        ]
      )
      try execute(
        """
        UPDATE audio_memory_records
        SET retention_class = ?,
            expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', captured_at, ?)
        """,
        bindings: [
          .text(period.audioRetentionClass),
          .text("+\(period.rawValue) days"),
        ]
      )
      try execute(
        """
        UPDATE runtime_ingress_outbox
        SET payload_json = json_set(
              payload_json,
              '$.retention_class',
              CASE
                WHEN json_extract(payload_json, '$.retention_class') LIKE 'audio_memory_%'
                  THEN ?
                ELSE ?
              END,
              '$.expires_at',
              strftime(
                '%Y-%m-%dT%H:%M:%fZ',
                json_extract(payload_json, '$.captured_at'),
                ?
              )
            ),
            expires_at = strftime(
              '%Y-%m-%dT%H:%M:%fZ',
              json_extract(payload_json, '$.captured_at'),
              ?
            )
        WHERE ingress_kind = ?
        """,
        bindings: [
          .text(period.audioRetentionClass),
          .text(period.retentionClass),
          .text("+\(period.rawValue) days"),
          .text("+\(period.rawValue) days"),
          .text(RuntimeIngressKind.perceptionEvent.rawValue),
        ]
      )
    }
  }

  func expiryDeletionPlan(at now: String) throws -> ScreenMemoryDeletionPlan? {
    let expiredChunkIDs = try queryStrings(
      """
      SELECT frames.chunk_id
      FROM screen_memory_video_frames AS frames
      JOIN screen_memory_records AS records ON records.id = frames.record_id
      GROUP BY frames.chunk_id
      HAVING MIN(records.expires_at) <= ?
      ORDER BY MIN(records.expires_at) ASC
      """,
      bindings: [.text(now)]
    )
    var recordIDs: [String] = []
    for chunkID in expiredChunkIDs {
      recordIDs.append(
        contentsOf: try queryStrings(
          "SELECT record_id FROM screen_memory_video_frames WHERE chunk_id = ? ORDER BY captured_at ASC",
          bindings: [.text(chunkID)]
        )
      )
    }
    recordIDs.append(
      contentsOf: try queryStrings(
        """
        SELECT records.id
        FROM screen_memory_records AS records
        LEFT JOIN screen_memory_video_frames AS frames ON frames.record_id = records.id
        WHERE frames.record_id IS NULL AND records.expires_at <= ?
        ORDER BY records.captured_at ASC
        """,
        bindings: [.text(now)]
      )
    )
    let audioIDs = try queryStrings(
      "SELECT id FROM audio_memory_records WHERE expires_at <= ? ORDER BY captured_at ASC",
      bindings: [.text(now)]
    )
    guard !recordIDs.isEmpty || !audioIDs.isEmpty || !expiredChunkIDs.isEmpty else { return nil }
    return ScreenMemoryDeletionPlan(
      id: UUID().uuidString,
      reason: .expired,
      recordIDs: Array(Set(recordIDs)).sorted(),
      audioRecordIDs: audioIDs,
      chunkIDs: expiredChunkIDs,
      clearsAll: false
    )
  }

  func manualDeletionPlan(recordID: String) throws -> ScreenMemoryDeletionPlan? {
    guard try record(id: recordID) != nil else { return nil }
    let chunkIDs = try queryStrings(
      "SELECT chunk_id FROM screen_memory_video_frames WHERE record_id = ?",
      bindings: [.text(recordID)]
    )
    let recordIDs: [String]
    if let chunkID = chunkIDs.first {
      recordIDs = try queryStrings(
        "SELECT record_id FROM screen_memory_video_frames WHERE chunk_id = ? ORDER BY captured_at ASC",
        bindings: [.text(chunkID)]
      )
    } else {
      recordIDs = [recordID]
    }
    return ScreenMemoryDeletionPlan(
      id: UUID().uuidString,
      reason: .manual,
      recordIDs: recordIDs,
      audioRecordIDs: [],
      chunkIDs: chunkIDs,
      clearsAll: false
    )
  }

  func clearAllDeletionPlan() throws -> ScreenMemoryDeletionPlan {
    ScreenMemoryDeletionPlan(
      id: UUID().uuidString,
      reason: .clearAll,
      recordIDs: try queryStrings("SELECT id FROM screen_memory_records ORDER BY captured_at ASC"),
      audioRecordIDs: try queryStrings("SELECT id FROM audio_memory_records ORDER BY captured_at ASC"),
      chunkIDs: try queryStrings("SELECT chunk_id FROM screen_memory_video_chunks ORDER BY created_at ASC"),
      clearsAll: true
    )
  }

  func saveDeletionPlan(_ plan: ScreenMemoryDeletionPlan) throws {
    let data = try encoder.encode(plan)
    guard let json = String(data: data, encoding: .utf8) else {
      throw ScreenMemoryStoreError.invalidText
    }
    try execute(
      """
      INSERT OR REPLACE INTO screen_memory_deletion_journal(journal_id, plan_json, created_at)
      VALUES (?, ?, ?)
      """,
      bindings: [.text(plan.id), .text(json), .text(Date().protocolTimestamp)]
    )
  }

  func pendingDeletionPlans() throws -> [ScreenMemoryDeletionPlan] {
    try withStatement(
      "SELECT plan_json FROM screen_memory_deletion_journal ORDER BY created_at ASC",
      bindings: []
    ) { statement in
      var plans: [ScreenMemoryDeletionPlan] = []
      while true {
        let result = sqlite3_step(statement)
        if result == SQLITE_ROW {
          let json = try columnText(statement, 0)
          plans.append(try decoder.decode(ScreenMemoryDeletionPlan.self, from: Data(json.utf8)))
        } else if result == SQLITE_DONE {
          return plans
        } else {
          throw ScreenMemoryStoreError.stepFailed(errorMessage)
        }
      }
    }
  }

  func commitDeletionPlan(
    _ plan: ScreenMemoryDeletionPlan,
    tombstone: PerceptionTombstone?
  ) throws {
    try withTransaction {
      if plan.clearsAll {
        try execute("DELETE FROM screen_memory_records_fts")
        try execute("DELETE FROM screen_memory_records")
        try execute("DELETE FROM screen_memory_video_chunks")
        try execute("DELETE FROM audio_memory_records")
        // Clear Rewind content that has not shipped yet, but preserve unrelated
        // durable ingress (session-end markers and earlier tombstones).
        try execute(
          "DELETE FROM runtime_ingress_outbox WHERE ingress_kind = ?",
          bindings: [.text(RuntimeIngressKind.perceptionEvent.rawValue)]
        )
      } else {
        for recordID in plan.recordIDs {
          try execute("DELETE FROM screen_memory_records_fts WHERE id = ?", bindings: [.text(recordID)])
          try execute("DELETE FROM screen_memory_records WHERE id = ?", bindings: [.text(recordID)])
          // Only drop an unsent perception event that carries the deleted
          // record; a pending tombstone must survive so the deletion still
          // propagates to the Agent Runtime.
          try execute(
            "DELETE FROM runtime_ingress_outbox WHERE ingress_kind = ? AND payload_json LIKE ?",
            bindings: [.text(RuntimeIngressKind.perceptionEvent.rawValue), .text("%\(recordID)%")]
          )
        }
        for audioID in plan.audioRecordIDs {
          try execute("DELETE FROM audio_memory_records WHERE id = ?", bindings: [.text(audioID)])
          try execute(
            "DELETE FROM runtime_ingress_outbox WHERE ingress_kind = ? AND payload_json LIKE ?",
            bindings: [.text(RuntimeIngressKind.perceptionEvent.rawValue), .text("%\(audioID)%")]
          )
        }
        for chunkID in plan.chunkIDs {
          try execute("DELETE FROM screen_memory_video_chunks WHERE chunk_id = ?", bindings: [.text(chunkID)])
        }
      }
      try execute(
        "DELETE FROM screen_memory_deletion_journal WHERE journal_id = ?",
        bindings: [.text(plan.id)]
      )
      if let tombstone {
        // The deletion is not complete until its Runtime tombstone is durable.
        // Keeping both writes in this transaction ensures a failed enqueue
        // rolls the local rows and deletion journal back together.
        try enqueuePerceptionTombstone(tombstone)
      }
    }
  }

  private func queryStrings(_ sql: String, bindings: [SQLiteBinding] = []) throws -> [String] {
    try withStatement(sql, bindings: bindings) { statement in
      var values: [String] = []
      while true {
        let result = sqlite3_step(statement)
        if result == SQLITE_ROW {
          values.append(try columnText(statement, 0))
        } else if result == SQLITE_DONE {
          return values
        } else {
          throw ScreenMemoryStoreError.stepFailed(errorMessage)
        }
      }
    }
  }

  func latestPerceptualRecord() throws -> (id: String, hash: UInt64)? {
    try withStatement(
      """
      SELECT id, perceptual_hash
      FROM screen_memory_records
      WHERE perceptual_hash IS NOT NULL
      ORDER BY captured_at DESC
      LIMIT 1
      """,
      bindings: []
    ) { statement in
      let result = sqlite3_step(statement)
      if result == SQLITE_DONE { return nil }
      guard result == SQLITE_ROW else {
        throw ScreenMemoryStoreError.stepFailed(errorMessage)
      }
      let id = try columnText(statement, 0)
      let hashText = try columnText(statement, 1)
      guard let hash = UInt64(hashText, radix: 16) else {
        throw ScreenMemoryStoreError.invalidText
      }
      return (id, hash)
    }
  }

  func record(id: String) throws -> ScreenMemoryRecord? {
    try queryRecords(
      """
      SELECT id, captured_at, app_bundle_id, app_name, window_title, summary, ocr_text,
             ocr_blocks_json, perceptual_hash, retention_class, expires_at, sensitivity_label, embedding_json
      FROM screen_memory_records
      WHERE id = ?
      LIMIT 1
      """,
      bindings: [.text(id)]
    ).first
  }

  func markVideoChunkFinalizing(_ chunkID: ScreenMemoryVideoChunkID) throws {
    try withTransaction {
      try execute(
        """
        UPDATE screen_memory_video_chunks
        SET state = ?, finalized_at = NULL
        WHERE chunk_id = ? AND state = ?
        """,
        bindings: [
          .text(ScreenMemoryVideoChunkState.finalizing.rawValue),
          .text(chunkID.value.uuidString),
          .text(ScreenMemoryVideoChunkState.active.rawValue),
        ]
      )
    }
  }

  @discardableResult
  func markVideoChunkFinalized(_ finalized: ScreenMemoryVideoChunkFinalization) throws -> Bool {
    var didFinalize = false
    try withTransaction {
      didFinalize = try markVideoChunkFinalizedStatements(finalized)
    }
    return didFinalize
  }

  private func markVideoChunkFinalizedStatements(
    _ finalized: ScreenMemoryVideoChunkFinalization
  ) throws -> Bool {
    try execute(
      """
      UPDATE screen_memory_video_chunks
      SET state = ?, finalized_at = ?
      WHERE chunk_id = ?
        AND ? >= (
          SELECT COALESCE(MAX(sample_ordinal), -1) + 1
          FROM screen_memory_video_frames
          WHERE chunk_id = ?
        )
      """,
      bindings: [
        .text(ScreenMemoryVideoChunkState.finalized.rawValue),
        .text(Date().protocolTimestamp),
        .text(finalized.chunkID.value.uuidString),
        .int(finalized.sampleCount),
        .text(finalized.chunkID.value.uuidString),
      ]
    )
    guard let db else { throw ScreenMemoryStoreError.closed }
    return sqlite3_changes(db) > 0
  }

  func clearVideoMappings(chunkID: ScreenMemoryVideoChunkID) throws {
    try withTransaction {
      try execute(
        "DELETE FROM screen_memory_video_frames WHERE chunk_id = ?",
        bindings: [.text(chunkID.value.uuidString)]
      )
      try execute(
        "DELETE FROM screen_memory_video_chunks WHERE chunk_id = ?",
        bindings: [.text(chunkID.value.uuidString)]
      )
    }
  }

  func videoRecoveryCandidates() throws -> [ScreenMemoryVideoRecoveryCandidate] {
    try withStatement(
      """
      SELECT chunks.chunk_id, chunks.state, COALESCE(MAX(frames.sample_ordinal), -1) + 1
      FROM screen_memory_video_chunks AS chunks
      LEFT JOIN screen_memory_video_frames AS frames ON frames.chunk_id = chunks.chunk_id
      WHERE chunks.state != ?
      GROUP BY chunks.chunk_id, chunks.state
      ORDER BY chunks.created_at ASC
      """,
      bindings: [.text(ScreenMemoryVideoChunkState.finalized.rawValue)]
    ) { statement in
      var candidates: [ScreenMemoryVideoRecoveryCandidate] = []
      while true {
        let result = sqlite3_step(statement)
        if result == SQLITE_ROW {
          guard
            let uuid = UUID(uuidString: try columnText(statement, 0)),
            let state = ScreenMemoryVideoChunkState(rawValue: try columnText(statement, 1))
          else {
            throw ScreenMemoryStoreError.invalidText
          }
          candidates.append(
            ScreenMemoryVideoRecoveryCandidate(
              chunkID: ScreenMemoryVideoChunkID(uuid),
              state: state,
              expectedSampleCount: Int(sqlite3_column_int(statement, 2))
            )
          )
        } else if result == SQLITE_DONE {
          return candidates
        } else {
          throw ScreenMemoryStoreError.stepFailed(errorMessage)
        }
      }
    }
  }

  func videoFrame(recordID: ScreenMemoryRecordID) throws -> PersistedScreenMemoryVideoFrame? {
    try queryVideoFrames(
      """
      WHERE records.id = ? AND chunks.state = ?
      LIMIT 1
      """,
      bindings: [
        .text(recordID.value.uuidString),
        .text(ScreenMemoryVideoChunkState.finalized.rawValue),
      ]
    ).first
  }

  func videoFrames(from start: String, through end: String) throws -> [PersistedScreenMemoryVideoFrame] {
    try queryVideoFrames(
      """
      WHERE frames.captured_at >= ? AND frames.captured_at <= ? AND chunks.state = ?
      ORDER BY frames.captured_at ASC, frames.sample_ordinal ASC
      """,
      bindings: [
        .text(start),
        .text(end),
        .text(ScreenMemoryVideoChunkState.finalized.rawValue),
      ]
    )
  }

  private func queryVideoFrames(
    _ predicate: String,
    bindings: [SQLiteBinding]
  ) throws -> [PersistedScreenMemoryVideoFrame] {
    try withStatement(
      """
      SELECT records.id, records.captured_at, records.app_bundle_id, records.app_name,
             records.window_title, frames.chunk_id, frames.sample_ordinal
      FROM screen_memory_video_frames AS frames
      JOIN screen_memory_records AS records ON records.id = frames.record_id
      JOIN screen_memory_video_chunks AS chunks ON chunks.chunk_id = frames.chunk_id
      \(predicate)
      """,
      bindings: bindings
    ) { statement in
      var frames: [PersistedScreenMemoryVideoFrame] = []
      while true {
        let result = sqlite3_step(statement)
        if result == SQLITE_ROW {
          guard
            let recordUUID = UUID(uuidString: try columnText(statement, 0)),
            let chunkUUID = UUID(uuidString: try columnText(statement, 5))
          else {
            throw ScreenMemoryStoreError.invalidText
          }
          frames.append(
            PersistedScreenMemoryVideoFrame(
              recordID: ScreenMemoryRecordID(recordUUID),
              capturedAt: try columnText(statement, 1),
              appBundleID: try columnText(statement, 2),
              appName: try columnText(statement, 3),
              windowTitle: try columnText(statement, 4),
              location: ScreenMemoryVideoFrameLocation(
                chunkID: ScreenMemoryVideoChunkID(chunkUUID),
                sampleOrdinal: Int(sqlite3_column_int(statement, 6))
              )
            )
          )
        } else if result == SQLITE_DONE {
          return frames
        } else {
          throw ScreenMemoryStoreError.stepFailed(errorMessage)
        }
      }
    }
  }

  public func addAudioMemoryRecord(_ record: AudioMemoryRecord) throws {
    let embeddingJSON = try record.embedding.map { embedding in
      String(data: try encoder.encode(embedding), encoding: .utf8) ?? ""
    }
    try execute(
      """
      INSERT INTO audio_memory_records (
        id, captured_at, period_start, period_end, transcript, summary,
        retention_class, expires_at, sensitivity_label, embedding_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        captured_at = excluded.captured_at,
        period_start = excluded.period_start,
        period_end = excluded.period_end,
        transcript = excluded.transcript,
        summary = excluded.summary,
        retention_class = excluded.retention_class,
        expires_at = excluded.expires_at,
        sensitivity_label = excluded.sensitivity_label,
        embedding_json = excluded.embedding_json
      """,
      bindings: [
        .text(record.id),
        .text(record.capturedAt),
        .text(record.periodStart),
        .text(record.periodEnd),
        .text(record.transcript),
        .text(record.summary),
        .text(record.retentionClass),
        record.expiresAt.map(SQLiteBinding.text) ?? .text(Self.defaultExpiry(for: record.capturedAt)),
        .text(record.sensitivityLabel.rawValue),
        embeddingJSON.map(SQLiteBinding.text) ?? .null,
      ]
    )
  }

  public func recentAudioMemoryRecords(limit: Int) throws -> [AudioMemoryRecord] {
    try withStatement(
      """
      SELECT id, captured_at, period_start, period_end, transcript, summary,
             retention_class, expires_at, sensitivity_label, embedding_json
      FROM audio_memory_records
      ORDER BY captured_at DESC
      LIMIT ?
      """,
      bindings: [.int(max(0, limit))]
    ) { statement in
      var records: [AudioMemoryRecord] = []
      while true {
        let result = sqlite3_step(statement)
        if result == SQLITE_ROW {
          records.append(try decodeAudioMemoryRecord(statement))
        } else if result == SQLITE_DONE {
          return records
        } else {
          throw ScreenMemoryStoreError.stepFailed(errorMessage)
        }
      }
    }
  }

  public func enqueuePerceptionEvent(_ event: PerceptionEvent) throws {
    try enqueueIngress(
      kind: .perceptionEvent,
      ingressId: event.eventId,
      payload: try ProtocolEventCodec.encode(event),
      expiresAt: event.expiresAt
    )
  }

  public func enqueuePerceptionTombstone(_ tombstone: PerceptionTombstone) throws {
    try enqueueIngress(
      kind: .perceptionTombstone,
      ingressId: tombstone.tombstoneId,
      payload: try ProtocolEventCodec.encode(tombstone),
      expiresAt: nil
    )
  }

  public func enqueueSessionEndMarker(_ marker: SessionEndMarker) throws {
    try enqueueIngress(
      kind: .sessionEndMarker,
      ingressId: marker.markerId,
      payload: try ProtocolEventCodec.encode(marker),
      expiresAt: nil
    )
  }

  public func enqueueCoachingWindowStarted(_ event: CoachingWindowStarted) throws {
    try enqueueIngress(
      kind: .coachingWindowStarted,
      ingressId: event.windowId,
      payload: try ProtocolEventCodec.encode(event),
      expiresAt: nil
    )
  }

  public func enqueueCoachingWindowEnded(_ event: CoachingWindowEnded) throws {
    try enqueueIngress(
      kind: .coachingWindowEnded,
      ingressId: event.windowId,
      payload: try ProtocolEventCodec.encode(event),
      expiresAt: nil
    )
  }

  public func pendingIngress(limit: Int) throws -> [RuntimeIngressOutboxItem] {
    // `seq` is the monotonic enqueue order across every kind, so an event can
    // never be redelivered behind its own later tombstone.
    try withStatement(
      """
      SELECT ingress_kind, payload_json
      FROM runtime_ingress_outbox
      ORDER BY seq ASC
      LIMIT ?
      """,
      bindings: [.int(max(0, limit))]
    ) { statement in
      var items: [RuntimeIngressOutboxItem] = []
      while true {
        let result = sqlite3_step(statement)
        if result == SQLITE_ROW {
          let kindRaw = try columnText(statement, 0)
          let payloadJSON = try columnText(statement, 1)
          guard let payload = payloadJSON.data(using: .utf8) else {
            throw ScreenMemoryStoreError.invalidText
          }
          switch RuntimeIngressKind(rawValue: kindRaw) {
          case .perceptionEvent:
            items.append(.perceptionEvent(try ProtocolEventCodec.decodePerceptionEvent(payload)))
          case .perceptionTombstone:
            items.append(
              .perceptionTombstone(try ProtocolEventCodec.decodePerceptionTombstone(payload)))
          case .sessionEndMarker:
            items.append(.sessionEndMarker(try ProtocolEventCodec.decodeSessionEndMarker(payload)))
          case .coachingWindowStarted:
            items.append(
              .coachingWindowStarted(
                try ProtocolEventCodec.decodeCoachingWindowStarted(payload)
              )
            )
          case .coachingWindowEnded:
            items.append(
              .coachingWindowEnded(
                try ProtocolEventCodec.decodeCoachingWindowEnded(payload)
              )
            )
          case nil:
            // Unknown kind from a forward-incompatible row: skip rather than fail
            // the whole drain.
            continue
          }
        } else if result == SQLITE_DONE {
          return items
        } else {
          throw ScreenMemoryStoreError.stepFailed(errorMessage)
        }
      }
    }
  }

  public func removeIngress(kind: RuntimeIngressKind, ingressId: String) throws {
    try execute(
      "DELETE FROM runtime_ingress_outbox WHERE ingress_kind = ? AND ingress_id = ?",
      bindings: [.text(kind.rawValue), .text(ingressId)]
    )
  }

  @discardableResult
  public func dropExpiredPerceptionEvents(now: Date) throws -> Int {
    try execute(
      """
      DELETE FROM runtime_ingress_outbox
      WHERE ingress_kind = ?
        AND expires_at IS NOT NULL
        AND expires_at <= ?
      """,
      bindings: [.text(RuntimeIngressKind.perceptionEvent.rawValue), .text(now.protocolTimestamp)]
    )
    return Int(sqlite3_changes(db))
  }

  private func enqueueIngress(
    kind: RuntimeIngressKind,
    ingressId: String,
    payload: Data,
    expiresAt: String?
  ) throws {
    guard let payloadText = String(data: payload, encoding: .utf8) else {
      throw ScreenMemoryStoreError.invalidText
    }
    // A re-enqueue keeps the original `seq` (position), so refreshing a payload
    // never advances an item past a later one that was enqueued after it.
    try execute(
      """
      INSERT INTO runtime_ingress_outbox (ingress_kind, ingress_id, payload_json, enqueued_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(ingress_kind, ingress_id) DO UPDATE SET
        payload_json = excluded.payload_json,
        enqueued_at = excluded.enqueued_at,
        expires_at = excluded.expires_at
      """,
      bindings: [
        .text(kind.rawValue),
        .text(ingressId),
        .text(payloadText),
        .text(Date().protocolTimestamp),
        expiresAt.map(SQLiteBinding.text) ?? .null,
      ]
    )
  }

  /// One-time carry of the legacy per-kind outboxes (`perception_event_outbox`,
  /// `perception_tombstone_outbox`) into the unified `runtime_ingress_outbox`,
  /// preserving global enqueue order by `enqueued_at` so a pre-upgrade event can
  /// never redeliver behind its own later tombstone. Idempotent: once the legacy
  /// tables are dropped this is a no-op. Perception-event expiry is recovered
  /// from the stored payload via `json_extract`.
  private func migrateLegacyPerceptionOutboxes() throws {
    let hasEvents = try legacyTableExists("perception_event_outbox")
    let hasTombstones = try legacyTableExists("perception_tombstone_outbox")
    guard hasEvents || hasTombstones else { return }

    var selects: [String] = []
    if hasEvents {
      selects.append(
        """
        SELECT '\(RuntimeIngressKind.perceptionEvent.rawValue)' AS ingress_kind,
               event_id AS ingress_id,
               event_json AS payload_json,
               enqueued_at AS enqueued_at,
               json_extract(event_json, '$.expires_at') AS expires_at
        FROM perception_event_outbox
        """
      )
    }
    if hasTombstones {
      selects.append(
        """
        SELECT '\(RuntimeIngressKind.perceptionTombstone.rawValue)' AS ingress_kind,
               tombstone_id AS ingress_id,
               tombstone_json AS payload_json,
               enqueued_at AS enqueued_at,
               NULL AS expires_at
        FROM perception_tombstone_outbox
        """
      )
    }

    try execute(
      """
      INSERT OR IGNORE INTO runtime_ingress_outbox
        (ingress_kind, ingress_id, payload_json, enqueued_at, expires_at)
      SELECT ingress_kind, ingress_id, payload_json, enqueued_at, expires_at
      FROM (
        \(selects.joined(separator: "\n        UNION ALL\n"))
      )
      ORDER BY enqueued_at ASC, ingress_id ASC
      """
    )
    try execute("DROP TABLE IF EXISTS perception_event_outbox")
    try execute("DROP TABLE IF EXISTS perception_tombstone_outbox")
  }

  private func legacyTableExists(_ name: String) throws -> Bool {
    try withStatement(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
      bindings: [.text(name)]
    ) { statement in
      sqlite3_step(statement) == SQLITE_ROW
    }
  }

  private func migrate() throws {
    try execute("PRAGMA journal_mode = WAL")
    try execute("PRAGMA foreign_keys = ON")
    try execute(
      """
      CREATE TABLE IF NOT EXISTS screen_memory_records (
        id TEXT PRIMARY KEY,
        captured_at TEXT NOT NULL,
        app_bundle_id TEXT NOT NULL DEFAULT '',
        app_name TEXT NOT NULL,
        window_title TEXT NOT NULL,
        summary TEXT NOT NULL,
        ocr_text TEXT NOT NULL,
        ocr_blocks_json TEXT NOT NULL DEFAULT '[]',
        perceptual_hash TEXT,
        retention_class TEXT NOT NULL,
        expires_at TEXT,
        sensitivity_label TEXT NOT NULL,
        embedding_json TEXT
      )
      """
    )
    try ensureColumn(
      table: "screen_memory_records",
      column: "app_bundle_id",
      definition: "TEXT NOT NULL DEFAULT ''"
    )
    try ensureColumn(
      table: "screen_memory_records",
      column: "ocr_blocks_json",
      definition: "TEXT NOT NULL DEFAULT '[]'"
    )
    try ensureColumn(
      table: "screen_memory_records",
      column: "perceptual_hash",
      definition: "TEXT"
    )
    try ensureColumn(
      table: "screen_memory_records",
      column: "expires_at",
      definition: "TEXT"
    )
    try ensureColumn(
      table: "screen_memory_records",
      column: "semantic_embedding",
      definition: "BLOB"
    )
    try execute(
      """
      UPDATE screen_memory_records
      SET retention_class = 'screen_memory_7d',
          expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', captured_at, '+7 days')
      WHERE expires_at IS NULL
      """
    )
    try execute(
      """
      CREATE VIRTUAL TABLE IF NOT EXISTS screen_memory_records_fts USING fts5(
        id UNINDEXED,
        app_name,
        window_title,
        summary,
        ocr_text,
        tokenize = 'unicode61'
      )
      """
    )
    try execute("PRAGMA user_version = 2")
    try execute("DROP TABLE IF EXISTS legacy_screen_memory_imports")
    // One durable outbox for every Runtime-acknowledged ingress kind, replacing
    // the two per-kind tables (migration below). `seq` is the monotonic global
    // enqueue order so an event can never redeliver behind its later tombstone;
    // rows survive until a `runtime_ingress_ack` deletes them by `(kind, id)`.
    try execute(
      """
      CREATE TABLE IF NOT EXISTS runtime_ingress_outbox (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        ingress_kind TEXT NOT NULL,
        ingress_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        enqueued_at TEXT NOT NULL,
        expires_at TEXT,
        UNIQUE(ingress_kind, ingress_id)
      )
      """
    )
    try migrateLegacyPerceptionOutboxes()
    try execute(
      """
      CREATE TABLE IF NOT EXISTS audio_memory_records (
        id TEXT PRIMARY KEY,
        captured_at TEXT NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        transcript TEXT NOT NULL,
        summary TEXT NOT NULL,
        retention_class TEXT NOT NULL,
        expires_at TEXT,
        sensitivity_label TEXT NOT NULL,
        embedding_json TEXT
      )
      """
    )
    try ensureColumn(
      table: "audio_memory_records",
      column: "expires_at",
      definition: "TEXT"
    )
    try execute(
      """
      UPDATE audio_memory_records
      SET retention_class = 'audio_memory_7d',
          expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', captured_at, '+7 days')
      WHERE expires_at IS NULL
      """
    )
    try execute(
      """
      CREATE TABLE IF NOT EXISTS screen_memory_video_chunks (
        chunk_id TEXT PRIMARY KEY,
        state TEXT NOT NULL CHECK(state IN ('active', 'finalizing', 'finalized')),
        created_at TEXT NOT NULL,
        finalized_at TEXT
      )
      """
    )
    try execute(
      """
      CREATE TABLE IF NOT EXISTS screen_memory_video_frames (
        record_id TEXT PRIMARY KEY REFERENCES screen_memory_records(id) ON DELETE CASCADE,
        chunk_id TEXT NOT NULL REFERENCES screen_memory_video_chunks(chunk_id) ON DELETE CASCADE,
        sample_ordinal INTEGER NOT NULL CHECK(sample_ordinal >= 0),
        captured_at TEXT NOT NULL,
        UNIQUE(chunk_id, sample_ordinal)
      )
      """
    )
    try execute(
      "CREATE INDEX IF NOT EXISTS screen_memory_video_frames_captured_at ON screen_memory_video_frames(captured_at)"
    )
    try execute(
      """
      CREATE TABLE IF NOT EXISTS screen_memory_deletion_journal (
        journal_id TEXT PRIMARY KEY,
        plan_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
      """
    )
    try execute("PRAGMA user_version = 5")
  }

  /// Records that carry a local semantic embedding, scoped to a time range and
  /// read in most-recent-first order. Adapted from Omi's `readEmbeddingBatch`;
  /// the vectors never leave the Mac.
  func semanticSearchCandidates(
    from start: String? = nil,
    through end: String? = nil,
    limit: Int
  ) throws -> [(record: ScreenMemoryRecord, vector: [Float])] {
    var predicate = "WHERE records.semantic_embedding IS NOT NULL"
    var bindings: [SQLiteBinding] = []
    if let start {
      predicate += " AND records.captured_at >= ?"
      bindings.append(.text(start))
    }
    if let end {
      predicate += " AND records.captured_at <= ?"
      bindings.append(.text(end))
    }
    bindings.append(.int(max(0, limit)))
    return try withStatement(
      """
      SELECT records.id, records.captured_at, records.app_bundle_id, records.app_name,
             records.window_title, records.summary, records.ocr_text, records.ocr_blocks_json,
             records.perceptual_hash, records.retention_class, records.expires_at,
             records.sensitivity_label, records.embedding_json, records.semantic_embedding
      FROM screen_memory_records AS records
      \(predicate)
      ORDER BY records.captured_at DESC
      LIMIT ?
      """,
      bindings: bindings
    ) { statement in
      var candidates: [(record: ScreenMemoryRecord, vector: [Float])] = []
      while true {
        let result = sqlite3_step(statement)
        if result == SQLITE_ROW {
          let record = try decodeRecord(statement)
          guard let blob = columnBlob(statement, 13), let vector = semanticVector(from: blob) else {
            continue
          }
          candidates.append((record, vector))
        } else if result == SQLITE_DONE {
          return candidates
        } else {
          throw ScreenMemoryStoreError.stepFailed(errorMessage)
        }
      }
    }
  }

  private func queryRecords(_ sql: String, bindings: [SQLiteBinding] = []) throws -> [ScreenMemoryRecord] {
    try withStatement(sql, bindings: bindings) { statement in
      var records: [ScreenMemoryRecord] = []
      while true {
        let result = sqlite3_step(statement)
        if result == SQLITE_ROW {
          records.append(try decodeRecord(statement))
        } else if result == SQLITE_DONE {
          return records
        } else {
          throw ScreenMemoryStoreError.stepFailed(errorMessage)
        }
      }
    }
  }

  private func decodeRecord(_ statement: OpaquePointer) throws -> ScreenMemoryRecord {
    let ocrBlocksText = try columnText(statement, 7)
    let ocrBlocksData = Data(ocrBlocksText.utf8)
    let ocrBlocks = try decoder.decode([ScreenMemoryOCRBlock].self, from: ocrBlocksData)
    let perceptualHash = try optionalColumnText(statement, 8).flatMap { UInt64($0, radix: 16) }
    let embeddingText = try optionalColumnText(statement, 12)
    let embedding = try embeddingText.flatMap { text -> PerceptionEmbeddingRef? in
      guard let data = text.data(using: .utf8), !data.isEmpty else { return nil }
      return try decoder.decode(PerceptionEmbeddingRef.self, from: data)
    }
    let label = SensitivityLabel(rawValue: try columnText(statement, 11)) ?? .sensitive
    return ScreenMemoryRecord(
      id: try columnText(statement, 0),
      capturedAt: try columnText(statement, 1),
      appBundleID: try columnText(statement, 2),
      appName: try columnText(statement, 3),
      windowTitle: try columnText(statement, 4),
      summary: try columnText(statement, 5),
      ocrText: try columnText(statement, 6),
      ocrBlocks: ocrBlocks,
      perceptualHash: perceptualHash,
      retentionClass: try columnText(statement, 9),
      expiresAt: try optionalColumnText(statement, 10),
      sensitivityLabel: label,
      embedding: embedding
    )
  }

  private func decodeAudioMemoryRecord(_ statement: OpaquePointer) throws -> AudioMemoryRecord {
    let embeddingText = try optionalColumnText(statement, 9)
    let embedding = try embeddingText.flatMap { text -> PerceptionEmbeddingRef? in
      guard let data = text.data(using: .utf8), !data.isEmpty else { return nil }
      return try decoder.decode(PerceptionEmbeddingRef.self, from: data)
    }
    let label = SensitivityLabel(rawValue: try columnText(statement, 8)) ?? .sensitive
    return AudioMemoryRecord(
      id: try columnText(statement, 0),
      capturedAt: try columnText(statement, 1),
      periodStart: try columnText(statement, 2),
      periodEnd: try columnText(statement, 3),
      transcript: try columnText(statement, 4),
      summary: try columnText(statement, 5),
      retentionClass: try columnText(statement, 6),
      expiresAt: try optionalColumnText(statement, 7),
      sensitivityLabel: label,
      embedding: embedding
    )
  }

  private func execute(_ sql: String, bindings: [SQLiteBinding] = []) throws {
    try withStatement(sql, bindings: bindings) { statement in
      let result = sqlite3_step(statement)
      guard result == SQLITE_DONE || result == SQLITE_ROW else {
        throw ScreenMemoryStoreError.stepFailed(errorMessage)
      }
    }
  }

  private func withTransaction(_ body: () throws -> Void) throws {
    try execute("BEGIN IMMEDIATE")
    do {
      try body()
      try execute("COMMIT")
    } catch {
      try? execute("ROLLBACK")
      throw error
    }
  }

  private func ensureColumn(table: String, column: String, definition: String) throws {
    let columns = try withStatement("PRAGMA table_info(\(table))", bindings: []) { statement in
      var names = Set<String>()
      while true {
        let result = sqlite3_step(statement)
        if result == SQLITE_ROW {
          names.insert(try columnText(statement, 1))
        } else if result == SQLITE_DONE {
          return names
        } else {
          throw ScreenMemoryStoreError.stepFailed(errorMessage)
        }
      }
    }
    guard !columns.contains(column) else { return }
    try execute("ALTER TABLE \(table) ADD COLUMN \(column) \(definition)")
  }

  private func withStatement<T>(
    _ sql: String,
    bindings: [SQLiteBinding],
    body: (OpaquePointer) throws -> T
  ) throws -> T {
    guard let db else { throw ScreenMemoryStoreError.closed }
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
      throw ScreenMemoryStoreError.prepareFailed(errorMessage)
    }
    defer { sqlite3_finalize(statement) }
    try bind(bindings, to: statement)
    return try body(statement)
  }

  private func bind(_ bindings: [SQLiteBinding], to statement: OpaquePointer) throws {
    for (index, binding) in bindings.enumerated() {
      let position = Int32(index + 1)
      let result: Int32
      switch binding {
      case .text(let value):
        result = sqlite3_bind_text(statement, position, value, -1, SQLITE_TRANSIENT)
      case .int(let value):
        result = sqlite3_bind_int(statement, position, Int32(clamping: value))
      case .blob(let value):
        result = value.withUnsafeBytes { raw in
          sqlite3_bind_blob(statement, position, raw.baseAddress, Int32(raw.count), SQLITE_TRANSIENT)
        }
      case .null:
        result = sqlite3_bind_null(statement, position)
      }
      guard result == SQLITE_OK else {
        throw ScreenMemoryStoreError.stepFailed(errorMessage)
      }
    }
  }

  private func columnText(_ statement: OpaquePointer, _ index: Int32) throws -> String {
    guard let pointer = sqlite3_column_text(statement, index) else {
      throw ScreenMemoryStoreError.invalidText
    }
    return String(cString: pointer)
  }

  private func optionalColumnText(_ statement: OpaquePointer, _ index: Int32) throws -> String? {
    guard sqlite3_column_type(statement, index) != SQLITE_NULL else { return nil }
    return try columnText(statement, index)
  }

  private func columnBlob(_ statement: OpaquePointer, _ index: Int32) -> Data? {
    guard sqlite3_column_type(statement, index) != SQLITE_NULL,
          let pointer = sqlite3_column_blob(statement, index) else { return nil }
    let count = Int(sqlite3_column_bytes(statement, index))
    guard count > 0 else { return nil }
    return Data(bytes: pointer, count: count)
  }

  private func searchTerms(_ query: String) -> [String] {
    query
      .lowercased()
      .split { !$0.isLetter && !$0.isNumber }
      .map(String.init)
      .filter { !$0.isEmpty }
  }

  private static func defaultExpiry(for capturedAt: String) -> String {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let capturedDate = fractional.date(from: capturedAt)
      ?? ISO8601DateFormatter().date(from: capturedAt)
      ?? Date()
    return ScreenMemoryRetentionPeriod.sevenDays.expiryDate(for: capturedDate).protocolTimestamp
  }

  private func captureError(_ body: () throws -> Void) {
    do {
      try body()
      lastError = nil
    } catch let error as ScreenMemoryStoreError {
      lastError = error
    } catch {
      lastError = .stepFailed(error.localizedDescription)
    }
  }

  private func captureError<T>(default defaultValue: T, _ body: () throws -> T) -> T {
    do {
      let value = try body()
      lastError = nil
      return value
    } catch let error as ScreenMemoryStoreError {
      lastError = error
      return defaultValue
    } catch {
      lastError = .stepFailed(error.localizedDescription)
      return defaultValue
    }
  }

  private var errorMessage: String {
    guard let db else { return "database closed" }
    return String(cString: sqlite3_errmsg(db))
  }
}

enum ScreenMemoryVideoChunkState: String {
  case active
  case finalizing
  case finalized
}

struct ScreenMemoryVideoRecoveryCandidate {
  let chunkID: ScreenMemoryVideoChunkID
  let state: ScreenMemoryVideoChunkState
  let expectedSampleCount: Int
}

struct PersistedScreenMemoryVideoFrame {
  let recordID: ScreenMemoryRecordID
  let capturedAt: String
  let appBundleID: String
  let appName: String
  let windowTitle: String
  let location: ScreenMemoryVideoFrameLocation

  func publicFrame(imageData: Data) -> ScreenMemoryVideoFrame {
    ScreenMemoryVideoFrame(
      recordID: recordID,
      capturedAt: capturedAt,
      appBundleID: appBundleID,
      appName: appName,
      windowTitle: windowTitle,
      imageData: imageData
    )
  }
}

private enum SQLiteBinding {
  case text(String)
  case int(Int)
  case blob(Data)
  case null
}

private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

public struct LocalEmbeddingService {
  public let modelId: String
  public let dim: Int

  public init(modelId: String = "intentive-local-hash-v1", dim: Int = 8) {
    self.modelId = modelId
    self.dim = dim
  }

  public func embed(_ text: String) throws -> PerceptionEmbeddingRef {
    let scalars = Array(text.unicodeScalars)
    var vector = Array(repeating: 0.0, count: dim)
    guard !scalars.isEmpty else {
      return try PerceptionEmbeddingRef(modelId: modelId, dim: dim, vector: vector)
    }
    for (index, scalar) in scalars.enumerated() {
      let bucket = index % dim
      vector[bucket] += Double(Int(scalar.value % 97)) / 97.0
    }
    let magnitude = sqrt(vector.reduce(0) { $0 + ($1 * $1) })
    if magnitude > 0 {
      vector = vector.map { $0 / magnitude }
    }
    return try PerceptionEmbeddingRef(modelId: modelId, dim: dim, vector: vector)
  }
}

public struct ScreenMemoryRetentionPolicy {
  public var excludedApps: Set<String>
  public var defaultRetentionClass: String

  public init(excludedApps: Set<String> = [], defaultRetentionClass: String = "screen_memory_7d") {
    self.excludedApps = excludedApps
    self.defaultRetentionClass = defaultRetentionClass
  }

  public func allows(appName: String) -> Bool {
    !excludedApps.contains(appName)
  }
}
