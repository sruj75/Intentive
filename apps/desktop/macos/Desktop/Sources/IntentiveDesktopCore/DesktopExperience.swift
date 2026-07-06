import Foundation

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
    try runtimeClient.sendUserMessage(body)
  }
}

public protocol AudioCaptureService {
  func capturePushToTalkAudio() async throws -> [Float]
}

public protocol VoiceActivityGate {
  func containsSpeech(_ samples: [Float]) -> Bool
}

public protocol LocalTranscriptionService {
  func transcribe(_ samples: [Float]) async throws -> String
}

public struct EnergyVoiceActivityGate: VoiceActivityGate {
  public var threshold: Float

  public init(threshold: Float = 0.01) {
    self.threshold = threshold
  }

  public func containsSpeech(_ samples: [Float]) -> Bool {
    let energy = samples.reduce(Float.zero) { $0 + abs($1) }
    return energy / Float(max(samples.count, 1)) > threshold
  }
}

public struct DeterministicLocalTranscriptionService: LocalTranscriptionService {
  public init() {}

  public func transcribe(_ samples: [Float]) async throws -> String {
    guard !samples.isEmpty else { return "" }
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
    voiceGate: VoiceActivityGate = EnergyVoiceActivityGate(),
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
    let samples = try await audioCapture.capturePushToTalkAudio()
    guard voiceGate.containsSpeech(samples) else { return nil }
    let transcript = try await transcription.transcribe(samples)
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

  private func stringSignal(_ value: JSONValue?) -> String? {
    guard case .string(let text) = value else { return nil }
    return text
  }
}

public struct EmptyAudioCaptureService: AudioCaptureService {
  public init() {}

  public func capturePushToTalkAudio() async throws -> [Float] {
    []
  }
}
