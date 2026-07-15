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

  @discardableResult
  public func submit(_ body: String) throws -> ChatMessage {
    let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      throw FloatingBarSubmissionError.emptyMessage
    }
    return try runtimeClient.sendUserMessage(trimmed)
  }
}

public protocol AudioCaptureService {
  func capturePushToTalkAudio() async throws -> Data
}

public protocol VoiceActivityGate {
  func containsSpeech(_ pcm16k: Data) async -> Bool
}

public protocol LocalTranscriptionService {
  func transcribe(_ pcm16k: Data) async throws -> String
}

public enum PushToTalkTranscriptionError: Error, Equatable, LocalizedError {
  case unavailable

  public var errorDescription: String? {
    switch self {
    case .unavailable:
      return "Local push-to-talk transcription is not configured."
    }
  }
}

public struct EnergyVoiceActivityGate: VoiceActivityGate {
  public var rmsThreshold: Int

  public init(threshold: Float = 0.01) {
    rmsThreshold = Int(threshold * 32_768)
  }

  public init(rmsThreshold: Int) {
    self.rmsThreshold = rmsThreshold
  }

  public func containsSpeech(_ pcm16k: Data) async -> Bool {
    PushToTalkTurnGate.audioEnergy(pcm16k: pcm16k).rms > rmsThreshold
  }
}

public struct PushToTalkVoiceActivityGate: VoiceActivityGate {
  private let vad: PushToTalkVADPredictor?

  public init(vad: PushToTalkVADPredictor? = nil) {
    self.vad = vad
  }

  public func containsSpeech(_ pcm16k: Data) async -> Bool {
    PushToTalkTurnGate.turnHasSpeech(pcm16k: pcm16k, vad: vad)
  }
}

public struct UnavailableLocalTranscriptionService: LocalTranscriptionService {
  public init() {}

  public func transcribe(_ pcm16k: Data) async throws -> String {
    throw PushToTalkTranscriptionError.unavailable
  }
}

/// Push-to-talk dictation. Captures a microphone turn, screens it with the
/// voice-activity gate, and transcribes it on device. The transcript is
/// returned for the caller to place in the composer for review — dictation
/// never sends on its own. This is why the manager holds no runtime client:
/// the "fill the composer, do not send" decision lives entirely at the call
/// site (see ADR-0007; contrast ADR-0004's captured-audio → user_message path).
/// Returns nil when the turn contains no speech or transcribes to empty text.
public final class PushToTalkManager {
  private let audioCapture: AudioCaptureService
  private let voiceGate: VoiceActivityGate
  private let transcription: LocalTranscriptionService

  public init(
    audioCapture: AudioCaptureService,
    voiceGate: VoiceActivityGate = PushToTalkVoiceActivityGate(),
    transcription: LocalTranscriptionService = UnavailableLocalTranscriptionService()
  ) {
    self.audioCapture = audioCapture
    self.voiceGate = voiceGate
    self.transcription = transcription
  }

  public func captureTranscript() async throws -> String? {
    let pcm16k = try await audioCapture.capturePushToTalkAudio()
    return try await transcript(fromPCM16k: pcm16k)
  }

  public func transcript(fromPCM16k pcm16k: Data) async throws -> String? {
    guard await voiceGate.containsSpeech(pcm16k) else { return nil }
    let transcript = try await transcription.transcribe(pcm16k)
    let trimmed = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }
}

public enum PushToTalkShortcutState: Equatable, Sendable {
  case idle
  case listening
  case pendingLockDecision
  case lockedListening
  case finalizing
}

public enum PushToTalkShortcutAction: Equatable, Sendable {
  case startRecording
  case stopRecordingAndSend
  case stopRecordingAndHoldForLock
  case sendPendingRecording
  case discardPendingRecording
  case schedulePendingLockTimeout(after: TimeInterval)
  case cancelPendingLockTimeout
}

public struct PushToTalkShortcutStateMachine: Sendable {
  public private(set) var state: PushToTalkShortcutState
  public var doubleTapThreshold: TimeInterval
  public var tapToLockMaxHoldDuration: TimeInterval
  public var doubleTapForLock: Bool

  private var lastDownAt: TimeInterval?

