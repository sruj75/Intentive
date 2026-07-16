import Foundation

public enum FloatingBarSubmissionError: Error, Equatable, LocalizedError {
  case emptyMessage

  public var errorDescription: String? {
    switch self {
    case .emptyMessage:
      return "Enter a message before sending."
    }
  }
}

public final class FloatingBarController {
  private let runtimeClient: RuntimeChatClient
  private let messageStore: MessageStore

  public init(runtimeClient: RuntimeChatClient, messageStore: MessageStore) {
    self.runtimeClient = runtimeClient
    self.messageStore = messageStore
  }

  public var messages: [ChatMessage] {
    messageStore.messages
  }

  public var conversation: FloatingConversationSnapshot {
    FloatingConversationSnapshot(messages: messageStore.messages)
  }

  @discardableResult
  public func submit(_ body: String) throws -> ChatMessage {
    let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      throw FloatingBarSubmissionError.emptyMessage
    }
    return try runtimeClient.sendUserMessage(trimmed)
  }
}

public struct FloatingConversationExchange: Equatable, Sendable {
  public var question: ChatMessage?
  public var answer: ChatMessage?

  public init(question: ChatMessage?, answer: ChatMessage?) {
    self.question = question
    self.answer = answer
  }
}

/// Read-only projection of Runtime-owned Conversation History for the native
/// floating bar. This is deliberately derived on demand: Desktop never creates
/// a second durable transcript or a bar-specific conversation.
public struct FloatingConversationSnapshot: Equatable, Sendable {
  public var exchanges: [FloatingConversationExchange]

  public init(messages: [ChatMessage]) {
    var projected: [FloatingConversationExchange] = []
    for message in messages {
      switch message.author {
      case .user:
        projected.append(FloatingConversationExchange(question: message, answer: nil))
      case .companion:
        if let lastIndex = projected.indices.last,
           projected[lastIndex].answer == nil
        {
          projected[lastIndex].answer = message
        } else {
          projected.append(FloatingConversationExchange(question: nil, answer: message))
        }
      }
    }
    exchanges = projected
  }
}

public protocol AmbientAudioSegmentCapturing {
  func captureSegment() async throws -> Data
}

public protocol VoiceActivityGate {
  func containsSpeech(_ pcm16k: Data) async -> Bool
}

public protocol LocalTranscriptionService {
  func transcribe(_ pcm16k: Data) async throws -> String
}

public protocol DesktopNotificationSink: AnyObject {
  func deliver(title: String, body: String)
}

public protocol DesktopOverlaySink: AnyObject {
  var isEngaged: Bool { get }
  var isSnoozed: Bool { get }
  func showNudge(body: String)
}

public final class RecordingNotificationSink: DesktopNotificationSink {
  public private(set) var delivered: [(title: String, body: String)] = []

  public init() {}

  public func deliver(title: String, body: String) {
    delivered.append((title: title, body: body))
  }
}

public final class RecordingOverlaySink: DesktopOverlaySink {
  public private(set) var nudges: [String] = []
  public var isEngaged: Bool
  public var isSnoozed: Bool

  public init(isEngaged: Bool = false, isSnoozed: Bool = false) {
    self.isEngaged = isEngaged
    self.isSnoozed = isSnoozed
  }

  public func showNudge(body: String) {
    nudges.append(body)
  }
}

public final class ProactivePresentationSnooze {
  private let now: () -> Date
  private var snoozedUntil: Date?

  public init(now: @escaping () -> Date = Date.init) {
    self.now = now
  }

  public var isActive: Bool {
    guard let snoozedUntil else { return false }
    return now() < snoozedUntil
  }

  public func snooze(for duration: TimeInterval) {
    snoozedUntil = now().addingTimeInterval(max(0, duration))
  }
}

public final class EffectRunner {
  private let overlay: DesktopOverlaySink
  private let runtimeClient: RuntimeChatClient

  public init(
    overlay: DesktopOverlaySink,
    runtimeClient: RuntimeChatClient
  ) {
    self.overlay = overlay
    self.runtimeClient = runtimeClient
  }

