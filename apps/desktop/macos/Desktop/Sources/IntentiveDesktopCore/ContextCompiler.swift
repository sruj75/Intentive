import Foundation

public struct CapturedFrame: Equatable, Sendable {
  public var id: String
  public var capturedAt: String
  public var appName: String
  public var windowTitle: String
  public var ocrText: String
  public var rawFrameBytes: Data?

  public init(
    id: String,
    capturedAt: String,
    appName: String,
    windowTitle: String,
    ocrText: String,
    rawFrameBytes: Data? = nil
  ) {
    self.id = id
    self.capturedAt = capturedAt
    self.appName = appName
    self.windowTitle = windowTitle
    self.ocrText = ocrText
    self.rawFrameBytes = rawFrameBytes
  }

  public func withoutRawFrameBytes() -> CapturedFrame {
    CapturedFrame(
      id: id,
      capturedAt: capturedAt,
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
  public var appName: String
  public var windowTitle: String

  public init(appName: String, windowTitle: String = "") {
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
  public var spokenResponsesEnabled: Bool
  public var ambientAudioCaptureEnabled: Bool

  public init(
    captureEnabled: Bool = true,
    excludedApps: Set<String> = [],
    contextChangeDebounceSeconds: Double = 3,
    sameContextMinimumSeconds: Double = 60,
    messagingFallbackSeconds: Double = 15,
    spokenResponsesEnabled: Bool = true,
    ambientAudioCaptureEnabled: Bool = false
  ) {
    self.captureEnabled = captureEnabled
    self.excludedApps = excludedApps
    self.contextChangeDebounceSeconds = contextChangeDebounceSeconds
    self.sameContextMinimumSeconds = sameContextMinimumSeconds
    self.messagingFallbackSeconds = messagingFallbackSeconds
    self.spokenResponsesEnabled = spokenResponsesEnabled
    self.ambientAudioCaptureEnabled = ambientAudioCaptureEnabled
  }

  enum CodingKeys: String, CodingKey {
    case captureEnabled
    case excludedApps
    case contextChangeDebounceSeconds
    case sameContextMinimumSeconds
    case messagingFallbackSeconds
    case spokenResponsesEnabled
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
      spokenResponsesEnabled: try container.decodeIfPresent(Bool.self, forKey: .spokenResponsesEnabled) ?? true,
      ambientAudioCaptureEnabled: try container.decodeIfPresent(Bool.self, forKey: .ambientAudioCaptureEnabled) ?? false
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
    return CompiledPerceptionArtifact(
      id: "screen-\(frame.id)",
      artifactType: .searchableScreenRecord,
      capturedAt: frame.capturedAt,
      periodStart: frame.capturedAt,
      periodEnd: frame.capturedAt,
      summary: summary,
      signals: [
        "app": .string(frame.appName),
        "window_title_redacted": .bool(hasSecret),
        "ocr_word_count": .number(Double(frame.ocrText.split(whereSeparator: \.isWhitespace).count)),
      ],
      retentionClass: retentionClass,
      sensitivityLabel: hasSecret ? .secretDetected : .normal,
      confidence: hasSecret ? 0.5 : 0.88,
      localRecordRef: "screen-memory://records/\(frame.id)",
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

  public func analyze(_ frame: CapturedFrame, previous: CapturedFrame?) -> CompiledPerceptionArtifact? {
    guard let previous, previous.appName != frame.appName || previous.windowTitle != frame.windowTitle else {
      return nil
    }
    return CompiledPerceptionArtifact(
      id: "focus-\(frame.id)",
      artifactType: .focusSignal,
      capturedAt: frame.capturedAt,
      periodStart: previous.capturedAt,
      periodEnd: frame.capturedAt,
      summary: "Focus moved from \(previous.appName) to \(frame.appName).",
      signals: [
        "previous_app": .string(previous.appName),
        "current_app": .string(frame.appName),
      ],
      retentionClass: "screen_memory_30d",
      sensitivityLabel: .normal,
      confidence: 0.8,
      localRecordRef: "screen-memory://focus/\(frame.id)",
      embedding: nil
    )
  }
}

public struct ActivitySummaryAnalyzer {
  public init() {}

  public func summarize(frames: [CapturedFrame]) -> CompiledPerceptionArtifact? {
    guard let first = frames.first, let last = frames.last else { return nil }
    let apps = Set(frames.map(\.appName)).sorted().joined(separator: ", ")
    return CompiledPerceptionArtifact(
      id: "activity-\(last.id)",
      artifactType: .activitySummary,
      capturedAt: last.capturedAt,
      periodStart: first.capturedAt,
      periodEnd: last.capturedAt,
      summary: "Recent desktop activity covered: \(apps).",
      signals: [
        "frame_count": .number(Double(frames.count)),
        "app_count": .number(Double(Set(frames.map(\.appName)).count)),
      ],
      retentionClass: "screen_memory_30d",
      sensitivityLabel: .normal,
      confidence: 0.72,
      localRecordRef: "screen-memory://activity/\(last.id)",
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
    return CompiledPerceptionArtifact(
      id: "ambient-audio-\(transcript.id)",
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
      localRecordRef: "screen-memory://ambient-audio/\(transcript.id)",
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
  private let retentionPolicy: ScreenMemoryRetentionPolicy
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

  public func compile(frame: CapturedFrame) throws -> [CompiledPerceptionArtifact] {
    guard settings.captureEnabled, !settings.isExcluded(appName: frame.appName),
      retentionPolicy.allows(appName: frame.appName)
    else {
      return []
    }

    var artifacts: [CompiledPerceptionArtifact] = [
      try screenAnalyzer.analyze(frame, retentionClass: retentionPolicy.defaultRetentionClass)
    ]
    if let focus = focusAnalyzer.analyze(frame, previous: previousFrame) {
      artifacts.append(focus)
    }
    previousFrame = frame
    return artifacts
  }
}

public final class PerceptionPublisher {
  private let runtimeClient: RuntimeChatClient
  private let outbox: PerceptionEventOutbox?
  private let isRuntimeConnected: () -> Bool

  public init(
    runtimeClient: RuntimeChatClient,
    outbox: PerceptionEventOutbox? = nil,
    isRuntimeConnected: @escaping () -> Bool = { true }
  ) {
    self.runtimeClient = runtimeClient
    self.outbox = outbox
    self.isRuntimeConnected = isRuntimeConnected
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
      localRecordRef: artifact.localRecordRef
    )
    try outbox?.enqueuePerceptionEvent(event)
    guard isRuntimeConnected() else {
      return event
    }
    try runtimeClient.sendPerceptionEvent(event)
    try outbox?.removePerceptionEvent(eventId: event.eventId)
    return event
  }

  @discardableResult
  public func flushPendingPerceptionEvents(limit: Int = 100) throws -> Int {
    guard isRuntimeConnected(), let outbox else { return 0 }
    var flushedCount = 0
    for event in try outbox.pendingPerceptionEvents(limit: limit) {
      try runtimeClient.sendPerceptionEvent(event)
      try outbox.removePerceptionEvent(eventId: event.eventId)
      flushedCount += 1
    }
    return flushedCount
  }
}