  public init(
    state: PushToTalkShortcutState = .idle,
    doubleTapThreshold: TimeInterval = 0.4,
    tapToLockMaxHoldDuration: TimeInterval = 0.22,
    doubleTapForLock: Bool = true
  ) {
    self.state = state
    self.doubleTapThreshold = doubleTapThreshold
    self.tapToLockMaxHoldDuration = tapToLockMaxHoldDuration
    self.doubleTapForLock = doubleTapForLock
  }

  public mutating func shortcutDown(at now: TimeInterval) -> [PushToTalkShortcutAction] {
    switch state {
    case .idle:
      lastDownAt = now
      state = .listening
      return [.startRecording]
    case .pendingLockDecision:
      lastDownAt = now
      state = .lockedListening
      return [.cancelPendingLockTimeout, .discardPendingRecording, .startRecording]
    case .lockedListening:
      state = .finalizing
      return [.stopRecordingAndSend]
    case .listening, .finalizing:
      return []
    }
  }

  public mutating func shortcutUp(at now: TimeInterval) -> [PushToTalkShortcutAction] {
    switch state {
    case .listening:
      let holdDuration = now - (lastDownAt ?? now)
      lastDownAt = nil
      if doubleTapForLock && holdDuration < tapToLockMaxHoldDuration {
        state = .pendingLockDecision
        return [
          .stopRecordingAndHoldForLock,
          .schedulePendingLockTimeout(after: doubleTapThreshold),
        ]
      }
      state = .finalizing
      return [.stopRecordingAndSend]
    case .idle, .pendingLockDecision, .lockedListening, .finalizing:
      return []
    }
  }

  public mutating func pendingLockTimeout() -> [PushToTalkShortcutAction] {
    guard state == .pendingLockDecision else { return [] }
    state = .finalizing
    return [.sendPendingRecording]
  }

  public mutating func finishProcessing() {
    state = .idle
    lastDownAt = nil
  }

  public mutating func cancel() -> [PushToTalkShortcutAction] {
    state = .idle
    lastDownAt = nil
    return [.cancelPendingLockTimeout, .discardPendingRecording]
  }
}

public protocol DesktopNotificationSink: AnyObject {
  func deliver(title: String, body: String)
}

public protocol DesktopOverlaySink: AnyObject {
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

  public init() {}

  public func showNudge(body: String) {
    nudges.append(body)
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
    overlay.showNudge(body: message.body)
    try runtimeClient.acknowledge(messageId: message.messageId)
  }
}

public final class CaptureCoordinator {
  private let compiler: ContextCompiler
  private let screenMemory: ScreenMemoryStore
  private let publisher: PerceptionPublisher
  private let archiveProvider: () -> ScreenMemoryArchive?

  public init(
    compiler: ContextCompiler,
    screenMemory: ScreenMemoryStore,
    publisher: PerceptionPublisher,
    archiveProvider: @escaping () -> ScreenMemoryArchive? = { nil }
  ) {
    self.compiler = compiler
    self.screenMemory = screenMemory
    self.publisher = publisher
    self.archiveProvider = archiveProvider
  }

  public func accept(frame: CapturedFrame) throws -> [PerceptionEvent] {
    try accept(frame: frame, storesSearchableRecord: true)
  }

  private func accept(
    frame: CapturedFrame,
    storesSearchableRecord: Bool
  ) throws -> [PerceptionEvent] {
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
      guard compiler.currentSettings.captureEnabled, !compiler.currentSettings.isExcluded(appName: context.appName) else {
        return []
      }
    }
    let frame = try await source.captureFrame()
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

public struct EmptyAudioCaptureService: AudioCaptureService {
  public init() {}

