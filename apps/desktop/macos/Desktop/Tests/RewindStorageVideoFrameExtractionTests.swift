import AppKit
import AVFoundation
import IntentiveDesktopCore
import IntentiveDesktopNativeAdapters
@testable import IntentiveDesktopOmiArchive
import XCTest

final class RewindStorageVideoFrameExtractionTests: XCTestCase {
  func testFailedPublicationClearsEncoderStateAndRemovesStagedMedia() async throws {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent("VideoChunkEncoderFinalizationTests-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    addTeardownBlock { try? FileManager.default.removeItem(at: root) }
    let encoder = try VideoChunkEncoder(
      videosDirectory: root,
      fileManager: FailingFinalizedMoveFileManager()
    )
    let firstWrite = try await encoder.addFrame(
      image: try solidImage(color: .red),
      timestamp: Date(timeIntervalSince1970: 1_000)
    )
    guard case .accepted(let firstLocation, _) = firstWrite else {
      return XCTFail("Expected the fixture frame to be accepted")
    }
    let stagedURL = root.appendingPathComponent(
      "\(firstLocation.chunkID.value.uuidString.lowercased()).partial.mp4"
    )

    do {
      _ = try await encoder.flushCurrentChunk()
      XCTFail("Expected the injected publication failure")
    } catch FinalizedMoveFixtureError.failed {
      // Expected.
    }

    let activeAfterFailure = await encoder.activeChunkID()
    XCTAssertNil(activeAfterFailure)
    XCTAssertFalse(FileManager.default.fileExists(atPath: stagedURL.path))

    let retryWrite = try await encoder.addFrame(
      image: try solidImage(color: .green),
      timestamp: Date(timeIntervalSince1970: 1_001)
    )
    guard case .accepted(let retryLocation, _) = retryWrite else {
      return XCTFail("Expected a new chunk after failed finalization")
    }
    XCTAssertNotEqual(retryLocation.chunkID, firstLocation.chunkID)
    await encoder.discardChunk(retryLocation.chunkID)
  }

  func testNativeArchiveExtractsRequestedSampleOrdinalFromMP4() async throws {
    try await assertSelectedMiddleFrame(frameRate: 2)
  }

  func testNativeArchiveUsesSampleOrdinalForLowCadenceMP4() async throws {
    try await assertSelectedMiddleFrame(frameRate: 1.0 / 3.0)
  }

  func testNativeArchiveReturnsNotFoundPastLastSample() async throws {
    let fixture = try await makeFixture(frameRate: 2)
    do {
      _ = try await fixture.archive.loadFrame(
        at: ScreenMemoryVideoFrameLocation(chunkID: fixture.chunkID, sampleOrdinal: 99)
      )
      XCTFail("Expected an out-of-range sample ordinal to be unavailable")
    } catch OmiScreenMemoryVideoArchiveError.frameNotFound {
      // Expected.
    }
  }

  private func assertSelectedMiddleFrame(frameRate: Double) async throws {
    let fixture = try await makeFixture(frameRate: frameRate)
    let data = try await fixture.archive.loadFrame(
      at: ScreenMemoryVideoFrameLocation(chunkID: fixture.chunkID, sampleOrdinal: 1)
    )
    let center = try XCTUnwrap(centerPixel(in: data))
    XCTAssertGreaterThan(center.green, center.red)
    XCTAssertGreaterThan(center.green, center.blue)
  }

  private func makeFixture(
    frameRate: Double
  ) async throws -> (archive: OmiScreenMemoryVideoArchive, chunkID: ScreenMemoryVideoChunkID) {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent("RewindStorageVideoFrameExtractionTests-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    addTeardownBlock { try? FileManager.default.removeItem(at: root) }
    let profile = try ScreenMemoryProfile(userID: "native-frame-fixture", rootURL: root)
    let archive = try OmiScreenMemoryVideoArchive(profile: profile)
    let chunkID = ScreenMemoryVideoChunkID(UUID())
    let url = profile.videoArchiveURL.appendingPathComponent(
      "\(chunkID.value.uuidString.lowercased()).mp4"
    )
    try await writeChunk(url: url, colors: [.red, .green, .blue], frameRate: frameRate)
    return (archive, chunkID)
  }

  private func writeChunk(url: URL, colors: [NSColor], frameRate: Double) async throws {
    let width = 96
    let height = 64
    let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    let input = AVAssetWriterInput(
      mediaType: .video,
      outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.hevc,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: [
          AVVideoExpectedSourceFrameRateKey: max(1, Int(ceil(frameRate))),
          AVVideoAllowFrameReorderingKey: false,
        ],
      ]
    )
    input.expectsMediaDataInRealTime = true
    guard writer.canAdd(input) else {
      throw XCTSkip("System HEVC writer input is unavailable")
    }
    writer.add(input)
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: input,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
        kCVPixelBufferIOSurfacePropertiesKey as String: [:],
      ]
    )
    guard writer.startWriting() else {
      throw XCTSkip("System HEVC encoder is unavailable: \(writer.error?.localizedDescription ?? "unknown")")
    }
    writer.startSession(atSourceTime: .zero)