  public func handle(_ message: CompanionMessage) throws {
    guard message.viaPostMessageBack else { return }
    if !overlay.isEngaged, !overlay.isSnoozed {
      overlay.showNudge(body: message.body)
    }
    try runtimeClient.acknowledge(messageId: message.messageId)
  }
}

public final class CaptureCoordinator {
  private let compiler: ContextCompiler
  private let screenMemory: ScreenMemoryStore
  private let publisher: PerceptionPublisher
  private let archiveProvider: () -> ScreenMemoryArchive?
  private let privacyPolicy: ScreenMemoryPrivacyPolicy?

  public init(
    compiler: ContextCompiler,
    screenMemory: ScreenMemoryStore,
    publisher: PerceptionPublisher,
    archiveProvider: @escaping () -> ScreenMemoryArchive? = { nil },
    privacyPolicy: ScreenMemoryPrivacyPolicy? = nil
  ) {
    self.compiler = compiler
    self.screenMemory = screenMemory
    self.publisher = publisher
    self.archiveProvider = archiveProvider
    self.privacyPolicy = privacyPolicy
  }

  public func accept(frame: CapturedFrame) throws -> [PerceptionEvent] {
    try accept(frame: frame, storesSearchableRecord: true)
  }

  private func accept(
    frame: CapturedFrame,
    storesSearchableRecord: Bool
  ) throws -> [PerceptionEvent] {
    guard privacyPolicy?.allows(appBundleID: frame.appBundleID, appName: frame.appName) ?? true else {
      return []
    }
    let artifacts = try compiler.compile(frame: frame)
    var events: [PerceptionEvent] = []
    for artifact in artifacts {
      if storesSearchableRecord, artifact.artifactType == .searchableScreenRecord {
        screenMemory.add(
          ScreenMemoryRecord(
            id: artifact.id,
            capturedAt: artifact.capturedAt,
            appBundleID: frame.appBundleID,
            appName: frame.appName,
            windowTitle: frame.windowTitle,
            summary: artifact.summary,
            ocrText: frame.ocrText,
            retentionClass: artifact.retentionClass,
            sensitivityLabel: artifact.sensitivityLabel,
            embedding: artifact.embedding
          )
        )
      }
      events.append(try publisher.publish(artifact))
    }
    return events
  }

  public func updateCompilerSettings(_ settings: CompilerSettings) {
    compiler.update(settings: settings)
  }

  public func captureOnce(from source: DesktopCaptureSource) async throws -> [PerceptionEvent] {
    if let contextSource = source as? DesktopWindowContextSource {
      let context = try contextSource.activeWindowContext()
      guard compiler.currentSettings.captureEnabled,
            !compiler.currentSettings.isExcluded(appName: context.appName),
            privacyPolicy?.allows(appBundleID: context.appBundleID, appName: context.appName) ?? true
      else {
        return []
      }
    }
    let frame = try await source.captureFrame()
    guard privacyPolicy?.allows(appBundleID: frame.appBundleID, appName: frame.appName) ?? true else {
      return []
    }
    if let imageData = frame.rawFrameBytes, let archive = archiveProvider() {
      let outcome = try await archive.ingest(
        ScreenMemoryCaptureInput(
          userID: archive.userID,
          imageData: imageData,
          capturedAt: frame.capturedAt,
          appBundleID: frame.appBundleID,
          appName: frame.appName,
          windowTitle: frame.windowTitle
        )
      )
      switch outcome {
      case .duplicate:
        return []
      case .stored(let recordID):
        guard let record = archive.record(recordID), let archivedRecordID = record.recordID else { return [] }
        return try accept(
          frame: CapturedFrame(
            id: archivedRecordID.value.uuidString,
            capturedAt: record.capturedAt,
            appBundleID: record.appBundleID,
            appName: record.appName,
            windowTitle: record.windowTitle,
            ocrText: record.ocrText
          ),
          storesSearchableRecord: false
        )
      }
    }
    if frame.rawFrameBytes != nil, frame.ocrText.isEmpty {
      return []
    }
    return try accept(frame: frame.withoutRawFrameBytes())
  }
}

