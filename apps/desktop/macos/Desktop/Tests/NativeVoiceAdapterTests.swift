import AVFoundation
@testable import IntentiveDesktopCore
@testable import IntentiveDesktopNativeAdapters
import XCTest

final class NativeVoiceAdapterTests: XCTestCase {
  func testFloat32MonoBufferEncodesLittleEndianPCM16() throws {
    let format = try XCTUnwrap(
      AVAudioFormat(
        commonFormat: .pcmFormatFloat32,
        sampleRate: 16_000,
        channels: 1,
        interleaved: false
      )
    )
    let buffer = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4))
    buffer.frameLength = 4
    let channel = try XCTUnwrap(buffer.floatChannelData?[0])
    channel[0] = -1.0
    channel[1] = -0.5
    channel[2] = 0.0
    channel[3] = 0.5

    let data = NativeMicrophoneAudioCaptureService.encodePCM16LE(fromMonoFloat32: buffer)

    XCTAssertEqual(samples(fromPCM16LE: data), [-32_767, -16_384, 0, 16_384])
  }

  // MARK: - FluidAudio/Parakeet transcription helpers

  func testFluidAudioTranscriptCleaningDropsDecoderPunctuationOnlyOutput() {
    XCTAssertEqual(FluidAudioTranscriptionService.cleanedTranscript(" ... "), "")
    XCTAssertEqual(
      FluidAudioTranscriptionService.cleanedTranscript(" ... What should I focus on? "),
      "What should I focus on?"
    )
  }

  func testFluidAudioPCMConversionUsesLittleEndianInt16() {
    var data = Data()
    for raw in [Int16(-16_384), Int16(0), Int16(16_384)] {
      var sample = raw.littleEndian
      withUnsafeBytes(of: &sample) { data.append(contentsOf: $0) }
    }

    let floats = FluidAudioTranscriptionService.floatSamples(fromPCM16LE: data)

    XCTAssertEqual(floats.count, 3)
    XCTAssertEqual(floats[0], -0.5, accuracy: 0.0001)
    XCTAssertEqual(floats[1], 0.0, accuracy: 0.0001)
    XCTAssertEqual(floats[2], 0.5, accuracy: 0.0001)
  }

  func testFluidAudioTranscriptionRejectsEmptyAudioBeforeModelLoad() async {
    // Empty audio fails fast, before the Parakeet model is ever downloaded/loaded.
    let service = FluidAudioTranscriptionService()
    do {
      _ = try await service.transcribe(Data())
      XCTFail("Expected empty audio to throw")
    } catch let error as FluidAudioTranscriptionError {
      XCTAssertEqual(error, .emptyAudio)
    } catch {
      XCTFail("Unexpected error: \(error)")
    }
  }

  func testFluidAudioTranscriptionReturnsEmptyForDeadSilenceWithoutLoadingModel() async throws {
    // Below-noise-floor audio short-circuits to "" without touching the model, so this
    // stays hermetic (no ~1 GB Parakeet download in CI).
    var data = Data()
    for _ in 0..<1_024 {
      var sample = Int16(1).littleEndian
      withUnsafeBytes(of: &sample) { data.append(contentsOf: $0) }
    }
    let service = FluidAudioTranscriptionService()

    let transcript = try await service.transcribe(data)

    XCTAssertEqual(transcript, "")
  }

  // MARK: - Silero-backed voice-activity gate

  func testVoiceActivityGateAcceptsSustainedSpeechFrames() async {
    let probabilities = Array(repeating: Float(0), count: 2)
      + Array(repeating: Float(0.9), count: 3)
      + Array(repeating: Float(0), count: 7)
    let vad = FakeVADPredictor(probabilities: probabilities)
    let gate = PushToTalkVoiceActivityGate(vad: vad)

    let hasSpeech = await gate.containsSpeech(pcm16kFrames(12))

    XCTAssertTrue(hasSpeech)
    XCTAssertEqual(vad.resetCount, 1)
    XCTAssertEqual(vad.predictCallCount, 12)
  }

  func testVoiceActivityGateRejectsSilenceFrames() async {
    let vad = FakeVADPredictor(probabilities: Array(repeating: Float(0.1), count: 12))
    let gate = PushToTalkVoiceActivityGate(vad: vad)

    let hasSpeech = await gate.containsSpeech(pcm16kFrames(12))

    XCTAssertFalse(hasSpeech)
    XCTAssertEqual(vad.predictCallCount, 12)
  }
}

private func samples(fromPCM16LE data: Data) -> [Int16] {
  data.withUnsafeBytes { raw in
    var samples: [Int16] = []
    for index in 0..<(data.count / 2) {
      let low = UInt16(raw[index * 2])
      let high = UInt16(raw[index * 2 + 1]) << 8
      samples.append(Int16(bitPattern: high | low))
    }
    return samples
  }
}

/// Alternating ±1024 samples: a high zero-crossing-rate signal the energy/ZCR
/// heuristic rejects, so the gate always falls through to the injected VAD.
private func pcm16kFrames(_ frameCount: Int) -> Data {
  var data = Data(capacity: frameCount * 512 * 2)
  for index in 0..<(frameCount * 512) {
    var value = Int16(index.isMultiple(of: 2) ? 1024 : -1024).littleEndian
    withUnsafeBytes(of: &value) { data.append(contentsOf: $0) }
  }
  return data
}

private final class FakeVADPredictor: PushToTalkVADPredictor {
  private let probabilities: [Float]
  private var index = 0
  private(set) var resetCount = 0
  private(set) var predictCallCount = 0

  init(probabilities: [Float]) {
    self.probabilities = probabilities
  }

  func resetStates() {
    resetCount += 1
    index = 0
  }

  func predict(_ samples: [Float]) -> Float {
    defer {
      index += 1
      predictCallCount += 1
    }
    guard index < probabilities.count else { return 0 }
    return probabilities[index]
  }
}
