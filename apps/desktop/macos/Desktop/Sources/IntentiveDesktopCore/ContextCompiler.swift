import Foundation

public struct CapturedFrame: Equatable, Sendable {
  public var id: String
  public var capturedAt: String
  public var appBundleID: String
  public var appName: String
  public var windowTitle: String
  public var ocrText: String
  public var rawFrameBytes: Data?

  public init(
    id: String,
    capturedAt: String,
    appBundleID: String = "",
    appName: String,
    windowTitle: String,
    ocrText: String,
    rawFrameBytes: Data? = nil
  ) {
    self.id = id
    self.capturedAt = capturedAt
    self.appBundleID = appBundleID
    self.appName = appName
    self.windowTitle = windowTitle
    self.ocrText = ocrText
    self.rawFrameBytes = rawFrameBytes
  }

  public func withoutRawFrameBytes() -> CapturedFrame {
    CapturedFrame(
      id: id,
      capturedAt: capturedAt,
      appBundleID: appBundleID,
      appName: appName,
      windowTitle: windowTitle,
      ocrText: ocrText,
      rawFrameBytes: nil
    )
  }
}

public protocol DesktopCaptureSource {
  func captureFrame() async throws -> CapturedFrame
}

public struct DesktopWindowContext: Equatable, Sendable {
  public var appBundleID: String
  public var appName: String
  public var windowTitle: String

  public init(appBundleID: String = "", appName: String, windowTitle: String = "") {
    self.appBundleID = appBundleID
    self.appName = appName
    self.windowTitle = windowTitle
  }
}

public protocol DesktopWindowContextSource: DesktopCaptureSource {
  func activeWindowContext() throws -> DesktopWindowContext
}

public struct AmbientAudioTranscript: Equatable, Sendable {
  public var id: String
  public var capturedAt: String
  public var periodStart: String
  public var periodEnd: String
  public var transcript: String
  public var source: String

  public init(
    id: String,
    capturedAt: String,
    periodStart: String,
    periodEnd: String,
    transcript: String,
    source: String = "microphone"
  ) {
    self.id = id
    self.capturedAt = capturedAt
    self.periodStart = periodStart
    self.periodEnd = periodEnd
    self.transcript = transcript
    self.source = source
  }
}

public struct CompilerSettings: Codable, Equatable, Sendable {
  public var captureEnabled: Bool
  public var excludedApps: Set<String>
  public var contextChangeDebounceSeconds: Double
  public var sameContextMinimumSeconds: Double
  public var messagingFallbackSeconds: Double
  public var ambientAudioCaptureEnabled: Bool

  public init(
    captureEnabled: Bool = true,
    excludedApps: Set<String> = [],
    contextChangeDebounceSeconds: Double = 3,
    sameContextMinimumSeconds: Double = 60,
    messagingFallbackSeconds: Double = 15,
    ambientAudioCaptureEnabled: Bool = true
  ) {
    self.captureEnabled = captureEnabled
    self.excludedApps = excludedApps
    self.contextChangeDebounceSeconds = contextChangeDebounceSeconds
    self.sameContextMinimumSeconds = sameContextMinimumSeconds
    self.messagingFallbackSeconds = messagingFallbackSeconds
    self.ambientAudioCaptureEnabled = ambientAudioCaptureEnabled
  }

  enum CodingKeys: String, CodingKey {
    case captureEnabled
    case excludedApps
    case contextChangeDebounceSeconds
    case sameContextMinimumSeconds
    case messagingFallbackSeconds
    case ambientAudioCaptureEnabled
  }

  public init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.init(
      captureEnabled: try container.decodeIfPresent(Bool.self, forKey: .captureEnabled) ?? true,
      excludedApps: try container.decodeIfPresent(Set<String>.self, forKey: .excludedApps) ?? [],
      contextChangeDebounceSeconds: try container.decodeIfPresent(Double.self, forKey: .contextChangeDebounceSeconds) ?? 3,
      sameContextMinimumSeconds: try container.decodeIfPresent(Double.self, forKey: .sameContextMinimumSeconds) ?? 60,
      messagingFallbackSeconds: try container.decodeIfPresent(Double.self, forKey: .messagingFallbackSeconds) ?? 15,
      ambientAudioCaptureEnabled: try container.decodeIfPresent(Bool.self, forKey: .ambientAudioCaptureEnabled) ?? true
    )
  }

  public func isExcluded(appName: String) -> Bool {
    normalizedExcludedApps.contains(Self.normalizedAppName(appName))
  }

  public var normalizedExcludedApps: Set<String> {
    Set(excludedApps.map(Self.normalizedAppName).filter { !$0.isEmpty })
  }

  public static func normalizedAppName(_ appName: String) -> String {
    appName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }
}