public final class AmbientAudioCoordinator {
  private let analyzer: AmbientAudioAnalyzer
  private let audioMemory: AudioMemoryStore
  private let publisher: PerceptionPublisher

  public init(
    analyzer: AmbientAudioAnalyzer = AmbientAudioAnalyzer(),
    audioMemory: AudioMemoryStore,
    publisher: PerceptionPublisher
  ) {
    self.analyzer = analyzer
    self.audioMemory = audioMemory
    self.publisher = publisher
  }

  @discardableResult
  public func accept(transcript: AmbientAudioTranscript) throws -> PerceptionEvent? {
    guard let artifact = try analyzer.analyze(transcript) else { return nil }
    audioMemory.addAudioMemory(
      AudioMemoryRecord(
        id: transcript.id,
        capturedAt: transcript.capturedAt,
        periodStart: transcript.periodStart,
        periodEnd: transcript.periodEnd,
        transcript: transcript.transcript,
        summary: artifact.summary,
        retentionClass: artifact.retentionClass,
        sensitivityLabel: artifact.sensitivityLabel,
        embedding: artifact.embedding
      )
    )
    return try publisher.publish(artifact)
  }
}

public struct EmptyAmbientAudioSegmentCapture: AmbientAudioSegmentCapturing {
  public init() {}

  public func captureSegment() async throws -> Data {
    Data()
  }
}

public struct ScreenMemoryCaptureLoopState: Equatable, Sendable {
  public var isRunning: Bool
  public var capturedFrameCount: Int
  public var publishedEventCount: Int
  public var skippedCaptureCount: Int
  public var failedCaptureCount: Int
  public var lastCapturedAt: String?
  public var lastError: String?
  public var lastSkipReason: String?

  public init(
    isRunning: Bool = false,
    capturedFrameCount: Int = 0,
    publishedEventCount: Int = 0,
    skippedCaptureCount: Int = 0,
    failedCaptureCount: Int = 0,
    lastCapturedAt: String? = nil,
    lastError: String? = nil,
    lastSkipReason: String? = nil
  ) {
    self.isRunning = isRunning
    self.capturedFrameCount = capturedFrameCount
    self.publishedEventCount = publishedEventCount
    self.skippedCaptureCount = skippedCaptureCount
    self.failedCaptureCount = failedCaptureCount
    self.lastCapturedAt = lastCapturedAt
    self.lastError = lastError
    self.lastSkipReason = lastSkipReason
  }
}

public enum ScreenMemoryCaptureLoopEvent: Equatable, Sendable {
  case captured(eventCount: Int)
  case skipped(String)
  case failed(String)
}

public enum DesktopCaptureCadenceDecision: Equatable, Sendable {
  case capture
  case skip(String)
}

public struct DesktopCaptureCadenceGate: Sendable {
  private struct NormalizedContext: Equatable, Sendable {
    var appName: String
    var windowTitle: String

    init(_ context: DesktopWindowContext) {
      appName = CompilerSettings.normalizedAppName(context.appName)
      windowTitle = context.windowTitle.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
  }

  private struct PendingContext: Equatable, Sendable {
    var context: NormalizedContext
    var firstSeenAt: Date
  }

  private var lastCapturedContext: NormalizedContext?
  private var lastCapturedAt: Date?
  private var pendingContext: PendingContext?

  public init() {}

  public mutating func decision(
    for context: DesktopWindowContext,
    at now: Date,
    settings: CompilerSettings
  ) -> DesktopCaptureCadenceDecision {
    let normalized = NormalizedContext(context)

    guard let lastCapturedContext, let lastCapturedAt else {
      pendingContext = nil
      return .capture
    }

    if normalized == lastCapturedContext {
      pendingContext = nil
      let interval = isMessagingApp(normalized.appName)
        ? settings.messagingFallbackSeconds
        : settings.sameContextMinimumSeconds
      let elapsed = now.timeIntervalSince(lastCapturedAt)
      return elapsed >= interval ? .capture : .skip("same context throttled")
    }

    if pendingContext?.context != normalized {
      pendingContext = PendingContext(context: normalized, firstSeenAt: now)
      return .skip("context change debounce")
    }

    guard let pendingContext else {
      return .skip("context change debounce")
    }
    let elapsed = now.timeIntervalSince(pendingContext.firstSeenAt)
    return elapsed >= settings.contextChangeDebounceSeconds
      ? .capture
      : .skip("context change debounce")
  }