  public func capturePushToTalkAudio() async throws -> Data {
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
  private let now: () -> Date
  private let intervalSeconds: TimeInterval
  private var cadenceGate: DesktopCaptureCadenceGate
  private var task: Task<Void, Never>?

  public private(set) var state: ScreenMemoryCaptureLoopState

  public init(
    coordinator: CaptureCoordinator,
    source: DesktopCaptureSource,
    settingsProvider: @escaping () -> CompilerSettings = { CompilerSettings() },
    permissionProvider: @escaping () -> Bool = { true },
    now: @escaping () -> Date = { Date() },
    intervalSeconds: TimeInterval = ScreenMemoryCaptureLoop.defaultIntervalSeconds,
    cadenceGate: DesktopCaptureCadenceGate = DesktopCaptureCadenceGate(),
    initialState: ScreenMemoryCaptureLoopState = ScreenMemoryCaptureLoopState()
  ) {
    self.coordinator = coordinator
    self.source = source
    self.settingsProvider = settingsProvider
    self.permissionProvider = permissionProvider
    self.now = now
    self.intervalSeconds = max(0.2, intervalSeconds)
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
    guard settings.captureEnabled else {
      return recordSkip("capture disabled")
    }

    guard permissionProvider() else {
      return recordSkip("screen recording permission required")
    }

    let captureStartedAt = now()
    var windowContext: DesktopWindowContext?
    if let contextSource = source as? DesktopWindowContextSource {
      do {
        let context = try contextSource.activeWindowContext()
        windowContext = context
        guard !settings.isExcluded(appName: context.appName) else {
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
    UInt64(intervalSeconds * 1_000_000_000)
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

  private let coordinator: AmbientAudioCoordinator
  private let audioCapture: AudioCaptureService
  private let voiceGate: VoiceActivityGate
  private let transcription: LocalTranscriptionService
  private let settingsProvider: () -> CompilerSettings
  private let permissionProvider: () -> Bool
  private let activeWindowProvider: (() throws -> DesktopWindowContext?)?
  private let now: () -> Date
  private let intervalSeconds: TimeInterval
  private var cadenceGate: AmbientAudioCadenceGate
  private var task: Task<Void, Never>?

  public private(set) var state: AmbientAudioCaptureLoopState

  public init(
    coordinator: AmbientAudioCoordinator,
    audioCapture: AudioCaptureService,
    voiceGate: VoiceActivityGate,
    transcription: LocalTranscriptionService,
    settingsProvider: @escaping () -> CompilerSettings = { CompilerSettings() },
    permissionProvider: @escaping () -> Bool = { true },
    activeWindowProvider: (() throws -> DesktopWindowContext?)? = nil,
    now: @escaping () -> Date = { Date() },
    intervalSeconds: TimeInterval = AmbientAudioCaptureLoop.defaultIntervalSeconds,
    cadenceGate: AmbientAudioCadenceGate = AmbientAudioCadenceGate(),
    initialState: AmbientAudioCaptureLoopState = AmbientAudioCaptureLoopState()
  ) {
    self.coordinator = coordinator
    self.audioCapture = audioCapture
    self.voiceGate = voiceGate
    self.transcription = transcription
    self.settingsProvider = settingsProvider
    self.permissionProvider = permissionProvider
    self.activeWindowProvider = activeWindowProvider
    self.now = now
    self.intervalSeconds = max(1, intervalSeconds)
    self.cadenceGate = cadenceGate
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
    guard settings.captureEnabled else {
      return recordSkip("capture disabled")
    }
    guard settings.ambientAudioCaptureEnabled else {
      return recordSkip("ambient audio capture disabled")
    }
    guard permissionProvider() else {
      return recordSkip("microphone permission required")
    }

    do {
      if let context = try activeWindowProvider?(), settings.isExcluded(appName: context.appName) {
        return recordSkip("current app skipped")
      }
    } catch {
      return recordFailure(error.localizedDescription)
    }

    let periodStartDate = now()
    do {
      let pcm16k = try await audioCapture.capturePushToTalkAudio()
      guard await voiceGate.containsSpeech(pcm16k) else {
        return recordSkip("no speech detected")
      }
      let rawTranscriptText = try await transcription.transcribe(pcm16k)
      let transcriptText = rawTranscriptText.trimmingCharacters(in: .whitespacesAndNewlines)
      let capturedAtDate = now()
      guard cadenceGate.shouldEmit(transcript: transcriptText, capturedAt: capturedAtDate) else {
        return recordSkip("ambient audio cadence throttled")
      }
      let transcript = AmbientAudioTranscript(
        id: UUID().uuidString,
        capturedAt: capturedAtDate.protocolTimestamp,
        periodStart: periodStartDate.protocolTimestamp,
        periodEnd: capturedAtDate.protocolTimestamp,
        transcript: transcriptText
      )
      let event = try coordinator.accept(transcript: transcript)
      state.capturedSegmentCount += 1
      state.publishedEventCount += event == nil ? 0 : 1
      state.lastCapturedAt = transcript.capturedAt
      state.lastError = nil
      state.lastSkipReason = nil
      return .captured(eventPublished: event != nil)
    } catch {
      return recordFailure(error.localizedDescription)
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