public struct CompiledPerceptionArtifact: Equatable, Sendable {
  public var id: String
  public var artifactType: ArtifactType
  public var capturedAt: String
  public var periodStart: String
  public var periodEnd: String
  public var summary: String
  public var signals: [String: JSONValue]
  public var retentionClass: String
  public var sensitivityLabel: SensitivityLabel
  public var confidence: Double
  public var localRecordRef: String
  public var embedding: PerceptionEmbeddingRef?
  public var rawFrameBytes: Data?

  public init(
    id: String,
    artifactType: ArtifactType,
    capturedAt: String,
    periodStart: String,
    periodEnd: String,
    summary: String,
    signals: [String: JSONValue],
    retentionClass: String,
    sensitivityLabel: SensitivityLabel,
    confidence: Double,
    localRecordRef: String,
    embedding: PerceptionEmbeddingRef?,
    rawFrameBytes: Data? = nil
  ) {
    self.id = id
    self.artifactType = artifactType
    self.capturedAt = capturedAt
    self.periodStart = periodStart
    self.periodEnd = periodEnd
    self.summary = summary
    self.signals = signals
    self.retentionClass = retentionClass
    self.sensitivityLabel = sensitivityLabel
    self.confidence = confidence
    self.localRecordRef = localRecordRef
    self.embedding = embedding
    self.rawFrameBytes = rawFrameBytes
  }
}

public struct HardSecretDetector {
  public init() {}

  public func containsSecret(_ text: String) -> Bool {
    let lowered = text.lowercased()
    return lowered.contains("api_key")
      || lowered.contains("secret=")
      || lowered.contains("password")
      || lowered.contains("private key")
      || lowered.contains("bearer ")
  }
}

/// A stable UUID derived from a source key, so re-deriving the same artifact
/// (e.g. on redelivery, or across a relaunch) yields the same `event_id` /
/// `local_record_ref` and the durable outbox dedups it by identity. The Protocol
/// requires both to be UUIDs; synthetic artifacts (focus, activity, ambient
/// audio) have no archive record UUID of their own, so they mint one
/// deterministically here. Two FNV-1a passes fill 16 bytes; the RFC 4122 version
/// (5) and variant bits are stamped so the result is a well-formed UUID. Not
/// cryptographic — collision resistance across per-user perception keys suffices.
enum DeterministicPerceptionID {
  static func uuid(from key: String) -> String {
    var bytes = [UInt8](repeating: 0, count: 16)
    let low = fnv1a(Array(key.utf8))
    let high = fnv1a([0x01] + Array(key.utf8))
    for index in 0..<8 {
      bytes[index] = UInt8((low >> (UInt64(index) * 8)) & 0xff)
      bytes[8 + index] = UInt8((high >> (UInt64(index) * 8)) & 0xff)
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x50  // version 5
    bytes[8] = (bytes[8] & 0x3f) | 0x80  // RFC 4122 variant
    let hex = Array(bytes.map { String(format: "%02x", $0) }.joined())
    return [
      String(hex[0..<8]), String(hex[8..<12]), String(hex[12..<16]),
      String(hex[16..<20]), String(hex[20..<32]),
    ].joined(separator: "-")
  }

  private static func fnv1a(_ bytes: [UInt8]) -> UInt64 {
    var hash: UInt64 = 0xcbf2_9ce4_8422_2325
    for byte in bytes {
      hash ^= UInt64(byte)
      hash = hash &* 0x0000_0100_0000_01b3
    }
    return hash
  }
}

public struct SearchableScreenRecordAnalyzer {
  private let embeddingService: LocalEmbeddingService
  private let secretDetector: HardSecretDetector

  public init(
    embeddingService: LocalEmbeddingService = LocalEmbeddingService(),
    secretDetector: HardSecretDetector = HardSecretDetector()
  ) {
    self.embeddingService = embeddingService
    self.secretDetector = secretDetector
  }