  public mutating func recordCapture(of context: DesktopWindowContext, at capturedAt: Date) {
    lastCapturedContext = NormalizedContext(context)
    lastCapturedAt = capturedAt
    pendingContext = nil
  }

  private func isMessagingApp(_ normalizedAppName: String) -> Bool {
    Self.messagingAppNames.contains(normalizedAppName)
  }

  private static let messagingAppNames: Set<String> = [
    "discord",
    "messages",
    "microsoft teams",
    "signal",
    "slack",
    "telegram",
    "whatsapp",
  ]
}

@MainActor
public final class ScreenMemoryCaptureLoop {
  public nonisolated static let defaultIntervalSeconds: TimeInterval = 3

  private let coordinator: CaptureCoordinator
  private let source: DesktopCaptureSource
  private let settingsProvider: () -> CompilerSettings
  private let permissionProvider: () -> Bool
  private let privacySnapshotProvider: () -> ScreenMemoryPrivacySnapshot
  private let now: () -> Date
  public var intervalProvider: () -> TimeInterval
  public var competingRecorderSkipProvider: () -> String?
  private var cadenceGate: DesktopCaptureCadenceGate
  private var task: Task<Void, Never>?

  public private(set) var state: ScreenMemoryCaptureLoopState

  public init(
    coordinator: CaptureCoordinator,
    source: DesktopCaptureSource,
    settingsProvider: @escaping () -> CompilerSettings = { CompilerSettings() },
    permissionProvider: @escaping () -> Bool = { true },
    privacySnapshotProvider: @escaping () -> ScreenMemoryPrivacySnapshot = {
      ScreenMemoryPrivacySnapshot(isPrivateMode: false)
    },
    now: @escaping () -> Date = { Date() },
    intervalSeconds: TimeInterval = ScreenMemoryCaptureLoop.defaultIntervalSeconds,
    intervalProvider: (() -> TimeInterval)? = nil,
    competingRecorderSkipProvider: @escaping () -> String? = { nil },
    cadenceGate: DesktopCaptureCadenceGate = DesktopCaptureCadenceGate(),
    initialState: ScreenMemoryCaptureLoopState = ScreenMemoryCaptureLoopState()
  ) {
    self.coordinator = coordinator
    self.source = source
    self.settingsProvider = settingsProvider
    self.permissionProvider = permissionProvider
    self.privacySnapshotProvider = privacySnapshotProvider
    self.now = now
    self.intervalProvider = intervalProvider ?? { intervalSeconds }
    self.competingRecorderSkipProvider = competingRecorderSkipProvider
    self.cadenceGate = cadenceGate
    state = initialState
  }

  deinit {
    task?.cancel()
  }

  @discardableResult
  public func start(onEvent: ((ScreenMemoryCaptureLoopEvent) -> Void)? = nil) -> Bool {
    guard task == nil else { return false }

    state.isRunning = true
    task = Task { [weak self] in
      guard let self else { return }
      while !Task.isCancelled {
        let event = await self.captureTick()
        onEvent?(event)
        do {
          try await Task.sleep(nanoseconds: self.intervalNanoseconds)
        } catch {
          break
        }
      }
    }
    return true
  }

  public func stop() {
    task?.cancel()
    task = nil
    state.isRunning = false
  }

