import Foundation
import SQLite3

public struct ScreenMemoryRecord: Codable, Equatable, Identifiable, Sendable {
  public var id: String
  public var capturedAt: String
  public var appName: String
  public var windowTitle: String
  public var summary: String
  public var ocrText: String
  public var retentionClass: String
  public var sensitivityLabel: SensitivityLabel
  public var embedding: PerceptionEmbeddingRef?

  public init(
    id: String,
    capturedAt: String,
    appName: String,
    windowTitle: String,
    summary: String,
    ocrText: String,
    retentionClass: String = "screen_memory_30d",
    sensitivityLabel: SensitivityLabel = .normal,
    embedding: PerceptionEmbeddingRef? = nil
  ) {
    self.id = id
    self.capturedAt = capturedAt
    self.appName = appName
    self.windowTitle = windowTitle
    self.summary = summary
    self.ocrText = ocrText
    self.retentionClass = retentionClass
    self.sensitivityLabel = sensitivityLabel
    self.embedding = embedding
  }
}

public struct ScreenMemorySearchResult: Equatable, Sendable {
  public var record: ScreenMemoryRecord
  public var rank: Int
}

public protocol ScreenMemoryStore: AnyObject {
  func add(_ record: ScreenMemoryRecord)
  func recent(limit: Int) -> [ScreenMemoryRecord]
  func search(_ query: String, limit: Int) -> [ScreenMemorySearchResult]
  func delete(id: String)
}

public protocol PerceptionEventOutbox: AnyObject {
  func enqueuePerceptionEvent(_ event: PerceptionEvent) throws
  func pendingPerceptionEvents(limit: Int) throws -> [PerceptionEvent]
  func removePerceptionEvent(eventId: String) throws
}

public struct LegacyScreenMemoryImportCheckpoint: Equatable, Sendable {
  public var sourceIdentifier: String
  public var sourceFingerprint: String
  public var importedAt: String
  public var importedCount: Int
  public var skippedCount: Int

  public init(
    sourceIdentifier: String,
    sourceFingerprint: String,
    importedAt: String,
    importedCount: Int,
    skippedCount: Int
  ) {
    self.sourceIdentifier = sourceIdentifier
    self.sourceFingerprint = sourceFingerprint
    self.importedAt = importedAt
    self.importedCount = importedCount
    self.skippedCount = skippedCount
  }
}

public protocol LegacyScreenMemoryImportCheckpointStore: AnyObject {
  func legacyImportCheckpoint(for sourceIdentifier: String) throws -> LegacyScreenMemoryImportCheckpoint?
  func saveLegacyImportCheckpoint(_ checkpoint: LegacyScreenMemoryImportCheckpoint) throws
}

public final class InMemoryScreenMemoryStore: ScreenMemoryStore, PerceptionEventOutbox {
  private var records: [ScreenMemoryRecord] = []
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

public final class SwitchableScreenMemoryStore: ScreenMemoryStore, PerceptionEventOutbox {
  private var store: ScreenMemoryStore