  public func analyze(_ frame: CapturedFrame, retentionClass: String) throws -> CompiledPerceptionArtifact {
    let hasSecret = secretDetector.containsSecret(frame.ocrText) || secretDetector.containsSecret(frame.windowTitle)
    let summary =
      hasSecret
      ? "Secret-like content was detected and suppressed."
      : compactSummary(appName: frame.appName, windowTitle: frame.windowTitle, text: frame.ocrText)
    // `bundle_id` / `app_name` must be non-empty per the strict Protocol union,
    // so a missing app identity falls back to a stable placeholder.
    let bundleID = frame.appBundleID.isEmpty ? "unknown.bundle" : frame.appBundleID
    let appName = frame.appName.isEmpty ? "Unknown App" : frame.appName
    // The strict `searchableScreenRecordSignals` union: a permitted record ships
    // app identity plus window title and OCR text; a secret-detected record ships
    // only app identity (title / OCR / embedding are absent). event_id and
    // local_record_ref are the record's own UUID so a deletion tombstone
    // correlates by `event_ref`.
    let signals: [String: JSONValue] =
      hasSecret
      ? [
        "content_redacted": .bool(true),
        "bundle_id": .string(bundleID),
        "app_name": .string(appName),
      ]
      : [
        "content_redacted": .bool(false),
        "bundle_id": .string(bundleID),
        "app_name": .string(appName),
        "window_title": .string(frame.windowTitle),
        "ocr_text": .string(frame.ocrText),
      ]
    return CompiledPerceptionArtifact(
      id: frame.id,
      artifactType: .searchableScreenRecord,
      capturedAt: frame.capturedAt,
      periodStart: frame.capturedAt,
      periodEnd: frame.capturedAt,
      summary: summary,
      signals: signals,
      retentionClass: retentionClass,
      sensitivityLabel: hasSecret ? .secretDetected : .normal,
      confidence: hasSecret ? 0.5 : 0.88,
      localRecordRef: frame.id,
      embedding: hasSecret ? nil : try embeddingService.embed(summary),
      rawFrameBytes: nil
    )
  }

  private func compactSummary(appName: String, windowTitle: String, text: String) -> String {
    let trimmed = text
      .split(whereSeparator: \.isWhitespace)
      .prefix(24)
      .joined(separator: " ")
    let title = windowTitle.isEmpty ? "untitled window" : windowTitle
    if trimmed.isEmpty {
      return "User is active in \(appName), \(title)."
    }
    return "User is active in \(appName), \(title): \(trimmed)"
  }
}

public struct FocusSignalAnalyzer {
  public init() {}

  public func analyze(
    _ frame: CapturedFrame,
    previous: CapturedFrame?,
    retentionClass: String = "screen_memory_7d"
  ) -> CompiledPerceptionArtifact? {
    guard let previous, previous.appName != frame.appName || previous.windowTitle != frame.windowTitle else {
      return nil
    }
    let identity = DeterministicPerceptionID.uuid(from: "focus:\(frame.id)")
    return CompiledPerceptionArtifact(
      id: identity,
      artifactType: .focusSignal,
      capturedAt: frame.capturedAt,
      periodStart: previous.capturedAt,
      periodEnd: frame.capturedAt,
      summary: "Focus moved from \(previous.appName) to \(frame.appName).",
      signals: [
        "previous_app": .string(previous.appName),
        "current_app": .string(frame.appName),
      ],
      retentionClass: retentionClass,
      sensitivityLabel: .normal,
      confidence: 0.8,
      localRecordRef: identity,
      embedding: nil
    )
  }
}

public struct ActivitySummaryAnalyzer {
  public init() {}

  public func summarize(
    frames: [CapturedFrame],
    retentionClass: String = "screen_memory_7d"
  ) -> CompiledPerceptionArtifact? {
    guard let first = frames.first, let last = frames.last else { return nil }
    let apps = Set(frames.map(\.appName)).sorted().joined(separator: ", ")
    let identity = DeterministicPerceptionID.uuid(from: "activity:\(last.id)")
    return CompiledPerceptionArtifact(
      id: identity,
      artifactType: .activitySummary,
      capturedAt: last.capturedAt,
      periodStart: first.capturedAt,
      periodEnd: last.capturedAt,
      summary: "Recent desktop activity covered: \(apps).",
      signals: [
        "frame_count": .number(Double(frames.count)),
        "app_count": .number(Double(Set(frames.map(\.appName)).count)),
      ],
      retentionClass: retentionClass,
      sensitivityLabel: .normal,
      confidence: 0.72,
      localRecordRef: identity,
      embedding: nil
    )
  }
}

public struct AmbientAudioAnalyzer {
  private let embeddingService: LocalEmbeddingService
  private let secretDetector: HardSecretDetector

