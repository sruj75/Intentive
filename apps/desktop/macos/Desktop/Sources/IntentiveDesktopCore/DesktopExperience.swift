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
  func containsSpeech(_ pcm16k: Data) -> Bool
}

public protocol LocalTranscriptionService {
  func transcribe(_ pcm16k: Data) async throws -> String
}

public struct EnergyVoiceActivityGate: VoiceActivityGate {
  public var rmsThreshold: Int

  public init(threshold: Float = 0.01) {
    rmsThreshold = Int(threshold * 32_768)
  }

  public init(rmsThreshold: Int) {
    self.rmsThreshold = rmsThreshold
  }

  public func containsSpeech(_ pcm16k: Data) -> Bool {
    PushToTalkTurnGate.audioEnergy(pcm16k: pcm16k).rms > rmsThreshold
  }
}

public struct PushToTalkVoiceActivityGate: VoiceActivityGate {
  private let vad: PushToTalkVADPredictor?

  public init(vad: PushToTalkVADPredictor? = nil) {
    self.vad = vad
  }

  public func containsSpeech(_ pcm16k: Data) -> Bool {
    PushToTalkTurnGate.turnHasSpeech(pcm16k: pcm16k, vad: vad)
  }
}

public struct DeterministicLocalTranscriptionService: LocalTranscriptionService {
  public init() {}

  public func transcribe(_ pcm16k: Data) async throws -> String {
    guard !pcm16k.isEmpty else { return "" }
    return "Captured voice message"
  }
}

public final class PushToTalkManager {
  private let audioCapture: AudioCaptureService
  private let voiceGate: VoiceActivityGate
  private let transcription: LocalTranscriptionService
  private let runtimeClient: RuntimeChatClient

  public init(
    audioCapture: AudioCaptureService,
    voiceGate: VoiceActivityGate = PushToTalkVoiceActivityGate(),
    transcription: LocalTranscriptionService = DeterministicLocalTranscriptionService(),
    runtimeClient: RuntimeChatClient
  ) {
    self.audioCapture = audioCapture
    self.voiceGate = voiceGate
    self.transcription = transcription
    self.runtimeClient = runtimeClient
  }

  @discardableResult
  public func captureAndSend() async throws -> ChatMessage? {
    let pcm16k = try await audioCapture.capturePushToTalkAudio()
    guard voiceGate.containsSpeech(pcm16k) else { return nil }
    let transcript = try await transcription.transcribe(pcm16k)
    guard !transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    return try runtimeClient.sendUserMessage(transcript)
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
  private let notifications: DesktopNotificationSink
  private let overlay: DesktopOverlaySink
  private let runtimeClient: RuntimeChatClient

  public init(
    notifications: DesktopNotificationSink,
    overlay: DesktopOverlaySink,
    runtimeClient: RuntimeChatClient
  ) {
    self.notifications = notifications
    self.overlay = overlay
    self.runtimeClient = runtimeClient
  }

  public func handle(_ message: CompanionMessage) throws {
    guard message.viaPostMessageBack else { return }
    notifications.deliver(title: "Intentive", body: message.body)
    overlay.showNudge(body: message.body)
    try runtimeClient.acknowledge(messageId: message.messageId)
  }
}

public final class CaptureCoordinator {
  private let compiler: ContextCompiler
  private let screenMemory: ScreenMemoryStore
  private let publisher: PerceptionPublisher

  public init(
    compiler: ContextCompiler,
    screenMemory: ScreenMemoryStore,
    publisher: PerceptionPublisher
  ) {
    self.compiler = compiler
    self.screenMemory = screenMemory
    self.publisher = publisher
  }

  public func accept(frame: CapturedFrame) throws -> [PerceptionEvent] {
    let artifacts = try compiler.compile(frame: frame)
    var events: [PerceptionEvent] = []
    for artifact in artifacts {
      if artifact.artifactType == .searchableScreenRecord {
        screenMemory.add(
          ScreenMemoryRecord(
            id: artifact.id,
            capturedAt: artifact.capturedAt,
            appName: stringSignal(artifact.signals["app"]) ?? "Unknown",
            windowTitle: "",
            summary: artifact.summary,
            ocrText: artifact.summary,
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
    let frame = try await source.captureFrame()
    return try accept(frame: frame.withoutRawFrameBytes())
  }

  private func stringSignal(_ value: JSONValue?) -> String? {
    guard case .string(let text) = value else { return nil }
    return text
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

@MainActor
public final class ScreenMemoryCaptureLoop {
  public nonisolated static let defaultIntervalSeconds: TimeInterval = 3

  private let coordinator: CaptureCoordinator
  private let source: DesktopCaptureSource
  private let settingsProvider: () -> CompilerSettings
  private let permissionProvider: () -> Bool
  private let intervalSeconds: TimeInterval
  private var task: Task<Void, Never>?

  public private(set) var state: ScreenMemoryCaptureLoopState

  public init(
    coordinator: CaptureCoordinator,
    source: DesktopCaptureSource,
    settingsProvider: @escaping () -> CompilerSettings = { CompilerSettings() },
    permissionProvider: @escaping () -> Bool = { true },
    intervalSeconds: TimeInterval = ScreenMemoryCaptureLoop.defaultIntervalSeconds,
    initialState: ScreenMemoryCaptureLoopState = ScreenMemoryCaptureLoopState()
  ) {
    self.coordinator = coordinator
    self.source = source
    self.settingsProvider = settingsProvider
    self.permissionProvider = permissionProvider
    self.intervalSeconds = max(0.2, intervalSeconds)
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
    guard settingsProvider().captureEnabled else {
      state.skippedCaptureCount += 1
      state.lastSkipReason = "capture disabled"
      state.lastError = nil
      return .skipped("capture disabled")
    }

    guard permissionProvider() else {
      state.skippedCaptureCount += 1
      state.lastSkipReason = "screen recording permission required"
      state.lastError = nil
      return .skipped("screen recording permission required")
    }

    do {
      let events = try await coordinator.captureOnce(from: source)
      state.capturedFrameCount += 1
      state.publishedEventCount += events.count
      state.lastCapturedAt = events.first?.capturedAt
      state.lastError = nil
      state.lastSkipReason = nil
      return .captured(eventCount: events.count)
    } catch {
      state.failedCaptureCount += 1
      state.lastError = error.localizedDescription
      state.lastSkipReason = nil
      return .failed(error.localizedDescription)
    }
  }

  private var intervalNanoseconds: UInt64 {
    UInt64(intervalSeconds * 1_000_000_000)
  }
}
