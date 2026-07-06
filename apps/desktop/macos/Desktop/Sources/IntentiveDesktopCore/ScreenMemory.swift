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

public final class InMemoryScreenMemoryStore: ScreenMemoryStore {
  private var records: [ScreenMemoryRecord] = []

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

public final class SQLiteScreenMemoryStore: ScreenMemoryStore {
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
    bundleIdentifier: String = "com.intentive.desktop"
  ) throws -> URL {
    let base = try fileManager.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    let directory = base.appendingPathComponent(bundleIdentifier, isDirectory: true)
    try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory.appendingPathComponent("screen-memory.sqlite")
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
