import Foundation

// MARK: - Updates

public enum UpdatePhase: String, Codable, Equatable, Sendable {
  case idle
  case checking
  case downloading
  case downloadedAwaitingInstall
  case installing
  case failed
}

public struct UpdateSnapshot: Codable, Equatable, Sendable {
  public var phase: UpdatePhase
  public var availableVersion: String?
  public var failureMessage: String?
  public var lastCheckAt: Date?

  public init(
    phase: UpdatePhase = .idle,
    availableVersion: String? = nil,
    failureMessage: String? = nil,
    lastCheckAt: Date? = nil
  ) {
    self.phase = phase
    self.availableVersion = availableVersion
    self.failureMessage = failureMessage
    self.lastCheckAt = lastCheckAt
  }
}

public enum UpdateDriverEvent: Equatable, Sendable {
  case noUpdate
  case downloadStarted(version: String)
  case downloaded(version: String)
  case installed(version: String)
  case failed(message: String)
}

public protocol UpdateDriver: AnyObject {
  var eventHandler: ((UpdateDriverEvent) -> Void)? { get set }
  func checkForUpdates(manual: Bool)
  func installDownloadedUpdate()
}

public protocol UpdaterClient: AnyObject {
  var snapshot: UpdateSnapshot { get }
  var onSnapshotChange: ((UpdateSnapshot) -> Void)? { get set }
  func checkForUpdates(manual: Bool)
  func resumeDeferredInstall()
}

public protocol UpdateStateStore: AnyObject {
  func load() -> UpdateSnapshot?
  func save(_ snapshot: UpdateSnapshot)
}

public final class UserDefaultsUpdateStateStore: UpdateStateStore {
  private let defaults: UserDefaults
  private let key: String

  public init(
    defaults: UserDefaults = .standard,
    key: String = "intentive.desktop.public-release.update-state"
  ) {
    self.defaults = defaults
    self.key = key
  }

  public func load() -> UpdateSnapshot? {
    guard let data = defaults.data(forKey: key) else { return nil }
    return try? JSONDecoder().decode(UpdateSnapshot.self, from: data)
  }

  public func save(_ snapshot: UpdateSnapshot) {
    guard let data = try? JSONEncoder().encode(snapshot) else { return }
    defaults.set(data, forKey: key)
  }
}

public final class InMemoryUpdateStateStore: UpdateStateStore {
  public var snapshot: UpdateSnapshot?
  public init(snapshot: UpdateSnapshot? = nil) { self.snapshot = snapshot }
  public func load() -> UpdateSnapshot? { snapshot }
  public func save(_ snapshot: UpdateSnapshot) { self.snapshot = snapshot }
}

/// Framework-neutral release updater. Sparkle is adapted through `UpdateDriver`;
/// the persisted snapshot keeps failures and deferred downloads visible after relaunch.
public final class PublicReleaseUpdater: UpdaterClient {
  public private(set) var snapshot: UpdateSnapshot
  public var onSnapshotChange: ((UpdateSnapshot) -> Void)?

  private let driver: any UpdateDriver
  private let stateStore: any UpdateStateStore
  private let now: () -> Date

  public init(
    driver: any UpdateDriver,
    stateStore: any UpdateStateStore = UserDefaultsUpdateStateStore(),
    now: @escaping () -> Date = Date.init
  ) {
    self.driver = driver
    self.stateStore = stateStore
    self.now = now
    snapshot = stateStore.load() ?? UpdateSnapshot()
    driver.eventHandler = { [weak self] event in self?.receive(event) }
  }

  public func checkForUpdates(manual: Bool) {
    setSnapshot(
      UpdateSnapshot(
        phase: .checking,
        availableVersion: snapshot.availableVersion,
        failureMessage: snapshot.failureMessage,
        lastCheckAt: now()
      )
    )
    driver.checkForUpdates(manual: manual)
  }

  public func resumeDeferredInstall() {
    guard snapshot.phase == .downloadedAwaitingInstall else { return }
    var next = snapshot
    next.phase = .installing
    next.failureMessage = nil
    setSnapshot(next)
    driver.installDownloadedUpdate()
  }

  private func receive(_ event: UpdateDriverEvent) {
    switch event {
    case .noUpdate:
      setSnapshot(UpdateSnapshot(phase: .idle, lastCheckAt: now()))
    case .downloadStarted(let version):
      setSnapshot(UpdateSnapshot(phase: .downloading, availableVersion: version, lastCheckAt: now()))
    case .downloaded(let version):
      setSnapshot(
        UpdateSnapshot(
          phase: .downloadedAwaitingInstall,
          availableVersion: version,
          lastCheckAt: snapshot.lastCheckAt
        )
      )
    case .installed:
      setSnapshot(UpdateSnapshot(phase: .idle, lastCheckAt: snapshot.lastCheckAt))
    case .failed(let message):
      setSnapshot(
        UpdateSnapshot(
          phase: .failed,
          availableVersion: snapshot.availableVersion,
          failureMessage: message,
          lastCheckAt: snapshot.lastCheckAt
        )
      )
    }
  }

