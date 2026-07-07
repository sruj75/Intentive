import Foundation
import IntentiveDesktopCore
import ONNXRuntime
import RunAnywhere

public protocol RunAnywhereVoiceClient: Sendable {
  func warmUp() async throws
  func transcribe(_ pcm16k: Data) async throws -> String
  func vadProbability(_ frame512: [Float]) async throws -> Float
  func synthesize(_ text: String) -> AsyncThrowingStream<Data, Error>
}

public enum RunAnywhereTranscriptionError: Error, Equatable, LocalizedError {
  case emptyAudio

  public var errorDescription: String? {
    switch self {
    case .emptyAudio:
      return "Local transcription audio is empty."
    }
  }
}

public final class RunAnywhereTranscriptionService: LocalTranscriptionService, @unchecked Sendable {
  private let client: any RunAnywhereVoiceClient
  private let minimumRMS: Float

  public init(client: any RunAnywhereVoiceClient = DefaultRunAnywhereVoiceClient(), minimumRMS: Float = 0.004) {
    self.client = client
    self.minimumRMS = minimumRMS
  }

  public func transcribe(_ pcm16k: Data) async throws -> String {
    let samples = Self.floatSamples(fromPCM16LE: pcm16k)
    guard !samples.isEmpty else { throw RunAnywhereTranscriptionError.emptyAudio }
    guard Self.rms(samples) > minimumRMS else { return "" }

    try await client.warmUp()
    return Self.cleanedTranscript(try await client.transcribe(pcm16k))
  }

  public static func cleanedTranscript(_ text: String) -> String {
    var cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
    while let first = cleaned.first, !first.isLetter && !first.isNumber {
      cleaned.removeFirst()
    }
    cleaned = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
    guard cleaned.contains(where: { $0.isLetter || $0.isNumber }) else { return "" }
    return cleaned
  }

  public static func floatSamples(fromPCM16LE data: Data) -> [Float] {
    let sampleCount = data.count / 2
    guard sampleCount > 0 else { return [] }

    return data.withUnsafeBytes { raw in
      var samples: [Float] = []
      samples.reserveCapacity(sampleCount)
      for index in 0..<sampleCount {
        let low = UInt16(raw[index * 2])
        let high = UInt16(raw[index * 2 + 1]) << 8
        let sample = Int16(bitPattern: high | low)
        samples.append(Float(sample) / 32_768.0)
      }
      return samples
    }
  }

  public static func rms(_ samples: [Float]) -> Float {
    guard !samples.isEmpty else { return 0 }
    let sumSquares = samples.reduce(Float(0)) { $0 + ($1 * $1) }
    return (sumSquares / Float(samples.count)).squareRoot()
  }
}

public struct RunAnywhereVoiceActivityGate: VoiceActivityGate {
  private let client: any RunAnywhereVoiceClient
  private let probabilityThreshold: Float

  public init(client: any RunAnywhereVoiceClient = DefaultRunAnywhereVoiceClient(), probabilityThreshold: Float = 0.4) {
    self.client = client
    self.probabilityThreshold = probabilityThreshold
  }

  public func containsSpeech(_ pcm16k: Data) async -> Bool {
    let samples = RunAnywhereTranscriptionService.floatSamples(fromPCM16LE: pcm16k)
    guard Double(samples.count) / 16_000.0 >= PushToTalkTurnGate.minTurnAudioSeconds else { return false }
    guard samples.count >= 512 else { return false }

    do {
      try await client.warmUp()
      var maxRun = 0
      var run = 0
      var speechFrames = 0
      var index = 0
      while index + 512 <= samples.count {
        let probability = try await client.vadProbability(Array(samples[index..<(index + 512)]))
        if probability > probabilityThreshold {
          speechFrames += 1
          run += 1
          maxRun = max(maxRun, run)
        } else {
          run = 0
        }
        index += 512
      }
      return maxRun >= 3 || speechFrames >= 6
    } catch {
      return false
    }
  }
}

public final class DefaultRunAnywhereVoiceClient: RunAnywhereVoiceClient, @unchecked Sendable {
  private static let warmup = RunAnywhereVoiceWarmupState()

  private let sttModelID: String
  private let ttsVoiceID: String
  private let vadSampleRate: Int
  private let vadFrameLength: Float
  private let vadEnergyThreshold: Float
  private let ttsSampleRate: Int

  public init(
    sttModelID: String = "sherpa-onnx-whisper-tiny.en",
    ttsVoiceID: String = "piper-en-us-amy",
    vadSampleRate: Int = 16_000,
    vadFrameLength: Float = 0.032,
    vadEnergyThreshold: Float = 0.015,
    ttsSampleRate: Int = 22_050
  ) {
    self.sttModelID = sttModelID
    self.ttsVoiceID = ttsVoiceID
    self.vadSampleRate = vadSampleRate
    self.vadFrameLength = vadFrameLength
    self.vadEnergyThreshold = vadEnergyThreshold
    self.ttsSampleRate = ttsSampleRate
  }

  public func warmUp() async throws {
    try await Self.warmup.warmUp(
      sttModelID: sttModelID,
      ttsVoiceID: ttsVoiceID,
      vadSampleRate: vadSampleRate,
      vadFrameLength: vadFrameLength,
      vadEnergyThreshold: vadEnergyThreshold
    )
  }

  public func transcribe(_ pcm16k: Data) async throws -> String {
    try await warmUp()
    return try await RunAnywhere.transcribe(pcm16k)
  }

  public func vadProbability(_ frame512: [Float]) async throws -> Float {
    try await warmUp()
    let isSpeech = try await RunAnywhere.detectSpeech(in: frame512)
    return isSpeech ? 1 : 0
  }

  public func synthesize(_ text: String) -> AsyncThrowingStream<Data, Error> {
    AsyncThrowingStream { continuation in
      Task {
        do {
          try await warmUp()
          var yieldedChunk = false
          let output = try await RunAnywhere.synthesizeStream(
            text,
            options: TTSOptions(sampleRate: ttsSampleRate)
          ) { chunk in
            guard !chunk.isEmpty else { return }
            yieldedChunk = true
            continuation.yield(chunk)
          }
          if !yieldedChunk, !output.audioData.isEmpty {
            continuation.yield(output.audioData)
          }
          continuation.finish()
        } catch {
          continuation.finish(throwing: error)
        }
      }
    }
  }
}

private actor RunAnywhereVoiceWarmupState {
  private var isWarmed = false

  func warmUp(
    sttModelID: String,
    ttsVoiceID: String,
    vadSampleRate: Int,
    vadFrameLength: Float,
    vadEnergyThreshold: Float
  ) async throws {
    guard !isWarmed else { return }

    try await MainActor.run {
      try RunAnywhere.initialize(environment: .development)
      ONNX.register()
    }

    try await RunAnywhere.loadSTTModel(sttModelID)
    try await RunAnywhere.loadTTSVoice(ttsVoiceID)
    try await RunAnywhere.initializeVAD(
      VADConfiguration(
        energyThreshold: vadEnergyThreshold,
        sampleRate: vadSampleRate,
        frameLength: vadFrameLength
      )
    )
    isWarmed = true
  }
}