    for (index, color) in colors.enumerated() {
      while !input.isReadyForMoreMediaData {
        try await Task.sleep(nanoseconds: 10_000_000)
      }
      let buffer = try pixelBuffer(
        width: width,
        height: height,
        color: color,
        adaptor: adaptor
      )
      guard adaptor.append(
        buffer,
        withPresentationTime: CMTime(
          seconds: Double(index) / frameRate,
          preferredTimescale: 600
        )
      ) else {
        throw OmiScreenMemoryVideoArchiveError.writerFailed(
          writer.error?.localizedDescription ?? "fixture append failed"
        )
      }
    }

    input.markAsFinished()
    let box = TestAssetWriterBox(writer)
    try await withCheckedThrowingContinuation { continuation in
      box.writer.finishWriting {
        if box.writer.status == .completed {
          continuation.resume()
        } else {
          continuation.resume(
            throwing: OmiScreenMemoryVideoArchiveError.writerFailed(
              box.writer.error?.localizedDescription ?? "fixture finalize failed"
            )
          )
        }
      }
    }
  }

  private func pixelBuffer(
    width: Int,
    height: Int,
    color: NSColor,
    adaptor: AVAssetWriterInputPixelBufferAdaptor
  ) throws -> CVPixelBuffer {
    var buffer: CVPixelBuffer?
    if let pool = adaptor.pixelBufferPool {
      CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
    } else {
      CVPixelBufferCreate(
        nil,
        width,
        height,
        kCVPixelFormatType_32BGRA,
        [kCVPixelBufferIOSurfacePropertiesKey as String: [:]] as CFDictionary,
        &buffer
      )
    }
    let pixelBuffer = try XCTUnwrap(buffer)
    CVPixelBufferLockBaseAddress(pixelBuffer, [])
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }
    let context = try XCTUnwrap(
      CGContext(
        data: CVPixelBufferGetBaseAddress(pixelBuffer),
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
          | CGBitmapInfo.byteOrder32Little.rawValue
      )
    )
    context.setFillColor(color.cgColor)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    return pixelBuffer
  }

  private func solidImage(color: NSColor) throws -> CGImage {
    let size = NSSize(width: 96, height: 64)
    let image = NSImage(size: size)
    image.lockFocus()
    color.setFill()
    NSRect(origin: .zero, size: size).fill()
    image.unlockFocus()
    return try XCTUnwrap(image.cgImage(forProposedRect: nil, context: nil, hints: nil))
  }

  private func centerPixel(in data: Data) -> (red: Int, green: Int, blue: Int)? {
    guard
      let image = NSImage(data: data),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
    else { return nil }
    let bitmap = NSBitmapImageRep(cgImage: cgImage)
    guard
      let color = bitmap.colorAt(x: bitmap.pixelsWide / 2, y: bitmap.pixelsHigh / 2)?
        .usingColorSpace(.deviceRGB)
    else { return nil }
    return (
      Int(color.redComponent * 255),
      Int(color.greenComponent * 255),
      Int(color.blueComponent * 255)
    )
  }
}

private enum FinalizedMoveFixtureError: Error {
  case failed
}

private final class FailingFinalizedMoveFileManager: FileManager, @unchecked Sendable {
  override func moveItem(at _: URL, to _: URL) throws {
    throw FinalizedMoveFixtureError.failed
  }
}

private final class TestAssetWriterBox: @unchecked Sendable {
  let writer: AVAssetWriter

  init(_ writer: AVAssetWriter) {
    self.writer = writer
  }
}
