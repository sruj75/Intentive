import CoreGraphics
@testable import IntentiveDesktopCore
@testable import IntentiveDesktopNativeAdapters
import Vision
import XCTest

final class NativeScreenMemoryOCRAdapterTests: XCTestCase {
  func testOmiDerivedAdapterKeepsAccurateCorrectedEnglishRecognitionConfiguration() {
    XCTAssertEqual(OmiScreenMemoryOCRAdapter.recognitionLevel, .accurate)
    XCTAssertTrue(OmiScreenMemoryOCRAdapter.usesLanguageCorrection)
    XCTAssertEqual(OmiScreenMemoryOCRAdapter.recognitionLanguages, ["en-US"])
    XCTAssertEqual(OmiScreenMemoryOCRAdapter.duplicateThreshold, 5)
  }

  func testOmiDerivedDHashAndHammingThresholdClassifySmallFrameChangesAsDuplicates() throws {
    let descending = try grayscaleImage(
      pixels: Array(repeating: [255, 224, 192, 160, 128, 96, 64, 32, 0], count: 8).flatMap { $0 }
    )
    let hash = OmiScreenMemoryOCRAdapter.dHash(of: descending)

    XCTAssertEqual(hash, UInt64.max)
    XCTAssertEqual(ScreenMemoryArchive.hammingDistance(hash, hash ^ 0b1_1111), 5)
    XCTAssertLessThanOrEqual(
      ScreenMemoryArchive.hammingDistance(hash, hash ^ 0b1_1111),
      OmiScreenMemoryOCRAdapter.duplicateThreshold
    )
    XCTAssertGreaterThan(
      ScreenMemoryArchive.hammingDistance(hash, hash ^ 0b11_1111),
      OmiScreenMemoryOCRAdapter.duplicateThreshold
    )
  }

  private func grayscaleImage(pixels: [UInt8]) throws -> CGImage {
    let width = 9
    let height = 8
    XCTAssertEqual(pixels.count, width * height)
    let data = Data(pixels) as CFData
    let provider = try XCTUnwrap(CGDataProvider(data: data))
    return try XCTUnwrap(
      CGImage(
        width: width,
        height: height,
        bitsPerComponent: 8,
        bitsPerPixel: 8,
        bytesPerRow: width,
        space: CGColorSpaceCreateDeviceGray(),
        bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
        provider: provider,
        decode: nil,
        shouldInterpolate: false,
        intent: .defaultIntent
      )
    )
  }
}
