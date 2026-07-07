import AVFoundation
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

  func testFluidAudioTranscriptCleaningDropsDecoderPunctuationOnlyOutput() {
    XCTAssertEqual(FluidAudioLocalTranscriptionService.cleanedTranscript(" ... "), "")
    XCTAssertEqual(
      FluidAudioLocalTranscriptionService.cleanedTranscript(" ... What should I focus on? "),
      "What should I focus on?"
    )
  }

  func testFluidAudioPCMConversionUsesLittleEndianInt16() {
    var data = Data()
    for raw in [Int16(-16_384), Int16(0), Int16(16_384)] {
      var sample = raw.littleEndian
      withUnsafeBytes(of: &sample) { data.append(contentsOf: $0) }
    }

    let floats = FluidAudioLocalTranscriptionService.floatSamples(fromPCM16LE: data)

    XCTAssertEqual(floats.count, 3)
    XCTAssertEqual(floats[0], -0.5, accuracy: 0.0001)
    XCTAssertEqual(floats[1], 0.0, accuracy: 0.0001)
    XCTAssertEqual(floats[2], 0.5, accuracy: 0.0001)
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