  public init(_ store: ScreenMemoryStore) {
    self.store = store
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

public final class SQLiteScreenMemoryStore: ScreenMemoryStore, LegacyScreenMemoryImportCheckpointStore,
  PerceptionEventOutbox
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
    userID: String? = nil,
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

  public func addRecord(_ record: ScreenMemoryRecord) throws {
    let embeddingJSON = try record.embedding.map { embedding in
      String(data: try encoder.encode(embedding), encoding: .utf8) ?? ""
    }
    try execute(
      """
      INSERT INTO screen_memory_records (
        id, captured_at, app_name, window_title, summary, ocr_text,
        retention_class, sensitivity_label, embedding_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        captured_at = excluded.captured_at,
        app_name = excluded.app_name,
        window_title = excluded.window_title,
        summary = excluded.summary,
        ocr_text = excluded.ocr_text,
        retention_class = excluded.retention_class,
        sensitivity_label = excluded.sensitivity_label,
        embedding_json = excluded.embedding_json
      """,
      bindings: [
        .text(record.id),
        .text(record.capturedAt),
        .text(record.appName),
        .text(record.windowTitle),
        .text(record.summary),
        .text(record.ocrText),
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
      SELECT id, captured_at, app_name, window_title, summary, ocr_text,
             retention_class, sensitivity_label, embedding_json
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
      SELECT records.id, records.captured_at, records.app_name, records.window_title,
             records.summary, records.ocr_text, records.retention_class,
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

  public func legacyImportCheckpoint(for sourceIdentifier: String) throws -> LegacyScreenMemoryImportCheckpoint? {
    try withStatement(
      """
      SELECT source_identifier, source_fingerprint, imported_at, imported_count, skipped_count
      FROM legacy_screen_memory_imports
      WHERE source_identifier = ?
      """,
      bindings: [.text(sourceIdentifier)]
    ) { statement in
      let result = sqlite3_step(statement)
      if result == SQLITE_DONE {
        return nil
      }
      guard result == SQLITE_ROW else {
        throw ScreenMemoryStoreError.stepFailed(errorMessage)
      }
      return LegacyScreenMemoryImportCheckpoint(
        sourceIdentifier: try columnText(statement, 0),
        sourceFingerprint: try columnText(statement, 1),
        importedAt: try columnText(statement, 2),
        importedCount: Int(sqlite3_column_int(statement, 3)),
        skippedCount: Int(sqlite3_column_int(statement, 4))
      )
    }
  }

  public func saveLegacyImportCheckpoint(_ checkpoint: LegacyScreenMemoryImportCheckpoint) throws {
    try execute(
      """
      INSERT INTO legacy_screen_memory_imports (
        source_identifier, source_fingerprint, imported_at, imported_count, skipped_count
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(source_identifier) DO UPDATE SET
        source_fingerprint = excluded.source_fingerprint,
        imported_at = excluded.imported_at,
        imported_count = excluded.imported_count,
        skipped_count = excluded.skipped_count
      """,
      bindings: [
        .text(checkpoint.sourceIdentifier),
        .text(checkpoint.sourceFingerprint),
        .text(checkpoint.importedAt),
        .int(checkpoint.importedCount),
        .int(checkpoint.skippedCount),
      ]
    )
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
        app_name TEXT NOT NULL,
        window_title TEXT NOT NULL,
        summary TEXT NOT NULL,
        ocr_text TEXT NOT NULL,
        retention_class TEXT NOT NULL,
        sensitivity_label TEXT NOT NULL,
        embedding_json TEXT
      )
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
    try execute(
      """
      CREATE TABLE IF NOT EXISTS legacy_screen_memory_imports (
        source_identifier TEXT PRIMARY KEY,
        source_fingerprint TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        imported_count INTEGER NOT NULL,
        skipped_count INTEGER NOT NULL
      )
      """
    )
    try execute(
      """
      CREATE TABLE IF NOT EXISTS perception_event_outbox (
        event_id TEXT PRIMARY KEY,
        event_json TEXT NOT NULL,
        enqueued_at TEXT NOT NULL
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
    let embeddingText = try optionalColumnText(statement, 8)
    let embedding = try embeddingText.flatMap { text -> PerceptionEmbeddingRef? in
      guard let data = text.data(using: .utf8), !data.isEmpty else { return nil }
      return try decoder.decode(PerceptionEmbeddingRef.self, from: data)
    }
    let label = SensitivityLabel(rawValue: try columnText(statement, 7)) ?? .sensitive
    return ScreenMemoryRecord(
      id: try columnText(statement, 0),
      capturedAt: try columnText(statement, 1),
      appName: try columnText(statement, 2),
      windowTitle: try columnText(statement, 3),
      summary: try columnText(statement, 4),
      ocrText: try columnText(statement, 5),
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

public struct LegacyScreenMemoryImportResult: Equatable, Sendable {
  public var sourceDatabaseURL: URL?
  public var importedCount: Int
  public var skippedCount: Int
  public var skippedBecauseUnchanged: Bool

  public init(
    sourceDatabaseURL: URL?,
    importedCount: Int,
    skippedCount: Int,
    skippedBecauseUnchanged: Bool = false
  ) {
    self.sourceDatabaseURL = sourceDatabaseURL
    self.importedCount = importedCount
    self.skippedCount = skippedCount
    self.skippedBecauseUnchanged = skippedBecauseUnchanged
  }
}

public enum LegacyScreenMemoryImportError: Error, Equatable, LocalizedError {
  case openFailed(String)
  case missingScreenshotsTable
  case prepareFailed(String)
  case stepFailed(String)
  case invalidText(String)

  public var errorDescription: String? {
    switch self {
    case .openFailed(let message):
      return "Legacy Screen Memory database could not be opened: \(message)"
    case .missingScreenshotsTable:
      return "Legacy Screen Memory database is missing its screenshots table."
    case .prepareFailed(let message):
      return "Legacy Screen Memory import query could not be prepared: \(message)"
    case .stepFailed(let message):
      return "Legacy Screen Memory import query failed: \(message)"
    case .invalidText(let column):
      return "Legacy Screen Memory database returned invalid text for \(column)."
    }
  }
}

public final class LegacyScreenMemoryImporter {
  private let fileManager: FileManager
  private let baseApplicationSupportURL: URL?
  private let embeddingService: LocalEmbeddingService
  private let secretDetector: HardSecretDetector
  private let defaultRetentionClass: String

  public init(
    fileManager: FileManager = .default,
    baseApplicationSupportURL: URL? = nil,
    embeddingService: LocalEmbeddingService = LocalEmbeddingService(),
    secretDetector: HardSecretDetector = HardSecretDetector(),
    defaultRetentionClass: String = "screen_memory_30d"
  ) {
    self.fileManager = fileManager
    self.baseApplicationSupportURL = baseApplicationSupportURL
    self.embeddingService = embeddingService
    self.secretDetector = secretDetector
    self.defaultRetentionClass = defaultRetentionClass
  }

  public func candidateDatabaseURLs(userID: String? = nil) throws -> [URL] {
    let sanitizedUserID = DesktopLocalProfile.sanitizedUserID(userID)
    var candidates = [
      try DesktopLocalProfile.legacyOmiUserSupportURL(
        userID: sanitizedUserID,
        fileManager: fileManager,
        baseApplicationSupportURL: baseApplicationSupportURL
      )
      .appendingPathComponent("omi.db")
    ]

    if sanitizedUserID != DesktopLocalProfile.anonymousUserID {
      candidates.append(
        try DesktopLocalProfile.legacyOmiUserSupportURL(
          userID: DesktopLocalProfile.anonymousUserID,
          fileManager: fileManager,
          baseApplicationSupportURL: baseApplicationSupportURL
        )
        .appendingPathComponent("omi.db")
      )
    }

    candidates.append(
      try DesktopLocalProfile.legacyOmiApplicationSupportURL(
        fileManager: fileManager,
        baseApplicationSupportURL: baseApplicationSupportURL
      )
      .appendingPathComponent("omi.db")
    )

    var seen = Set<String>()
    return candidates.filter { seen.insert($0.standardizedFileURL.path).inserted }
  }

  public func importFirstAvailableSource(
    userID: String? = nil,
    into store: ScreenMemoryStore,
    limit: Int = 2_000
  ) throws -> LegacyScreenMemoryImportResult {
    for databaseURL in try candidateDatabaseURLs(userID: userID) {
      guard fileManager.fileExists(atPath: databaseURL.path) else { continue }
      return try importDatabase(at: databaseURL, into: store, limit: limit)
    }

    return LegacyScreenMemoryImportResult(sourceDatabaseURL: nil, importedCount: 0, skippedCount: 0)
  }

  public func importDatabase(
    at databaseURL: URL,
    into store: ScreenMemoryStore,
    limit: Int = 2_000
  ) throws -> LegacyScreenMemoryImportResult {
    guard limit > 0 else {
      return LegacyScreenMemoryImportResult(sourceDatabaseURL: databaseURL, importedCount: 0, skippedCount: 0)
    }

    let sourceIdentifier = databaseURL.standardizedFileURL.path
    let sourceFingerprint = try fingerprint(for: databaseURL)
    if let checkpointStore = store as? LegacyScreenMemoryImportCheckpointStore,
      let checkpoint = try checkpointStore.legacyImportCheckpoint(for: sourceIdentifier),
      checkpoint.sourceFingerprint == sourceFingerprint
    {
      return LegacyScreenMemoryImportResult(
        sourceDatabaseURL: databaseURL,
        importedCount: 0,
        skippedCount: 0,
        skippedBecauseUnchanged: true
      )
    }

    let rows = try fetchRows(from: databaseURL, limit: limit)
    var importedCount = 0
    var skippedCount = 0

    for row in rows {
      guard row.isIndexed, !row.ocrText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        skippedCount += 1
        continue
      }

      let record = try screenMemoryRecord(from: row)
      if let sqliteStore = store as? SQLiteScreenMemoryStore {
        try sqliteStore.addRecord(record)
      } else {
        store.add(record)
      }
      importedCount += 1
    }

    if let checkpointStore = store as? LegacyScreenMemoryImportCheckpointStore {
      try checkpointStore.saveLegacyImportCheckpoint(
        LegacyScreenMemoryImportCheckpoint(
          sourceIdentifier: sourceIdentifier,
          sourceFingerprint: sourceFingerprint,
          importedAt: Date().protocolTimestamp,
          importedCount: importedCount,
          skippedCount: skippedCount
        )
      )
    }

    return LegacyScreenMemoryImportResult(
      sourceDatabaseURL: databaseURL,
      importedCount: importedCount,
      skippedCount: skippedCount
    )
  }

  private func fingerprint(for databaseURL: URL) throws -> String {
    let attributes = try fileManager.attributesOfItem(atPath: databaseURL.path)
    let size = (attributes[.size] as? NSNumber)?.int64Value ?? 0
    let modified = (attributes[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
    return "size:\(size);modified:\(String(format: "%.6f", modified))"
  }

  private func fetchRows(from databaseURL: URL, limit: Int) throws -> [LegacyScreenMemoryRow] {
    var handle: OpaquePointer?
    let flags = SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX
    guard sqlite3_open_v2(databaseURL.path, &handle, flags, nil) == SQLITE_OK, let handle else {
      let message = handle.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown SQLite open error"
      sqlite3_close(handle)
      throw LegacyScreenMemoryImportError.openFailed(message)
    }
    defer { sqlite3_close(handle) }

    return try withStatement(
      handle,
      """
      SELECT id, timestamp, appName, windowTitle, ocrText, isIndexed
      FROM screenshots
      ORDER BY timestamp DESC
      LIMIT ?
      """,
      bindings: [.int(limit)]
    ) { statement in
      var rows: [LegacyScreenMemoryRow] = []
      while true {
        let result = sqlite3_step(statement)
        if result == SQLITE_ROW {
          rows.append(try decodeRow(statement))
        } else if result == SQLITE_DONE {
          return rows
        } else {
          throw LegacyScreenMemoryImportError.stepFailed(String(cString: sqlite3_errmsg(handle)))
        }
      }
    }
  }

  private func decodeRow(_ statement: OpaquePointer) throws -> LegacyScreenMemoryRow {
    LegacyScreenMemoryRow(
      id: sqlite3_column_int64(statement, 0),
      capturedAt: try legacyTimestamp(statement, 1),
      appName: try columnText(statement, 2, columnName: "appName"),
      windowTitle: try optionalColumnText(statement, 3, columnName: "windowTitle") ?? "",
      ocrText: try optionalColumnText(statement, 4, columnName: "ocrText") ?? "",
      isIndexed: sqlite3_column_int(statement, 5) != 0
    )
  }

  private func screenMemoryRecord(from row: LegacyScreenMemoryRow) throws -> ScreenMemoryRecord {
    let hasSecret = secretDetector.containsSecret(row.windowTitle) || secretDetector.containsSecret(row.ocrText)
    let summary =
      hasSecret
      ? "Secret-like content was detected and suppressed."
      : compactSummary(appName: row.appName, windowTitle: row.windowTitle, text: row.ocrText)

    return ScreenMemoryRecord(
      id: "legacy-screen-memory-screenshot-\(row.id)",
      capturedAt: row.capturedAt,
      appName: row.appName,
      windowTitle: row.windowTitle,
      summary: summary,
      ocrText: row.ocrText,
      retentionClass: defaultRetentionClass,
      sensitivityLabel: hasSecret ? .secretDetected : .normal,
      embedding: hasSecret ? nil : try embeddingService.embed(summary)
    )
  }

  private func compactSummary(appName: String, windowTitle: String, text: String) -> String {
    let trimmed = text
      .split(whereSeparator: \.isWhitespace)
      .prefix(24)
      .joined(separator: " ")
    let title = windowTitle.isEmpty ? "untitled window" : windowTitle
    if trimmed.isEmpty {
      return "Screen Memory captured \(appName), \(title)."
    }
    return "Screen Memory captured \(appName), \(title): \(trimmed)"
  }

  private func legacyTimestamp(_ statement: OpaquePointer, _ index: Int32) throws -> String {
    switch sqlite3_column_type(statement, index) {
    case SQLITE_INTEGER, SQLITE_FLOAT:
      return Date(timeIntervalSince1970: sqlite3_column_double(statement, index)).protocolTimestamp
    case SQLITE_TEXT:
      let raw = try columnText(statement, index, columnName: "timestamp")
      if let timestamp = Self.protocolDate(from: raw) {
        return timestamp.protocolTimestamp
      }
      if let seconds = Double(raw) {
        return Date(timeIntervalSince1970: seconds).protocolTimestamp
      }
      return raw
    default:
      throw LegacyScreenMemoryImportError.invalidText("timestamp")
    }
  }

  private static func protocolDate(from value: String) -> Date? {
    ISO8601DateFormatter.intentiveProtocol.date(from: value)
      ?? internetDateFormatter.date(from: value)
      ?? sqliteDateFormatter.date(from: value)
  }

  private func withStatement<T>(
    _ db: OpaquePointer,
    _ sql: String,
    bindings: [SQLiteBinding],
    body: (OpaquePointer) throws -> T
  ) throws -> T {
    var statement: OpaquePointer?
    let prepareResult = sqlite3_prepare_v2(db, sql, -1, &statement, nil)
    guard prepareResult == SQLITE_OK, let statement else {
      let message = String(cString: sqlite3_errmsg(db))
      if message.lowercased().contains("no such table") {
        throw LegacyScreenMemoryImportError.missingScreenshotsTable
      }
      throw LegacyScreenMemoryImportError.prepareFailed(message)
    }
    defer { sqlite3_finalize(statement) }
    try bind(bindings, to: statement, db: db)
    return try body(statement)
  }

  private func bind(_ bindings: [SQLiteBinding], to statement: OpaquePointer, db: OpaquePointer) throws {
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
        throw LegacyScreenMemoryImportError.stepFailed(String(cString: sqlite3_errmsg(db)))
      }
    }
  }

  private func columnText(_ statement: OpaquePointer, _ index: Int32, columnName: String) throws -> String {
    guard let pointer = sqlite3_column_text(statement, index) else {
      throw LegacyScreenMemoryImportError.invalidText(columnName)
    }
    return String(cString: pointer)
  }

  private func optionalColumnText(_ statement: OpaquePointer, _ index: Int32, columnName: String) throws -> String? {
    guard sqlite3_column_type(statement, index) != SQLITE_NULL else { return nil }
    return try columnText(statement, index, columnName: columnName)
  }

  private static let internetDateFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter
  }()

  private static let sqliteDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd HH:mm:ss.SSS"
    return formatter
  }()
}

private struct LegacyScreenMemoryRow {
  var id: Int64
  var capturedAt: String
  var appName: String
  var windowTitle: String
  var ocrText: String
  var isIndexed: Bool
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