  public init(
    embeddingService: LocalEmbeddingService = LocalEmbeddingService(),
    secretDetector: HardSecretDetector = HardSecretDetector()
  ) {
    self.embeddingService = embeddingService
    self.secretDetector = secretDetector
  }

  public func analyze(
    _ transcript: AmbientAudioTranscript,
    retentionClass: String = "audio_memory_30d"
  ) throws -> CompiledPerceptionArtifact? {
    let words = transcript.transcript.split(whereSeparator: \.isWhitespace)
    guard !words.isEmpty else { return nil }

    let hasSecret = secretDetector.containsSecret(transcript.transcript)
    let summary =
      hasSecret
      ? "Secret-like ambient audio content was detected and suppressed."
      : compactSummary(words: words)
    let identity = DeterministicPerceptionID.uuid(from: "ambient-audio:\(transcript.id)")
    return CompiledPerceptionArtifact(
      id: identity,
      artifactType: .ambientAudioSummary,
      capturedAt: transcript.capturedAt,
      periodStart: transcript.periodStart,
      periodEnd: transcript.periodEnd,
      summary: summary,
      signals: [
        "audio_source": .string(transcript.source),
        "transcript_redacted": .bool(hasSecret),
        "transcript_word_count": .number(Double(words.count)),
      ],
      retentionClass: retentionClass,
      sensitivityLabel: hasSecret ? .secretDetected : .normal,
      confidence: hasSecret ? 0.45 : 0.76,
      localRecordRef: identity,
      embedding: hasSecret ? nil : try embeddingService.embed(summary),
      rawFrameBytes: nil
    )
  }

  private func compactSummary(words: [Substring]) -> String {
    let compacted = words.prefix(24).joined(separator: " ")
    return "Recent ambient audio: \(compacted)"
  }
}

public struct AmbientAudioCadenceGate: Sendable {
  private var lastTranscript: String?
  private var lastCapturedAt: Date?
  public var minimumIntervalSeconds: TimeInterval

  public init(minimumIntervalSeconds: TimeInterval = 20) {
    self.minimumIntervalSeconds = max(0, minimumIntervalSeconds)
  }

  public mutating func shouldEmit(transcript: String, capturedAt: Date) -> Bool {
    let normalized = transcript
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased()
    guard !normalized.isEmpty else { return false }
    defer {
      lastTranscript = normalized
      lastCapturedAt = capturedAt
    }
    guard let lastTranscript, let lastCapturedAt else { return true }
    if normalized == lastTranscript, capturedAt.timeIntervalSince(lastCapturedAt) < minimumIntervalSeconds {
      return false
    }
    return true
  }
}

public final class ContextCompiler {
  private var settings: CompilerSettings
  private var retentionPolicy: ScreenMemoryRetentionPolicy
  private let screenAnalyzer: SearchableScreenRecordAnalyzer
  private let focusAnalyzer: FocusSignalAnalyzer
  private var previousFrame: CapturedFrame?

  public init(
    settings: CompilerSettings = CompilerSettings(),
    retentionPolicy: ScreenMemoryRetentionPolicy = ScreenMemoryRetentionPolicy(),
    screenAnalyzer: SearchableScreenRecordAnalyzer = SearchableScreenRecordAnalyzer(),
    focusAnalyzer: FocusSignalAnalyzer = FocusSignalAnalyzer()
  ) {
    self.settings = settings
    self.retentionPolicy = retentionPolicy
    self.screenAnalyzer = screenAnalyzer
    self.focusAnalyzer = focusAnalyzer
  }

  public var currentSettings: CompilerSettings {
    settings
  }

  public func update(settings: CompilerSettings) {
    self.settings = settings
  }

  public func update(retentionPeriod: ScreenMemoryRetentionPeriod) {
    retentionPolicy.defaultRetentionClass = retentionPeriod.retentionClass
  }