  public func captureTick() async -> ScreenMemoryCaptureLoopEvent {
    let settings = settingsProvider()
    let privacy = privacySnapshotProvider()
    guard !privacy.isPrivateMode else {
      return recordSkip("Private Mode")
    }
    guard settings.captureEnabled else {
      return recordSkip("capture disabled")
    }

    guard permissionProvider() else {
      return recordSkip("screen recording permission required")
    }

    // Per-tick competing-screen-recorder yield, adapted from Omi's
    // `ProactiveScreenshotCaptureGate` consult in `captureFrame()`. Skips
    // without reading the frame — Omi gives us this exact backoff behavior.
    if let skipReason = competingRecorderSkipProvider() {
      return recordSkip(skipReason)
    }

    let captureStartedAt = now()
    var windowContext: DesktopWindowContext?
    if let contextSource = source as? DesktopWindowContextSource {
      do {
        let context = try contextSource.activeWindowContext()
        windowContext = context
        guard !settings.isExcluded(appName: context.appName),
              privacy.allows(appBundleID: context.appBundleID, appName: context.appName)
        else {
          return recordSkip("current app skipped")
        }
        switch cadenceGate.decision(for: context, at: captureStartedAt, settings: settings) {
        case .capture:
          break
        case .skip(let reason):
          return recordSkip(reason)
        }
      } catch {
        return recordFailure(error.localizedDescription)
      }
    }

    do {
      let events = try await coordinator.captureOnce(from: source)
      guard !events.isEmpty else {
        return recordSkip("current app skipped")
      }
      state.capturedFrameCount += 1
      state.publishedEventCount += events.count
      state.lastCapturedAt = events.first?.capturedAt
      state.lastError = nil
      state.lastSkipReason = nil
      if let windowContext {
        cadenceGate.recordCapture(of: windowContext, at: captureStartedAt)
      }
      return .captured(eventCount: events.count)
    } catch {
      return recordFailure(error.localizedDescription)
    }
  }

  private var intervalNanoseconds: UInt64 {
    UInt64(intervalProvider() * 1_000_000_000)
  }

  private func recordSkip(_ reason: String) -> ScreenMemoryCaptureLoopEvent {
    state.skippedCaptureCount += 1
    state.lastSkipReason = reason
    state.lastError = nil
    return .skipped(reason)
  }

  private func recordFailure(_ reason: String) -> ScreenMemoryCaptureLoopEvent {
    state.failedCaptureCount += 1
    state.lastError = reason
    state.lastSkipReason = nil
    return .failed(reason)
  }
}

public struct AmbientAudioCaptureLoopState: Equatable, Sendable {
  public var isRunning: Bool
  public var capturedSegmentCount: Int
  public var publishedEventCount: Int
  public var skippedCaptureCount: Int
  public var failedCaptureCount: Int
  public var lastCapturedAt: String?
  public var lastError: String?
  public var lastSkipReason: String?

  public init(
    isRunning: Bool = false,
    capturedSegmentCount: Int = 0,
    publishedEventCount: Int = 0,
    skippedCaptureCount: Int = 0,
    failedCaptureCount: Int = 0,
    lastCapturedAt: String? = nil,
    lastError: String? = nil,
    lastSkipReason: String? = nil
  ) {
    self.isRunning = isRunning
    self.capturedSegmentCount = capturedSegmentCount
    self.publishedEventCount = publishedEventCount
    self.skippedCaptureCount = skippedCaptureCount
    self.failedCaptureCount = failedCaptureCount
    self.lastCapturedAt = lastCapturedAt
    self.lastError = lastError
    self.lastSkipReason = lastSkipReason
  }
}

public enum AmbientAudioCaptureLoopEvent: Equatable, Sendable {
  case captured(eventPublished: Bool)
  case skipped(String)
  case failed(String)
}

@MainActor
public final class AmbientAudioCaptureLoop {
  public nonisolated static let defaultIntervalSeconds: TimeInterval = 15

  private let audioCapture: AmbientAudioSegmentCapturing
  private let settingsProvider: () -> CompilerSettings
  private let permissionProvider: () -> Bool
  private let privacySnapshotProvider: () -> ScreenMemoryPrivacySnapshot
  private let now: () -> Date
  private let intervalSeconds: TimeInterval
  private let pipeline: PassiveAudioContextPipeline
  private var task: Task<Void, Never>?

  public private(set) var state: AmbientAudioCaptureLoopState

