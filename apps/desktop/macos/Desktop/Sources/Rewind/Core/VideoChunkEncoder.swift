import AppKit
import AVFoundation
import CoreGraphics
import Foundation
import IntentiveDesktopCore

/// Omi's actor-serialized H.265 chunk encoder, adapted to profile-owned opaque
/// chunk IDs and staged MP4 publication for Intentive Screen Memory.
actor VideoChunkEncoder {
  struct Configuration: Sendable {
    var chunkDuration: TimeInterval = 60
    var firstChunkDuration: TimeInterval = 5
    var frameRate: Double = 1.0 / 3.0
    var maxResolution: CGFloat = 3_000
    var aspectRatioChangeThreshold: CGFloat = 0.2
    var aspectRatioStabilityDelay: TimeInterval = 2
    var maxConsecutiveFailures = 5
    var maxConsecutiveNotReadyFailures = 3

    var maxBufferFrames: Int {
      Int(chunkDuration * frameRate) + 20
    }
  }

  private let videosDirectory: URL
  private let configuration: Configuration
  private let idFactory: @Sendable () -> UUID
  private let diagnostics: any OmiVideoArchiveDiagnostics
  private let fileManager: FileManager

  private var frameTimestamps: [Date] = []
  private var consecutiveWriteFailures = 0
  private var writerNotReadyCount = 0
  private var pendingAspectRatioSize: CGSize?
  private var pendingAspectRatioSince: Date?
  private var currentChunkStartTime: Date?
  private var currentChunkID: ScreenMemoryVideoChunkID?
  private var frameOffsetInChunk = 0
  private var assetWriter: AVAssetWriter?
  private var writerInput: AVAssetWriterInput?
  private var pixelBufferAdaptor: AVAssetWriterInputPixelBufferAdaptor?
  private var currentOutputSize: CGSize?
  private var currentChunkInputSize: CGSize?
  private var hasFinalizedAnyChunk = false

  init(
    videosDirectory: URL,
    configuration: Configuration = Configuration(),
    idFactory: @escaping @Sendable () -> UUID = { UUID() },
    diagnostics: any OmiVideoArchiveDiagnostics = NoOpOmiVideoArchiveDiagnostics(),
    fileManager: FileManager = .default
  ) throws {
    self.videosDirectory = videosDirectory
    self.configuration = configuration
    self.idFactory = idFactory
    self.diagnostics = diagnostics
    self.fileManager = fileManager
    try fileManager.createDirectory(at: videosDirectory, withIntermediateDirectories: true)
  }

  func addFrame(image: CGImage, timestamp: Date) async throws -> ScreenMemoryVideoWriteOutcome {
    var finalized: [ScreenMemoryVideoChunkFinalization] = []
    let newFrameSize = CGSize(width: image.width, height: image.height)

    if frameTimestamps.count >= configuration.maxBufferFrames {
      diagnostics.record("video_buffer_overflow")
      await emergencyReset()
    }

    if let currentInputSize = currentChunkInputSize,
       hasSignificantAspectRatioChange(from: currentInputSize, to: newFrameSize) {
      let pendingMatches = pendingAspectRatioSize.map {
        !hasSignificantAspectRatioChange(from: $0, to: newFrameSize)
      } ?? false

      if pendingMatches,
         let since = pendingAspectRatioSince,
         timestamp.timeIntervalSince(since) >= configuration.aspectRatioStabilityDelay {
        if let result = try await finalizeCurrentChunk() {
          finalized.append(result)
        }
        pendingAspectRatioSize = nil
        pendingAspectRatioSince = nil
      } else {
        if !pendingMatches {
          pendingAspectRatioSize = newFrameSize
          pendingAspectRatioSince = timestamp
        }
        return .rejected
      }
    } else {
      pendingAspectRatioSize = nil
      pendingAspectRatioSince = nil
    }

    if currentChunkStartTime == nil {
      let chunkID = ScreenMemoryVideoChunkID(idFactory())
      currentChunkStartTime = timestamp
      currentChunkID = chunkID
      frameOffsetInChunk = 0
      currentChunkInputSize = newFrameSize
      do {
        try startVideoWriter(chunkID: chunkID, imageSize: newFrameSize)
        consecutiveWriteFailures = 0
        writerNotReadyCount = 0
      } catch {
        resetCurrentChunkState()
        throw error
      }
    }

    guard let chunkID = currentChunkID else {
      throw OmiScreenMemoryVideoArchiveError.writerFailed("Missing active chunk")
    }
    let location = ScreenMemoryVideoFrameLocation(
      chunkID: chunkID,
      sampleOrdinal: frameOffsetInChunk
    )

    do {
      try await writeFrame(image: image, sampleOrdinal: frameOffsetInChunk)
      frameTimestamps.append(timestamp)
      frameOffsetInChunk += 1
      consecutiveWriteFailures = 0
    } catch {
      consecutiveWriteFailures += 1
      if consecutiveWriteFailures >= configuration.maxConsecutiveFailures {
        diagnostics.record("video_write_failure_reset")
        await emergencyReset()
      }
      throw error
    }

    let effectiveDuration = hasFinalizedAnyChunk
      ? configuration.chunkDuration
      : configuration.firstChunkDuration
    if let start = currentChunkStartTime,
       timestamp.timeIntervalSince(start) >= effectiveDuration,
       let result = try await finalizeCurrentChunk() {
      finalized.append(result)
      hasFinalizedAnyChunk = true
    }

    return .accepted(location: location, finalizedChunks: finalized)
  }

  func activeChunkID() -> ScreenMemoryVideoChunkID? {
    currentChunkID
  }

  func flushCurrentChunk() async throws -> ScreenMemoryVideoChunkFinalization? {
    return try await finalizeCurrentChunk()
  }

  func discardChunk(_ chunkID: ScreenMemoryVideoChunkID) async {
    if currentChunkID == chunkID {
      await emergencyReset()
    }
    try? fileManager.removeItem(at: stagedURL(for: chunkID))
    try? fileManager.removeItem(at: finalizedURL(for: chunkID))
  }

  private func startVideoWriter(
    chunkID: ScreenMemoryVideoChunkID,
    imageSize: CGSize
  ) throws {
    let stagedURL = stagedURL(for: chunkID)
    if fileManager.fileExists(atPath: stagedURL.path) {
      try fileManager.removeItem(at: stagedURL)
    }

    let outputSize = calculateOutputSize(for: imageSize)
    guard outputSize.width >= 2, outputSize.height >= 2 else {
      throw OmiScreenMemoryVideoArchiveError.invalidImage
    }
    currentOutputSize = outputSize
    let width = Int(outputSize.width)
    let height = Int(outputSize.height)
    let writer = try AVAssetWriter(outputURL: stagedURL, fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = true

    let settings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.hevc,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: estimatedHEVCBitrate(width: width, height: height),
        AVVideoExpectedSourceFrameRateKey: max(1, Int(ceil(configuration.frameRate))),
        AVVideoMaxKeyFrameIntervalDurationKey: 10,
        AVVideoAllowFrameReorderingKey: false,
      ],
    ]
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = true
    guard writer.canAdd(input) else {
      throw OmiScreenMemoryVideoArchiveError.codecUnavailable
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
      let message = writer.error?.localizedDescription ?? "unknown HEVC writer error"
      if message.localizedCaseInsensitiveContains("encoder") {
        throw OmiScreenMemoryVideoArchiveError.codecUnavailable
      }
      throw OmiScreenMemoryVideoArchiveError.writerFailed(message)
    }
    writer.startSession(atSourceTime: .zero)
    assetWriter = writer
    writerInput = input
    pixelBufferAdaptor = adaptor
  }

  private func writeFrame(image: CGImage, sampleOrdinal: Int) async throws {
    guard
      let input = writerInput,
      let adaptor = pixelBufferAdaptor,
      let outputSize = currentOutputSize
    else {
      writerNotReadyCount += 1
      if writerNotReadyCount >= configuration.maxConsecutiveNotReadyFailures {
        await emergencyReset()
      }
      throw OmiScreenMemoryVideoArchiveError.writerFailed("Video writer not ready")
    }

    try await waitForWriterInputReady(input)
    let pixelBuffer = try autoreleasepool {
      try createPixelBuffer(from: image, size: outputSize, adaptor: adaptor)
    }
    let presentationTime = CMTime(
      seconds: Double(sampleOrdinal) / configuration.frameRate,
      preferredTimescale: 600
    )
    guard adaptor.append(pixelBuffer, withPresentationTime: presentationTime) else {
      throw OmiScreenMemoryVideoArchiveError.writerFailed(
        assetWriter?.error?.localizedDescription ?? "Failed to append HEVC frame"
      )
    }
    writerNotReadyCount = 0
  }

  private func finalizeCurrentChunk() async throws -> ScreenMemoryVideoChunkFinalization? {
    guard
      let chunkID = currentChunkID,
      !frameTimestamps.isEmpty,
      let input = writerInput,
      let writer = assetWriter
    else {
      resetCurrentChunkState()
      return nil
    }
    let stagedURL = stagedURL(for: chunkID)
    defer {
      resetCurrentChunkState()
      try? fileManager.removeItem(at: stagedURL)
    }
    let sampleCount = frameTimestamps.count
    input.markAsFinished()
    do {
      try await finishWriting(writer)
      let finalURL = finalizedURL(for: chunkID)
      if fileManager.fileExists(atPath: finalURL.path) {
        try fileManager.removeItem(at: finalURL)
      }
      try fileManager.moveItem(at: stagedURL, to: finalURL)
    } catch {
      writer.cancelWriting()
      throw error
    }
    return ScreenMemoryVideoChunkFinalization(chunkID: chunkID, sampleCount: sampleCount)
  }

  private func resetCurrentChunkState() {
    frameTimestamps.removeAll(keepingCapacity: true)
    currentChunkStartTime = nil
    currentChunkID = nil
    frameOffsetInChunk = 0
    currentOutputSize = nil
    currentChunkInputSize = nil
    assetWriter = nil
    writerInput = nil
    pixelBufferAdaptor = nil
    consecutiveWriteFailures = 0
    writerNotReadyCount = 0
    pendingAspectRatioSize = nil
    pendingAspectRatioSince = nil
  }

  private func emergencyReset() async {
    let staged = currentChunkID.map(stagedURL(for:))
    writerInput?.markAsFinished()
    assetWriter?.cancelWriting()
    resetCurrentChunkState()
    if let staged { try? fileManager.removeItem(at: staged) }
  }

  private func stagedURL(for chunkID: ScreenMemoryVideoChunkID) -> URL {
    videosDirectory.appendingPathComponent("\(chunkID.value.uuidString.lowercased()).partial.mp4")
  }

  private func finalizedURL(for chunkID: ScreenMemoryVideoChunkID) -> URL {
    videosDirectory.appendingPathComponent("\(chunkID.value.uuidString.lowercased()).mp4")
  }

  private func hasSignificantAspectRatioChange(from oldSize: CGSize, to newSize: CGSize) -> Bool {
    guard oldSize.height > 0, newSize.height > 0 else { return true }
    let oldAspect = oldSize.width / oldSize.height
    let newAspect = newSize.width / newSize.height
    return abs(oldAspect - newAspect) / max(oldAspect, newAspect)
      > configuration.aspectRatioChangeThreshold
  }

  private func calculateOutputSize(for size: CGSize) -> CGSize {
    let maxDimension = max(size.width, size.height)
    let scale = maxDimension > configuration.maxResolution
      ? configuration.maxResolution / maxDimension
      : 1
    return CGSize(
      width: CGFloat(max(2, Int(size.width * scale) / 2 * 2)),
      height: CGFloat(max(2, Int(size.height * scale) / 2 * 2))
    )
  }

  private func estimatedHEVCBitrate(width: Int, height: Int) -> Int {
    let bitrate = Double(width * height) * max(configuration.frameRate, 1) * 0.35
    return max(350_000, min(8_000_000, Int(bitrate)))
  }

  private func createPixelBuffer(
    from image: CGImage,
    size: CGSize,
    adaptor: AVAssetWriterInputPixelBufferAdaptor
  ) throws -> CVPixelBuffer {
    let width = Int(size.width)
    let height = Int(size.height)
    var buffer: CVPixelBuffer?
    let status: CVReturn
    if let pool = adaptor.pixelBufferPool {
      status = CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
    } else {
      status = CVPixelBufferCreate(
        nil,
        width,
        height,
        kCVPixelFormatType_32BGRA,
        [kCVPixelBufferIOSurfacePropertiesKey as String: [:]] as CFDictionary,
        &buffer
      )
    }
    guard status == kCVReturnSuccess, let pixelBuffer = buffer else {
      throw OmiScreenMemoryVideoArchiveError.writerFailed("Failed to create pixel buffer: \(status)")
    }

    CVPixelBufferLockBaseAddress(pixelBuffer, [])
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }
    guard
      let context = CGContext(
        data: CVPixelBufferGetBaseAddress(pixelBuffer),
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
          | CGBitmapInfo.byteOrder32Little.rawValue
      )
    else {
      throw OmiScreenMemoryVideoArchiveError.writerFailed("Failed to create pixel buffer context")
    }
    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    return pixelBuffer
  }

  private func waitForWriterInputReady(_ input: AVAssetWriterInput) async throws {
    let deadline = Date().addingTimeInterval(2)
    while !input.isReadyForMoreMediaData {
      if Date() >= deadline {
        throw OmiScreenMemoryVideoArchiveError.writerFailed("Video writer input backpressured")
      }
      try await Task.sleep(nanoseconds: 10_000_000)
    }
  }

  private func finishWriting(_ writer: AVAssetWriter) async throws {
    let box = AssetWriterBox(writer)
    try await withCheckedThrowingContinuation { continuation in
      box.writer.finishWriting {
        if box.writer.status == .completed {
          continuation.resume()
        } else {
          continuation.resume(
            throwing: OmiScreenMemoryVideoArchiveError.writerFailed(
              box.writer.error?.localizedDescription ?? "HEVC writer failed"
            )
          )
        }
      }
    }
  }
}

private final class AssetWriterBox: @unchecked Sendable {
  let writer: AVAssetWriter

  init(_ writer: AVAssetWriter) {
    self.writer = writer
  }
}
