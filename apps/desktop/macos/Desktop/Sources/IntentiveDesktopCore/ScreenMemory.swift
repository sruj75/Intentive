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

public protocol PerceptionEventOutbox: AnyObject {
  func enqueuePerceptionEvent(_ event: PerceptionEvent) throws
  func pendingPerceptionEvents(limit: Int) throws -> [PerceptionEvent]
  func removePerceptionEvent(eventId: String) throws
}

public final class InMemoryScreenMemoryStore: ScreenMemoryStore, AudioMemoryStore, PerceptionEventOutbox {
  private var records: [ScreenMemoryRecord] = []
  private var audioRecords: [AudioMemoryRecord] = []
  private var perceptionOutbox: [PerceptionEvent] = []

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
    if let index = perceptionOutbox.firstIndex(where: { $0.eventId == event.eventId }) {
      perceptionOutbox[index] = event
    } else {
      perceptionOutbox.append(event)
    }
  }

  public func pendingPerceptionEvents(limit: Int) throws -> [PerceptionEvent] {
    Array(perceptionOutbox.prefix(max(0, limit)))
  }

  public func removePerceptionEvent(eventId: String) throws {
    perceptionOutbox.removeAll { $0.eventId == eventId }
  }
}

public final class SwitchableScreenMemoryStore: ScreenMemoryStore, AudioMemoryStore, PerceptionEventOutbox {
  private var store: ScreenMemoryStore

  public init(_ store: ScreenMemoryStore) {
    self.store = store
  }

  public var activeArchive: ScreenMemoryArchive? {
    store as? ScreenMemoryArchive
  }

  public func replace(with store: ScreenMemoryStore) {
    carryPendingPerceptionEvents(to: store)
    self.store = store
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

  public func pendingPerceptionEvents(limit: Int) throws -> [PerceptionEvent] {
    try (store as? PerceptionEventOutbox)?.pendingPerceptionEvents(limit: limit) ?? []
  }

  public func removePerceptionEvent(eventId: String) throws {
    try (store as? PerceptionEventOutbox)?.removePerceptionEvent(eventId: eventId)
  }

  private func carryPendingPerceptionEvents(to replacement: ScreenMemoryStore) {
    guard
      let currentOutbox = store as? PerceptionEventOutbox,
      let replacementOutbox = replacement as? PerceptionEventOutbox,
      let pending = try? currentOutbox.pendingPerceptionEvents(limit: 10_000)
    else {
      return
    }

    for event in pending {
      do {
        try replacementOutbox.enqueuePerceptionEvent(event)
        try currentOutbox.removePerceptionEvent(eventId: event.eventId)
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

  func commitDeletionPlan(_ plan: ScreenMemoryDeletionPlan) throws {
    try withTransaction {
      if plan.clearsAll {
        try execute("DELETE FROM screen_memory_records_fts")
        try execute("DELETE FROM screen_memory_records")
        try execute("DELETE FROM screen_memory_video_chunks")
        try execute("DELETE FROM audio_memory_records")
        try execute("DELETE FROM perception_event_outbox")
      } else {
        for recordID in plan.recordIDs {
          try execute("DELETE FROM screen_memory_records_fts WHERE id = ?", bindings: [.text(recordID)])
          try execute("DELETE FROM screen_memory_records WHERE id = ?", bindings: [.text(recordID)])
          try execute(
            "DELETE FROM perception_event_outbox WHERE event_json LIKE ?",
            bindings: [.text("%\(recordID)%")]
          )
        }
        for audioID in plan.audioRecordIDs {
          try execute("DELETE FROM audio_memory_records WHERE id = ?", bindings: [.text(audioID)])
          try execute(
            "DELETE FROM perception_event_outbox WHERE event_json LIKE ?",
            bindings: [.text("%\(audioID)%")]
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
    let encoded = try ProtocolEventCodec.encode(event)
    guard let encodedText = String(data: encoded, encoding: .utf8) else {
      throw ScreenMemoryStoreError.invalidText
    }
    try execute(
      """
      INSERT INTO perception_event_outbox (event_id, event_json, enqueued_at)
      VALUES (?, ?, ?)
      ON CONFLICT(event_id) DO UPDATE SET
        event_json = excluded.event_json,
        enqueued_at = excluded.enqueued_at
      """,
      bindings: [
        .text(event.eventId),
        .text(encodedText),
        .text(Date().protocolTimestamp),
      ]
    )
  }

  public func pendingPerceptionEvents(limit: Int) throws -> [PerceptionEvent] {
    try withStatement(
      """
      SELECT event_json
      FROM perception_event_outbox
      ORDER BY enqueued_at ASC, event_id ASC
      LIMIT ?
      """,
      bindings: [.int(max(0, limit))]
    ) { statement in
      var events: [PerceptionEvent] = []
      while true {
        let result = sqlite3_step(statement)
        if result == SQLITE_ROW {
          let eventJSON = try columnText(statement, 0)
          guard let eventData = eventJSON.data(using: .utf8) else {
            throw ScreenMemoryStoreError.invalidText
          }
          events.append(try ProtocolEventCodec.decodePerceptionEvent(eventData))
        } else if result == SQLITE_DONE {
          return events
        } else {
          throw ScreenMemoryStoreError.stepFailed(errorMessage)
        }
      }
    }
  }

  public func removePerceptionEvent(eventId: String) throws {
    try execute("DELETE FROM perception_event_outbox WHERE event_id = ?", bindings: [.text(eventId)])
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
    try execute(
      """
      CREATE TABLE IF NOT EXISTS perception_event_outbox (
        event_id TEXT PRIMARY KEY,
        event_json TEXT NOT NULL,
        enqueued_at TEXT NOT NULL
      )
      """
    )
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

  public init(excludedApps: Set<String> = [], defaultRetentionClass: String = "screen_memory_30d") {
    self.excludedApps = excludedApps
    self.defaultRetentionClass = defaultRetentionClass
  }

  public func allows(appName: String) -> Bool {
    !excludedApps.contains(appName)
  }
}
