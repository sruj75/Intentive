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
    retentionClass: String = "screen_memory_30d",
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
  public var sensitivityLabel: SensitivityLabel
  public var embedding: PerceptionEmbeddingRef?

  public init(
    id: String,
    capturedAt: String,
    periodStart: String,
    periodEnd: String,
    transcript: String,
    summary: String,
    retentionClass: String = "audio_memory_30d",
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
    let embeddingJSON = try record.embedding.map { embedding in
      String(data: try encoder.encode(embedding), encoding: .utf8) ?? ""
    }
    let ocrBlocksJSON = String(data: try encoder.encode(record.ocrBlocks), encoding: .utf8) ?? "[]"
    let perceptualHash = record.perceptualHash.map { String(format: "%016llx", $0) }
    try execute(
      """
      INSERT INTO screen_memory_records (
        id, captured_at, app_bundle_id, app_name, window_title, summary, ocr_text,
        ocr_blocks_json, perceptual_hash, retention_class, sensitivity_label, embedding_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        sensitivity_label = excluded.sensitivity_label,
        embedding_json = excluded.embedding_json
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
        .text(record.sensitivityLabel.rawValue),
        embeddingJSON.map(SQLiteBinding.text) ?? .null,
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

  public func recentRecords(limit: Int) throws -> [ScreenMemoryRecord] {
    try queryRecords(
      """
      SELECT id, captured_at, app_bundle_id, app_name, window_title, summary, ocr_text,
             ocr_blocks_json, perceptual_hash, retention_class, sensitivity_label, embedding_json
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
             records.sensitivity_label, records.embedding_json
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
             ocr_blocks_json, perceptual_hash, retention_class, sensitivity_label, embedding_json
      FROM screen_memory_records
      WHERE id = ?
      LIMIT 1
      """,
      bindings: [.text(id)]
    ).first
  }

  public func addAudioMemoryRecord(_ record: AudioMemoryRecord) throws {
    let embeddingJSON = try record.embedding.map { embedding in
      String(data: try encoder.encode(embedding), encoding: .utf8) ?? ""
    }
    try execute(
      """
      INSERT INTO audio_memory_records (
        id, captured_at, period_start, period_end, transcript, summary,
        retention_class, sensitivity_label, embedding_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        captured_at = excluded.captured_at,
        period_start = excluded.period_start,
        period_end = excluded.period_end,
        transcript = excluded.transcript,
        summary = excluded.summary,
        retention_class = excluded.retention_class,
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
        .text(record.sensitivityLabel.rawValue),
        embeddingJSON.map(SQLiteBinding.text) ?? .null,
      ]
    )
  }

  public func recentAudioMemoryRecords(limit: Int) throws -> [AudioMemoryRecord] {
    try withStatement(
      """
      SELECT id, captured_at, period_start, period_end, transcript, summary,
             retention_class, sensitivity_label, embedding_json
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
        sensitivity_label TEXT NOT NULL,
        embedding_json TEXT
      )
      """
    )
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
    let embeddingText = try optionalColumnText(statement, 11)
    let embedding = try embeddingText.flatMap { text -> PerceptionEmbeddingRef? in
      guard let data = text.data(using: .utf8), !data.isEmpty else { return nil }
      return try decoder.decode(PerceptionEmbeddingRef.self, from: data)
    }
    let label = SensitivityLabel(rawValue: try columnText(statement, 10)) ?? .sensitive
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
      sensitivityLabel: label,
      embedding: embedding
    )
  }

  private func decodeAudioMemoryRecord(_ statement: OpaquePointer) throws -> AudioMemoryRecord {
    let embeddingText = try optionalColumnText(statement, 8)
    let embedding = try embeddingText.flatMap { text -> PerceptionEmbeddingRef? in
      guard let data = text.data(using: .utf8), !data.isEmpty else { return nil }
      return try decoder.decode(PerceptionEmbeddingRef.self, from: data)
    }
    let label = SensitivityLabel(rawValue: try columnText(statement, 7)) ?? .sensitive
    return AudioMemoryRecord(
      id: try columnText(statement, 0),
      capturedAt: try columnText(statement, 1),
      periodStart: try columnText(statement, 2),
      periodEnd: try columnText(statement, 3),
      transcript: try columnText(statement, 4),
      summary: try columnText(statement, 5),
      retentionClass: try columnText(statement, 6),
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
        result = sqlite3_bind_int(statement, position, Int32(value))
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

  private func searchTerms(_ query: String) -> [String] {
    query
      .lowercased()
      .split { !$0.isLetter && !$0.isNumber }
      .map(String.init)
      .filter { !$0.isEmpty }
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

private enum SQLiteBinding {
  case text(String)
  case int(Int)
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
