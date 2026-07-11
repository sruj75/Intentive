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

  func testRunAnywhereTranscriptCleaningDropsDecoderPunctuationOnlyOutput() {
    XCTAssertEqual(RunAnywhereTranscriptionService.cleanedTranscript(" ... "), "")
    XCTAssertEqual(
      RunAnywhereTranscriptionService.cleanedTranscript(" ... What should I focus on? "),
      "What should I focus on?"
    )
  }

  func testRunAnywherePCMConversionUsesLittleEndianInt16() {
    var data = Data()
    for raw in [Int16(-16_384), Int16(0), Int16(16_384)] {
      var sample = raw.littleEndian
      withUnsafeBytes(of: &sample) { data.append(contentsOf: $0) }
    }

    let floats = RunAnywhereTranscriptionService.floatSamples(fromPCM16LE: data)

    XCTAssertEqual(floats.count, 3)
    XCTAssertEqual(floats[0], -0.5, accuracy: 0.0001)
    XCTAssertEqual(floats[1], 0.0, accuracy: 0.0001)
    XCTAssertEqual(floats[2], 0.5, accuracy: 0.0001)
  }

  func testRunAnywhereTranscriptionUsesClientAndCleansTranscript() async throws {
    var data = Data()
    for raw in [Int16(512), Int16(-512), Int16(256), Int16(-256)] {
      var sample = raw.littleEndian
      withUnsafeBytes(of: &sample) { data.append(contentsOf: $0) }
    }
    let client = FakeRunAnywhereVoiceClient(transcript: " ... What should I focus on? ")
    let service = RunAnywhereTranscriptionService(client: client, minimumRMS: 0)

    let transcript = try await service.transcribe(data)

    XCTAssertEqual(transcript, "What should I focus on?")
    XCTAssertEqual(client.warmUpCallCount, 1)
    XCTAssertEqual(client.transcriptionInputs, [data])
  }

  func testRunAnywhereTranscriptionRejectsEmptyAudioBeforeClientCall() async {
    let client = FakeRunAnywhereVoiceClient(transcript: "ignored")
    let service = RunAnywhereTranscriptionService(client: client)

    do {
      _ = try await service.transcribe(Data())
      XCTFail("Expected empty audio to throw")
    } catch let error as RunAnywhereTranscriptionError {
      XCTAssertEqual(error, .emptyAudio)
    } catch {
      XCTFail("Unexpected error: \(error)")
    }

    XCTAssertEqual(client.warmUpCallCount, 0)
    XCTAssertTrue(client.transcriptionInputs.isEmpty)
  }

  func testRunAnywhereVoiceActivityGateAcceptsSustainedSpeechFrames() async {
    let probabilities = Array(repeating: Float(0), count: 2)
      + Array(repeating: Float(0.9), count: 3)
      + Array(repeating: Float(0), count: 7)
    let client = FakeRunAnywhereVoiceClient(transcript: "", vadProbabilities: probabilities)
    let gate = RunAnywhereVoiceActivityGate(client: client)

    let hasSpeech = await gate.containsSpeech(pcm16kFrames(12))

    XCTAssertTrue(hasSpeech)
    XCTAssertEqual(client.warmUpCallCount, 1)
    XCTAssertEqual(client.vadFrameInputs.count, 12)
  }

  func testRunAnywhereVoiceActivityGateRejectsSilenceFrames() async {
    let client = FakeRunAnywhereVoiceClient(
      transcript: "",
      vadProbabilities: Array(repeating: Float(0.1), count: 12)
    )
    let gate = RunAnywhereVoiceActivityGate(client: client)

    let hasSpeech = await gate.containsSpeech(pcm16kFrames(12))

    XCTAssertFalse(hasSpeech)
    XCTAssertEqual(client.vadFrameInputs.count, 12)
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

private func pcm16kFrames(_ frameCount: Int) -> Data {
  var data = Data(capacity: frameCount * 512 * 2)
  for index in 0..<(frameCount * 512) {
    var value = Int16(index.isMultiple(of: 2) ? 1024 : -1024).littleEndian
    withUnsafeBytes(of: &value) { data.append(contentsOf: $0) }
  }
  return data
}

private final class FakeRunAnywhereVoiceClient: RunAnywhereVoiceClient, @unchecked Sendable {
  private let transcript: String
  private let vadProbabilities: [Float]
  private var vadIndex = 0
  private(set) var warmUpCallCount = 0
  private(set) var transcriptionInputs: [Data] = []
  private(set) var vadFrameInputs: [[Float]] = []

  init(transcript: String, vadProbabilities: [Float] = []) {
    self.transcript = transcript
    self.vadProbabilities = vadProbabilities
  }

  func warmUp() async throws {
    warmUpCallCount += 1
  }

  func transcribe(_ pcm16k: Data) async throws -> String {
    transcriptionInputs.append(pcm16k)
    return transcript
  }

  func vadProbability(_ frame512: [Float]) async throws -> Float {
    vadFrameInputs.append(frame512)
    defer { vadIndex += 1 }
    guard vadIndex < vadProbabilities.count else { return 0 }
    return vadProbabilities[vadIndex]
  }
}