  public func compile(frame: CapturedFrame) throws -> [CompiledPerceptionArtifact] {
    guard settings.captureEnabled, !settings.isExcluded(appName: frame.appName),
      retentionPolicy.allows(appName: frame.appName)
    else {
      return []
    }

    var artifacts: [CompiledPerceptionArtifact] = [
      try screenAnalyzer.analyze(frame, retentionClass: retentionPolicy.defaultRetentionClass)
    ]
    if let focus = focusAnalyzer.analyze(
      frame,
      previous: previousFrame,
      retentionClass: retentionPolicy.defaultRetentionClass
    ) {
      artifacts.append(focus)
    }
    previousFrame = frame
    return artifacts
  }
}

/// The durable perception outbox driver.
///
/// Renovated from Omi's `ScreenActivitySyncService` (a resumable, batched
/// uploader) and its WAL reconcile pattern (enqueue → deliver → confirm →
/// remove). Intentive's changes: the transport is the WS Protocol
/// `perception_event` / `perception_tombstone` / `session_end_marker` rather
/// than HTTP to a rust backend; durability is the crash-safe SQLite
/// `runtime_ingress_outbox` keyed by `(ingress_kind, ingress_id)` rather than a
/// UserDefaults high-water mark; a record already past its `expires_at` is
/// dropped before it is ever sent; and tenant-scoped tombstones propagate local
/// deletion.
///
/// Deletion is acknowledgement-driven, not send-driven: a socket send only marks
/// an item in-flight for the current connection; the outbox row survives until a
/// `runtime_ingress_ack` (emitted after the Runtime's ledger+projection commit)
/// deletes it by `(kind, id)`. A lost acknowledgement therefore becomes
/// reconnect → redeliver → Runtime ledger dedupe → repeated acknowledgement. The
/// in-flight set resets whenever the connection generation changes, so a
/// disconnect forces redelivery of everything still unacknowledged.
public final class PerceptionPublisher {
  private let runtimeClient: RuntimeChatClient
  private let outbox: PerceptionEventOutbox?
  private let isRuntimeConnected: () -> Bool
  private let connectionGeneration: () -> Int
  private let now: () -> Date

  /// Items sent on the current connection but not yet acknowledged, keyed by
  /// `kind:ingressId`. Never a substitute for the durable outbox — purely an
  /// optimization so a repeated flush does not re-send an item before its ack
  /// arrives. Reset when the connection generation changes.
  private var inFlight: Set<String> = []
  private var inFlightGeneration: Int?

  public init(
    runtimeClient: RuntimeChatClient,
    outbox: PerceptionEventOutbox? = nil,
    isRuntimeConnected: @escaping () -> Bool = { true },
    connectionGeneration: @escaping () -> Int = { 0 },
    now: @escaping () -> Date = Date.init
  ) {
    self.runtimeClient = runtimeClient
    self.outbox = outbox
    self.isRuntimeConnected = isRuntimeConnected
    self.connectionGeneration = connectionGeneration
    self.now = now
  }

  @discardableResult
  public func publish(_ artifact: CompiledPerceptionArtifact) throws -> PerceptionEvent {
    guard artifact.rawFrameBytes == nil else {
      throw ProtocolEventError.payloadContainsRawFrameBytes
    }
    let event = PerceptionEvent(
      eventId: artifact.id,
      capturedAt: artifact.capturedAt,
      periodStart: artifact.periodStart,
      periodEnd: artifact.periodEnd,
      artifactType: artifact.artifactType,
      summary: artifact.summary,
      signals: artifact.signals,
      embeddingRef: artifact.embedding,
      sensitivityLabel: artifact.sensitivityLabel,
      retentionClass: artifact.retentionClass,
      confidence: artifact.confidence,
      expiresAt: Self.expiry(capturedAt: artifact.capturedAt, retentionClass: artifact.retentionClass),
      localRecordRef: artifact.localRecordRef
    )
    try outbox?.enqueuePerceptionEvent(event)
    trySend(.perceptionEvent(event))
    return event
  }

  /// Durably queue a tenant-scoped deletion for propagation to the Runtime.
  public func publishTombstone(_ tombstone: PerceptionTombstone) throws {
    try outbox?.enqueuePerceptionTombstone(tombstone)
    trySend(.perceptionTombstone(tombstone))
  }

  /// Durably queue a session-end marker (clean stop, quit, or a leftover-lock
  /// crash marker) for propagation to the Runtime.
  public func publishSessionEnd(_ marker: SessionEndMarker) throws {
    try outbox?.enqueueSessionEndMarker(marker)
    trySend(.sessionEndMarker(marker))
  }