  private func setSnapshot(_ next: UpdateSnapshot) {
    snapshot = next
    stateStore.save(next)
    onSnapshotChange?(next)
  }
}

// MARK: - Telemetry

public enum TelemetryValue: Codable, Equatable, Sendable {
  case string(String)
  case integer(Int)
  case double(Double)
  case boolean(Bool)
}

public enum TelemetryEventName: String, Codable, Equatable, Sendable {
  case appLaunched = "app_launched"
  case updateCheckStarted = "update_check_started"
  case updateCheckCompleted = "update_check_completed"
  case updateDownloaded = "update_downloaded"
  case updateInstalled = "update_installed"
  case settingChanged = "setting_changed"
  case diagnosticsExported = "diagnostics_exported"
  case diagnosticsCleared = "diagnostics_cleared"
  case coachingWindowStarted = "coaching_window_started"
  case coachingWindowEnded = "coaching_window_ended"
  case coachingOrientationShown = "coaching_orientation_shown"
  case coachingInterventionShown = "coaching_intervention_shown"
  case coachingFirstReply = "coaching_first_reply"
  case coachingReplySent = "coaching_reply_sent"
  case coachingPaused = "coaching_paused"
  case coachingResumed = "coaching_resumed"
}

public struct TelemetryEvent: Codable, Equatable, Sendable {
  public let name: TelemetryEventName
  public let properties: [String: TelemetryValue]

  public init(name: TelemetryEventName, properties: [String: TelemetryValue] = [:]) {
    self.name = name
    self.properties = properties
  }
}

public enum TelemetryErrorCategory: String, Codable, Equatable, Sendable {
  case application
  case update
  case capture
  case runtime
  case storage
}

public enum TelemetryErrorCode: String, Codable, Equatable, Sendable {
  case uncleanExit = "unclean_exit"
  case updateFailed = "update_failed"
  case signatureFailed = "signature_failed"
  case captureFailed = "capture_failed"
  case runtimeFailed = "runtime_failed"
  case storageFailed = "storage_failed"
}

public struct TelemetryError: Codable, Equatable, Sendable {
  public let category: TelemetryErrorCategory
  public let code: TelemetryErrorCode
  public let metadata: [String: TelemetryValue]

  public init(
    category: TelemetryErrorCategory,
    code: TelemetryErrorCode,
    metadata: [String: TelemetryValue] = [:]
  ) {
    self.category = category
    self.code = code
    self.metadata = metadata
  }
}

public protocol TelemetryClient: AnyObject {
  func track(_ event: TelemetryEvent)
  func captureError(_ error: TelemetryError)
  func flush()
}

public final class NoopTelemetryClient: TelemetryClient {
  public init() {}
  public func track(_ event: TelemetryEvent) {}
  public func captureError(_ error: TelemetryError) {}
  public func flush() {}
}

/// A deny-by-default privacy boundary for both PostHog product events and Sentry errors.
/// User content and identifiers are not valid telemetry concepts in this API.
public final class PrivacyFilteringTelemetryClient: TelemetryClient {
  private static let allowedKeys: Set<String> = [
    "result", "duration_ms", "phase", "reason", "setting", "enabled",
    "version", "build", "source", "permission", "state", "retry_count",
  ]
  private static let forbiddenFragments = [
    "screenshot", "ocr", "window", "title", "transcript", "conversation",
    "message", "token", "path", "file", "audio", "image", "prompt", "text",
  ]

  private let downstream: any TelemetryClient
  private let analyticsConsent: () -> Bool

  public init(
    downstream: any TelemetryClient,
    analyticsConsent: @escaping () -> Bool
  ) {
    self.downstream = downstream
    self.analyticsConsent = analyticsConsent
  }

  public func track(_ event: TelemetryEvent) {
    guard analyticsConsent() else { return }
    downstream.track(
      TelemetryEvent(name: event.name, properties: sanitize(event.properties))
    )
  }

  public func captureError(_ error: TelemetryError) {
    downstream.captureError(
      TelemetryError(
        category: error.category,
        code: error.code,
        metadata: sanitize(error.metadata)
      )
    )
  }

  public func flush() { downstream.flush() }

  private func sanitize(_ values: [String: TelemetryValue]) -> [String: TelemetryValue] {
    values.filter { key, value in
      let normalized = key.lowercased()
      guard Self.allowedKeys.contains(normalized) else { return false }
      guard !Self.forbiddenFragments.contains(where: normalized.contains) else { return false }
      if case .string(let string) = value {
        guard isOperationalLabel(string) else { return false }
      }
      return true
    }
  }

  private func isOperationalLabel(_ value: String) -> Bool {
    guard !value.isEmpty, value.count <= 80 else { return false }
    return value.allSatisfy {
      $0.isLetter || $0.isNumber || $0 == "_" || $0 == "-" || $0 == "." || $0 == "+"
    }
  }
}

