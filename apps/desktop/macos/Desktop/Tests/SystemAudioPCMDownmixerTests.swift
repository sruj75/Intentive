import IntentiveDesktopNativeAssets
import XCTest

final class SystemAudioPCMDownmixerTests: XCTestCase {
  func testDownmixesInterleavedStereoToMono() throws {
    let buffers = [
      SystemAudioFloat32Buffer(
        samples: [1.0, 0.0, 0.5, -0.5, -1.0, 1.0],
        channelCount: 2
      )
    ]

    let mono = try XCTUnwrap(
      SystemAudioPCMDownmixer.downmix(buffers: buffers, expectedChannelCount: 2)
    )

    XCTAssertEqual(mono, [0.5, 0.0, 0.0])
  }

  func testDownmixesEveryNonInterleavedStereoBufferToMono() throws {
    let buffers = [
      SystemAudioFloat32Buffer(samples: [1.0, 0.5, -1.0], channelCount: 1),
      SystemAudioFloat32Buffer(samples: [0.0, -0.5, 1.0], channelCount: 1),
    ]

    let mono = try XCTUnwrap(
      SystemAudioPCMDownmixer.downmix(buffers: buffers, expectedChannelCount: 2)
    )

    XCTAssertEqual(mono, [0.5, 0.0, 0.0])
  }

  func testPreservesMonoSamples() throws {
    let mono = try XCTUnwrap(
      SystemAudioPCMDownmixer.downmix(
        buffers: [
          SystemAudioFloat32Buffer(samples: [-1.0, 0.25, 1.0], channelCount: 1)
        ],
        expectedChannelCount: 1
      )
    )

    XCTAssertEqual(mono, [-1.0, 0.25, 1.0])
  }
}
