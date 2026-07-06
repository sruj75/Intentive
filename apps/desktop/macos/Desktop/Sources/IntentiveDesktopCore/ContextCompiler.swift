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

public struct CompilerSettings: Codable, Equatable, Sendable {
  public var captureEnabled: Bool
  public var excludedApps: Set<String>
  public var contextChangeDebounceSeconds: Double
  public var sameContextMinimumSeconds: Double
  public var messagingFallbackSeconds: Double

  public init(
    captureEnabled: Bool = true,
    excludedApps: Set<String> = [],
    contextChangeDebounceSeconds: Double = 3,
    sameContextMinimumSeconds: Double = 60,
    messagingFallbackSeconds: Double = 15
  ) {
    self.captureEnabled = captureEnabled
    self.excludedApps = excludedApps
    self.contextChangeDebounceSeconds = contextChangeDebounceSeconds
    self.sameContextMinimumSeconds = sameContextMinimumSeconds
    self.messagingFallbackSeconds = messagingFallbackSeconds
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

  public init(runtimeClient: RuntimeChatClient) {
    self.runtimeClient = runtimeClient
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
    try runtimeClient.sendPerceptionEvent(event)
    return event
  }
}
