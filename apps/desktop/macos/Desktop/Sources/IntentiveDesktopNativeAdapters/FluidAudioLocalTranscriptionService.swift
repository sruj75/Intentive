import FluidAudio
import Foundation
import IntentiveDesktopCore

public final class FluidAudioLocalTranscriptionService: LocalTranscriptionService, @unchecked Sendable {
  private let minimumRMS: Float
  private let modelLoader: FluidAudioModelLoader

  public init(language: String = "en", minimumRMS: Float = 0.004) {
    self.minimumRMS = minimumRMS
    modelLoader = FluidAudioModelLoader(language: language)
  }

  public func transcribe(_ pcm16k: Data) async throws -> String {
    let samples = Self.floatSamples(fromPCM16LE: pcm16k)
    guard !samples.isEmpty else { return "" }
    guard Self.rms(samples) > minimumRMS else { return "" }

    let manager = try await modelLoader.loadedManager()
    var decoderState = try TdtDecoderState()
    let result = try await manager.transcribe(samples, decoderState: &decoderState, language: nil)
    return Self.cleanedTranscript(result.text)
  }

  static func cleanedTranscript(_ text: String) -> String {
    var cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
    while let first = cleaned.first, !first.isLetter && !first.isNumber {
      cleaned.removeFirst()
    }
    cleaned = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
    guard cleaned.contains(where: { $0.isLetter || $0.isNumber }) else { return "" }
    return cleaned
  }

  static func floatSamples(fromPCM16LE data: Data) -> [Float] {
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

  static func rms(_ samples: [Float]) -> Float {
    guard !samples.isEmpty else { return 0 }
    let sumSquares = samples.reduce(Float(0)) { $0 + ($1 * $1) }
    return (sumSquares / Float(samples.count)).squareRoot()
  }
}

private actor FluidAudioModelLoader {
  private let language: String
  private var managerTask: Task<AsrManager, Error>?

  init(language: String) {
    self.language = language
  }

  func loadedManager() async throws -> AsrManager {
    if let managerTask {
      return try await managerTask.value
    }

    let language = language
    let task = Task<AsrManager, Error> {
      let version: AsrModelVersion = language.hasPrefix("en") ? .v2 : .v3
      let models = try await AsrModels.downloadAndLoad(version: version)
      let manager = AsrManager()
      try await manager.loadModels(models)
      return manager
    }
    managerTask = task
    return try await task.value
  }
}