// MARK: - Persistent diagnostics

public enum DiagnosticLevel: String, Codable, Equatable, Sendable {
  case debug
  case info
  case warning
  case error
}

public struct DiagnosticEntry: Codable, Equatable, Sendable {
  public let timestamp: Date
  public let level: DiagnosticLevel
  public let category: String
  public let message: String
  public let metadata: [String: TelemetryValue]

  public init(
    timestamp: Date = Date(),
    level: DiagnosticLevel,
    category: String,
    message: String,
    metadata: [String: TelemetryValue] = [:]
  ) {
    self.timestamp = timestamp
    self.level = level
    self.category = category
    self.message = message
    self.metadata = metadata
  }
}

public protocol DiagnosticsStore: AnyObject {
  func append(_ entry: DiagnosticEntry) throws
  func export(to destination: URL) throws -> URL
  func clear() throws
}

public final class PersistentDiagnosticsStore: DiagnosticsStore {
  private let directory: URL
  private let now: () -> Date
  private let maximumAge: TimeInterval
  private let maximumBytes: Int
  private let maximumFileBytes: Int
  private let fileManager: FileManager
  private let encoder: JSONEncoder
  private var activeFile: URL?

  public init(
    directory: URL,
    now: @escaping () -> Date = Date.init,
    maximumAge: TimeInterval = 14 * 24 * 60 * 60,
    maximumBytes: Int = 100 * 1_024 * 1_024,
    maximumFileBytes: Int = 5 * 1_024 * 1_024,
    fileManager: FileManager = .default
  ) throws {
    self.directory = directory
    self.now = now
    self.maximumAge = maximumAge
    self.maximumBytes = maximumBytes
    self.maximumFileBytes = maximumFileBytes
    self.fileManager = fileManager
    encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    try rotate()
  }

  public func append(_ entry: DiagnosticEntry) throws {
    var data = try encoder.encode(entry)
    data.append(0x0A)
    let file = try writableFile(forAdditionalBytes: data.count)
    if !fileManager.fileExists(atPath: file.path) {
      try data.write(to: file, options: .atomic)
    } else {
      let handle = try FileHandle(forWritingTo: file)
      defer { try? handle.close() }
      try handle.seekToEnd()
      try handle.write(contentsOf: data)
    }
    try rotate()
  }

  public func retainedFiles() throws -> [URL] {
    try diagnosticFiles().sorted {
      modificationDate(of: $0) < modificationDate(of: $1)
    }
  }

  public func rotate() throws {
    let cutoff = now().addingTimeInterval(-maximumAge)
    var files = try retainedFiles()
    for file in files where modificationDate(of: file) < cutoff {
      try? fileManager.removeItem(at: file)
      if activeFile == file { activeFile = nil }
    }
    files = try retainedFiles()
    var bytes = try files.reduce(0) { $0 + (try fileSize(of: $1)) }
    for file in files where bytes > maximumBytes {
      bytes -= try fileSize(of: file)
      try fileManager.removeItem(at: file)
      if activeFile == file { activeFile = nil }
    }
  }

  public func export(to destination: URL) throws -> URL {
    try rotate()
    let export = destination.appendingPathComponent(
      "Intentive-Diagnostics-\(Int(now().timeIntervalSince1970))",
      isDirectory: true
    )
    if fileManager.fileExists(atPath: export.path) { try fileManager.removeItem(at: export) }
    try fileManager.createDirectory(at: export, withIntermediateDirectories: true)
    for file in try retainedFiles() {
      try fileManager.copyItem(at: file, to: export.appendingPathComponent(file.lastPathComponent))
    }
    return export
  }

  public func clear() throws {
    for file in try diagnosticFiles() { try fileManager.removeItem(at: file) }
    activeFile = nil
  }

  private func writableFile(forAdditionalBytes bytes: Int) throws -> URL {
    if let activeFile,
      fileManager.fileExists(atPath: activeFile.path),
      try fileSize(of: activeFile) + bytes <= maximumFileBytes
    {
      return activeFile
    }
    let next = directory.appendingPathComponent(
      "intentive-\(Int(now().timeIntervalSince1970))-\(UUID().uuidString).jsonl"
    )
    activeFile = next
    return next
  }

  private func diagnosticFiles() throws -> [URL] {
    try fileManager.contentsOfDirectory(
      at: directory,
      includingPropertiesForKeys: [.isRegularFileKey, .contentModificationDateKey, .fileSizeKey],
      options: [.skipsHiddenFiles]
    ).filter { url in
      url.pathExtension == "jsonl"
        && ((try? url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) ?? false)
    }
  }

  private func fileSize(of url: URL) throws -> Int {
    try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
  }

  private func modificationDate(of url: URL) -> Date {
    (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate)
      ?? .distantPast
  }
}
