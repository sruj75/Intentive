import Foundation
import IntentiveDesktopCore
import os.log

#if canImport(OnnxRuntimeBindings)
  import OnnxRuntimeBindings
#elseif canImport(onnxruntime)
  import onnxruntime
#endif

import FluidAudio

private let voiceLog = Logger(subsystem: "com.heyintentive.desktop", category: "PassiveAudio")

// MARK: - Silero VAD (ONNX Runtime)

/// Wraps the Silero VAD ONNX model for speech-probability inference. Restored from
/// Omi's `VADGateService` `SileroVADModel` — the microphone voice-activity gate that
/// replaces RunAnywhere's VAD. Input: 512 Float32 samples at 16 kHz; output: speech
/// probability in [0, 1]. Runs on the already-resolved onnxruntime dependency.
final class SileroVADModel {
  #if canImport(OnnxRuntimeBindings) || canImport(onnxruntime)
    private let session: ORTSession
    private let env: ORTEnv
    private var state: [Float]  // [2, 1, 128] combined h+c for Silero v5
    private let stateSize = 2 * 1 * 128  // 256

    init?() {
      guard let modelPath = Bundle.module.path(forResource: "silero_vad", ofType: "onnx") else {
        voiceLog.error("SileroVADModel: silero_vad.onnx not found in bundle")
        return nil
      }
      do {
        env = try ORTEnv(loggingLevel: .warning)
        let sessionOptions = try ORTSessionOptions()
        try sessionOptions.setIntraOpNumThreads(1)
        session = try ORTSession(env: env, modelPath: modelPath, sessionOptions: sessionOptions)
        state = [Float](repeating: 0.0, count: stateSize)
      } catch {
        voiceLog.error("SileroVADModel: failed to create ONNX session: \(String(describing: error))")
        return nil
      }
    }

    /// Run inference on 512 Float32 samples. Returns speech probability.
    func predict(_ samples: [Float]) -> Float {
      assert(samples.count == 512, "Silero VAD expects exactly 512 samples")
      do {
        let inputData = NSMutableData(bytes: samples, length: samples.count * MemoryLayout<Float>.size)
        let inputTensor = try ORTValue(
          tensorData: inputData, elementType: .float, shape: [1, 512] as [NSNumber])

        let stateData = NSMutableData(bytes: state, length: state.count * MemoryLayout<Float>.size)
        let stateTensor = try ORTValue(
          tensorData: stateData, elementType: .float, shape: [2, 1, 128] as [NSNumber])

        var sr: Int64 = 16000
        let srData = NSMutableData(bytes: &sr, length: MemoryLayout<Int64>.size)
        let srTensor = try ORTValue(tensorData: srData, elementType: .int64, shape: [] as [NSNumber])

        let outputs = try session.run(
          withInputs: ["input": inputTensor, "state": stateTensor, "sr": srTensor],
          outputNames: Set(["output", "stateN"]),
          runOptions: nil)

        guard let outputValue = outputs["output"] else { return 0.0 }
        let outputData = try outputValue.tensorData() as Data
        let probability = outputData.withUnsafeBytes { $0.load(as: Float.self) }

        if let stateNValue = outputs["stateN"] {
          let stateNData = try stateNValue.tensorData() as Data
          stateNData.withUnsafeBytes { ptr in
            let floats = ptr.bindMemory(to: Float.self)
            if floats.count >= stateSize {
              for i in 0..<stateSize { state[i] = floats[i] }
            }
          }
        }
        return probability
      } catch {
        voiceLog.error("SileroVADModel: inference error: \(String(describing: error))")
        return 0.0
      }
    }

    func resetStates() {
      state = [Float](repeating: 0.0, count: stateSize)
    }
  #else
    init?() {
      voiceLog.error("SileroVADModel: onnxruntime not available — model disabled")
      return nil
    }
    func predict(_ samples: [Float]) -> Float { 0.0 }
    func resetStates() {}
  #endif
}

/// Adapts the Silero VAD model to the Core passive-audio activity seam so the
/// microphone pipeline can screen captured segments with the real model.
/// Falls back (returns nil) when the model cannot load, leaving the gate's
/// energy/zero-crossing heuristic as the safe default.
public final class SileroAudioActivityPredictor: AudioActivityPredicting {
  private let model: SileroVADModel

  public init?() {
    guard let model = SileroVADModel() else { return nil }
    self.model = model
  }

  public func resetStates() { model.resetStates() }
  public func predict(_ samples: [Float]) -> Float { model.predict(samples) }
}

// MARK: - FluidAudio / Parakeet transcription

public enum FluidAudioTranscriptionError: Error, Equatable, LocalizedError {
  case emptyAudio

  public var errorDescription: String? {
    switch self {
    case .emptyAudio: return "Local transcription audio is empty."
    }
  }
}

/// On-device speech-to-text via FluidAudio (NVIDIA Parakeet TDT, CoreML on the Apple
/// Neural Engine). Restored from Omi's `LocalTranscriptionService` and adapted to the
/// Core `LocalTranscriptionService` one-shot `Data -> String` seam that Intentive's
/// passive-audio pipeline consumes. Replaces the RunAnywhere transcription path.
///
/// The Parakeet model (~600 MB–1.2 GB) downloads from HuggingFace on first use and is
/// cached; nothing is fetched at build time. All transcription happens on device — raw
/// audio never leaves the Mac.
public final class FluidAudioTranscriptionService: LocalTranscriptionService, @unchecked Sendable {
  private let engine: ParakeetEngine
  private let minimumRMS: Float

  public init(language: String = "en", minimumRMS: Float = 0.004) {
    self.engine = ParakeetEngine(language: language)
    self.minimumRMS = minimumRMS
  }

  public func transcribe(_ pcm16k: Data) async throws -> String {
    let samples = Self.floatSamples(fromPCM16LE: pcm16k)
    guard !samples.isEmpty else { throw FluidAudioTranscriptionError.emptyAudio }
    // Only skip dead silence (noise floor); the model's own decoding filters the rest.
    guard Self.rms(samples) > minimumRMS else { return "" }
    let text = try await engine.transcribe(samples)
    return Self.cleanedTranscript(text)
  }

  /// Strip stray leading punctuation the streaming decoder prepends at window
  /// boundaries and drop windows with no real speech, mirroring Omi's `drain()`.
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
        samples.append(Float(Int16(bitPattern: high | low)) / 32_768.0)
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

/// Serializes lazy model download/load and one-shot decoding. A fresh
/// `TdtDecoderState` per window keeps the transducer decoder from drifting across
/// independent segments (Omi's per-window decode).
private actor ParakeetEngine {
  private let language: String
  private var manager: AsrManager?

  init(language: String) {
    self.language = language
  }

  func transcribe(_ samples: [Float]) async throws -> String {
    let manager = try await loadedManager()
    var decoderState = try TdtDecoderState()
    let result = try await manager.transcribe(samples, decoderState: &decoderState, language: nil)
    return result.text
  }

  private func loadedManager() async throws -> AsrManager {
    if let manager { return manager }
    // v2 = English-only (better recall); v3 = 25 European languages.
    let version: AsrModelVersion = language.hasPrefix("en") ? .v2 : .v3
    let models = try await AsrModels.downloadAndLoad(version: version)
    let manager = AsrManager()
    try await manager.loadModels(models)
    self.manager = manager
    return manager
  }
}