  /// Delete an acknowledged item once the Runtime confirms its ledger+projection
  /// transaction committed. Idempotent: a duplicate ack for an already-deleted
  /// row is a no-op.
  public func acknowledge(_ ack: RuntimeIngressAck) throws {
    inFlight.remove(inFlightKey(kind: ack.ingressKind, ingressId: ack.ingressId))
    try outbox?.removeIngress(kind: ack.ingressKind, ingressId: ack.ingressId)
  }

  /// Redeliver every unacknowledged item in durable enqueue order, dropping
  /// already-expired perception events first (an expired record must never leave
  /// the Mac, even on reconnect). Nothing is deleted here — only a
  /// `runtime_ingress_ack` deletes. Returns the number of items sent.
  @discardableResult
  public func flushPendingIngress(limit: Int = 100) throws -> Int {
    guard let outbox else { return 0 }
    resetInFlightIfConnectionChanged()
    _ = try outbox.dropExpiredPerceptionEvents(now: now())
    guard isRuntimeConnected() else { return 0 }
    var sent = 0
    for item in try outbox.pendingIngress(limit: limit) {
      let key = inFlightKey(kind: item.kind, ingressId: item.ingressId)
      if inFlight.contains(key) { continue }
      try send(item)
      inFlight.insert(key)
      sent += 1
    }
    return sent
  }

  /// Launch-time sweep: drop already-expired unsent records from the durable
  /// outbox without sending anything. An expired record must never leave the
  /// Mac, even if the Runtime is still connected. Returns the count dropped.
  @discardableResult
  public func dropExpiredPendingPerceptionEvents() throws -> Int {
    guard let outbox else { return 0 }
    return try outbox.dropExpiredPerceptionEvents(now: now())
  }

  private func trySend(_ item: RuntimeIngressOutboxItem) {
    resetInFlightIfConnectionChanged()
    guard isRuntimeConnected() else { return }
    // A freshly compiled artifact is never expired; stale queued items are the
    // ones an expired record could hide in, and those are dropped on the
    // redelivery path (`flushPendingIngress`) and the launch sweep before any
    // send — an expired record never leaves the Mac.
    do {
      try send(item)
      inFlight.insert(inFlightKey(kind: item.kind, ingressId: item.ingressId))
    } catch {
      // Send failed; the durable outbox redelivers on the next flush. Deletion
      // still waits for a `runtime_ingress_ack`, so nothing is lost.
    }
  }

  private func send(_ item: RuntimeIngressOutboxItem) throws {
    switch item {
    case .perceptionEvent(let event):
      try runtimeClient.sendPerceptionEvent(event)
    case .perceptionTombstone(let tombstone):
      try runtimeClient.sendPerceptionTombstone(tombstone)
    case .sessionEndMarker(let marker):
      try runtimeClient.sendSessionEndMarker(marker)
    }
  }

  private func resetInFlightIfConnectionChanged() {
    let generation = connectionGeneration()
    guard inFlightGeneration != generation else { return }
    inFlight.removeAll()
    inFlightGeneration = generation
  }

  private func inFlightKey(kind: RuntimeIngressKind, ingressId: String) -> String {
    "\(kind.rawValue):\(ingressId)"
  }

  /// Authoritative expiry = `captured_at` + the retention window encoded in the
  /// retention class (e.g. `screen_memory_7d` → 7 days), defaulting to 7 days.
  static func expiry(capturedAt: String, retentionClass: String) -> String {
    let captured = parseTimestamp(capturedAt) ?? Date()
    let days = retentionDays(from: retentionClass)
    return captured.addingTimeInterval(TimeInterval(days) * 24 * 60 * 60).protocolTimestamp
  }

  private static func retentionDays(from retentionClass: String) -> Int {
    for component in retentionClass.split(separator: "_") where component.hasSuffix("d") {
      if let value = Int(component.dropLast()) { return value }
    }
    return 7
  }

  private static func parseTimestamp(_ value: String) -> Date? {
    ISO8601DateFormatter.intentiveProtocol.date(from: value)
      ?? ISO8601DateFormatter().date(from: value)
  }
}

// MARK: - PerceptionPublisher conformance

extension PerceptionPublisher: PerceptionOutboxLaunchDrain {}