  public init(
    coordinator: AmbientAudioCoordinator,
    audioCapture: AmbientAudioSegmentCapturing,
    voiceGate: VoiceActivityGate,
    transcription: LocalTranscriptionService,
    settingsProvider: @escaping () -> CompilerSettings = { CompilerSettings() },
    permissionProvider: @escaping () -> Bool = { true },
    privacySnapshotProvider: @escaping () -> ScreenMemoryPrivacySnapshot = {
      ScreenMemoryPrivacySnapshot(isPrivateMode: false)
    },
    activeWindowProvider: (() throws -> DesktopWindowContext?)? = nil,
    now: @escaping () -> Date = { Date() },
    intervalSeconds: TimeInterval = AmbientAudioCaptureLoop.defaultIntervalSeconds,
    cadenceGate: AmbientAudioCadenceGate = AmbientAudioCadenceGate(),
    initialState: AmbientAudioCaptureLoopState = AmbientAudioCaptureLoopState()
  ) {
    self.audioCapture = audioCapture
    self.settingsProvider = settingsProvider
    self.permissionProvider = permissionProvider
    self.privacySnapshotProvider = privacySnapshotProvider
    self.now = now
    self.intervalSeconds = max(1, intervalSeconds)
    // The mic loop is a thin driver over the source-neutral pipeline: it captures a
    // microphone turn and hands it in as `.microphone`. Voice-activity gating,
    // transcription, local retention, secret filtering, and summary emission all live
    // in the pipeline so the microphone and system-audio loops share one code path.
    self.pipeline = PassiveAudioContextPipeline(
      coordinator: coordinator,
      voiceGate: voiceGate,
      transcription: transcription,
      settingsProvider: settingsProvider,
      privacySnapshotProvider: privacySnapshotProvider,
      microphonePermissionProvider: permissionProvider,
      activeWindowProvider: activeWindowProvider,
      now: now,
      cadenceGate: cadenceGate
    )
    state = initialState
  }

  deinit {
    task?.cancel()
  }

  @discardableResult
  public func start(onEvent: ((AmbientAudioCaptureLoopEvent) -> Void)? = nil) -> Bool {
    guard task == nil else { return false }
    state.isRunning = true
    task = Task { [weak self] in
      guard let self else { return }
      while !Task.isCancelled {
        let event = await self.captureTick()
        onEvent?(event)
        do {
          try await Task.sleep(nanoseconds: self.intervalNanoseconds)
        } catch {
          break
        }
      }
    }
    return true
  }

  public func stop() {
    task?.cancel()
    task = nil
    state.isRunning = false
  }

  public func captureTick() async -> AmbientAudioCaptureLoopEvent {
    let settings = settingsProvider()
    // Cheap pre-capture guards so the microphone engine never spins up while paused,
    // disabled, or unpermitted. The pipeline re-validates these authoritatively.
    guard !privacySnapshotProvider().isPrivateMode else {
      return recordSkip("Private Mode")
    }
    guard settings.captureEnabled else {
      return recordSkip("capture disabled")
    }
    guard settings.ambientAudioCaptureEnabled else {
      return recordSkip("ambient audio capture disabled")
    }
    guard permissionProvider() else {
      return recordSkip("microphone permission required")
    }

    let pcm16k: Data
    do {
      pcm16k = try await audioCapture.captureSegment()
    } catch {
      return recordFailure(error.localizedDescription)
    }

    switch await pipeline.ingest(pcm16k: pcm16k, source: .microphone) {
    case .captured(_, let eventPublished):
      state.capturedSegmentCount += 1
      state.publishedEventCount += eventPublished ? 1 : 0
      state.lastCapturedAt = now().protocolTimestamp
      state.lastError = nil
      state.lastSkipReason = nil
      return .captured(eventPublished: eventPublished)
    case .skipped(let reason):
      return recordSkip(reason)
    case .failed(let reason):
      return recordFailure(reason)
    }
  }

  private var intervalNanoseconds: UInt64 {
    UInt64(intervalSeconds * 1_000_000_000)
  }

  private func recordSkip(_ reason: String) -> AmbientAudioCaptureLoopEvent {
    state.skippedCaptureCount += 1
    state.lastSkipReason = reason
    state.lastError = nil
    return .skipped(reason)
  }

  private func recordFailure(_ reason: String) -> AmbientAudioCaptureLoopEvent {
    state.failedCaptureCount += 1
    state.lastError = reason
    state.lastSkipReason = nil
    return .failed(reason)
  }
}
