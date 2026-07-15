import AppKit
import AVFoundation
import CoreImage
import Foundation
import IntentiveDesktopCore

public protocol OmiVideoArchiveDiagnostics: Sendable {
  func record(_ event: String)
}

public struct NoOpOmiVideoArchiveDiagnostics: OmiVideoArchiveDiagnostics {
  public init() {}
  public func record(_: String) {}
}

public enum OmiScreenMemoryVideoArchiveError: Error, Equatable, LocalizedError {
  case codecUnavailable
  case invalidImage
  case frameNotFound
  case unreadableChunk
  case writerFailed(String)

  public var errorDescription: String? {
    switch self {
    case .codecUnavailable:
      return "The system HEVC encoder is unavailable."
    case .invalidImage:
      return "Screen Memory video received invalid image bytes."
    case .frameNotFound:
      return "The requested Screen Memory video sample was not found."
    case .unreadableChunk:
      return "The Screen Memory video chunk is unreadable."
    case .writerFailed(let message):
      return "Screen Memory HEVC writer failed: \(message)"
    }
  }
}

/// Omi's RewindStorage frame extraction/cache machinery adapted to an
/// Intentive profile directory and the source-neutral Core archive boundary.
public actor OmiVideoArchiveStorage: ScreenMemoryVideoArchiving {
  private let videosDirectory: URL
  private let encoder: VideoChunkEncoder
  private let fileManager: FileManager
  private let diagnostics: any OmiVideoArchiveDiagnostics
  private let frameCache = NSCache<NSString, NSImage>()
  private var corruptedChunks = Set<ScreenMemoryVideoChunkID>()

  public init(
    profile: ScreenMemoryProfile,
    diagnostics: any OmiVideoArchiveDiagnostics = NoOpOmiVideoArchiveDiagnostics(),
    fileManager: FileManager = .default
  ) throws {
    videosDirectory = profile.videoArchiveURL
    self.fileManager = fileManager
    self.diagnostics = diagnostics
    try fileManager.createDirectory(at: profile.videoArchiveURL, withIntermediateDirectories: true)
    encoder = try VideoChunkEncoder(
      videosDirectory: profile.videoArchiveURL,
      diagnostics: diagnostics,
      fileManager: fileManager
    )
    frameCache.countLimit = 100
    frameCache.totalCostLimit = 100 * 1024 * 1024
  }

  public func appendFrame(
    imageData: Data,
    capturedAt: Date
  ) async throws -> ScreenMemoryVideoWriteOutcome {
    guard
      let image = NSImage(data: imageData),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
    else {
      throw OmiScreenMemoryVideoArchiveError.invalidImage
    }
    return try await encoder.addFrame(image: cgImage, timestamp: capturedAt)
  }

  public func activeChunkID() async -> ScreenMemoryVideoChunkID? {
    await encoder.activeChunkID()
  }

  public func finalizeActiveChunk() async throws -> ScreenMemoryVideoChunkFinalization? {
    try await encoder.flushCurrentChunk()
  }

  public func loadFrame(at location: ScreenMemoryVideoFrameLocation) async throws -> Data {
    guard !corruptedChunks.contains(location.chunkID) else {
      throw OmiScreenMemoryVideoArchiveError.unreadableChunk
    }
    let cacheKey = "\(location.chunkID.value.uuidString):\(location.sampleOrdinal)" as NSString
    if let cached = frameCache.object(forKey: cacheKey) {
      return try encodedImageData(cached)
    }

    let url = finalizedURL(for: location.chunkID)
    guard fileManager.fileExists(atPath: url.path) else {
      throw OmiScreenMemoryVideoArchiveError.frameNotFound
    }
    do {
      let image = try await extractFrame(from: url, sampleOrdinal: location.sampleOrdinal)
      let cost = max(1, Int(image.size.width * image.size.height * 4))
      frameCache.setObject(image, forKey: cacheKey, cost: cost)
      return try encodedImageData(image)
    } catch OmiScreenMemoryVideoArchiveError.frameNotFound {
      throw OmiScreenMemoryVideoArchiveError.frameNotFound
    } catch {
      corruptedChunks.insert(location.chunkID)
      diagnostics.record("video_chunk_unreadable")
      throw OmiScreenMemoryVideoArchiveError.unreadableChunk
    }
  }

  public func recoveryState(
    for chunkID: ScreenMemoryVideoChunkID,
    expectedSampleCount: Int
  ) async -> ScreenMemoryVideoChunkRecoveryState {
    let finalURL = finalizedURL(for: chunkID)
    if fileManager.fileExists(atPath: finalURL.path) {
      guard let sampleCount = try? await countSamples(in: finalURL),
            sampleCount >= expectedSampleCount
      else {
        return .missingOrInvalid
      }
      return .finalized(sampleCount: sampleCount)
    }
    if fileManager.fileExists(atPath: stagedURL(for: chunkID).path) {
      return .staged
    }
    return .missingOrInvalid
  }

  public func discardChunk(_ chunkID: ScreenMemoryVideoChunkID) async {
    await encoder.discardChunk(chunkID)
    try? fileManager.removeItem(at: stagedURL(for: chunkID))
    try? fileManager.removeItem(at: finalizedURL(for: chunkID))
    corruptedChunks.remove(chunkID)
    frameCache.removeAllObjects()
  }

  /// Omi's physical video deletion/cache invalidation adapted to opaque chunk
  /// IDs. Unlike recovery discard, user/retention deletion surfaces I/O errors
  /// so the durable deletion journal can retry on next launch.
  public func deleteChunk(_ chunkID: ScreenMemoryVideoChunkID) async throws {
    await encoder.discardChunk(chunkID)
    for url in [stagedURL(for: chunkID), finalizedURL(for: chunkID)] {
      if fileManager.fileExists(atPath: url.path) {
        try fileManager.removeItem(at: url)
      }
    }
    corruptedChunks.remove(chunkID)
    frameCache.removeAllObjects()
  }

  public func deleteAllMedia() async throws {
    if let active = await encoder.activeChunkID() {
      await encoder.discardChunk(active)
    }
    frameCache.removeAllObjects()
    corruptedChunks.removeAll()
    guard fileManager.fileExists(atPath: videosDirectory.path) else { return }
    for url in try fileManager.contentsOfDirectory(
      at: videosDirectory,
      includingPropertiesForKeys: nil,
      options: [.skipsHiddenFiles]
    ) {
      try fileManager.removeItem(at: url)
    }
  }

  private func extractFrame(from url: URL, sampleOrdinal: Int) async throws -> NSImage {
    guard sampleOrdinal >= 0 else { throw OmiScreenMemoryVideoArchiveError.frameNotFound }
    let asset = AVURLAsset(url: url)
    guard let track = try await asset.loadTracks(withMediaType: .video).first else {
      throw OmiScreenMemoryVideoArchiveError.unreadableChunk
    }
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(
      track: track,
      outputSettings: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      ]
    )
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else {
      throw OmiScreenMemoryVideoArchiveError.unreadableChunk
    }
    reader.add(output)
    guard reader.startReading() else {
      throw OmiScreenMemoryVideoArchiveError.unreadableChunk
    }

    var index = 0
    while let sample = output.copyNextSampleBuffer() {
      defer { CMSampleBufferInvalidate(sample) }
      guard index == sampleOrdinal else {
        index += 1
        continue
      }
      guard let pixelBuffer = CMSampleBufferGetImageBuffer(sample) else {
        reader.cancelReading()
        throw OmiScreenMemoryVideoArchiveError.unreadableChunk
      }
      let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
      let context = CIContext(options: [.useSoftwareRenderer: false])
      let rect = CGRect(
        x: 0,
        y: 0,
        width: CVPixelBufferGetWidth(pixelBuffer),
        height: CVPixelBufferGetHeight(pixelBuffer)
      )
      guard let cgImage = context.createCGImage(ciImage, from: rect) else {
        reader.cancelReading()
        throw OmiScreenMemoryVideoArchiveError.unreadableChunk
      }
      return NSImage(
        cgImage: cgImage,
        size: NSSize(width: cgImage.width, height: cgImage.height)
      )
    }
    if reader.status == .failed {
      throw OmiScreenMemoryVideoArchiveError.unreadableChunk
    }
    throw OmiScreenMemoryVideoArchiveError.frameNotFound
  }

  private func countSamples(in url: URL) async throws -> Int {
    let asset = AVURLAsset(url: url)
    guard let track = try await asset.loadTracks(withMediaType: .video).first else {
      throw OmiScreenMemoryVideoArchiveError.unreadableChunk
    }
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else {
      throw OmiScreenMemoryVideoArchiveError.unreadableChunk
    }
    reader.add(output)
    guard reader.startReading() else {
      throw OmiScreenMemoryVideoArchiveError.unreadableChunk
    }
    var count = 0
    while let sample = output.copyNextSampleBuffer() {
      count += 1
      CMSampleBufferInvalidate(sample)
    }
    guard reader.status != .failed else {
      throw OmiScreenMemoryVideoArchiveError.unreadableChunk
    }
    return count
  }

  private func encodedImageData(_ image: NSImage) throws -> Data {
    guard
      let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let data = bitmap.representation(using: .png, properties: [:])
    else {
      throw OmiScreenMemoryVideoArchiveError.invalidImage
    }
    return data
  }

  private func stagedURL(for chunkID: ScreenMemoryVideoChunkID) -> URL {
    videosDirectory.appendingPathComponent("\(chunkID.value.uuidString.lowercased()).partial.mp4")
  }

  private func finalizedURL(for chunkID: ScreenMemoryVideoChunkID) -> URL {
    videosDirectory.appendingPathComponent("\(chunkID.value.uuidString.lowercased()).mp4")
  }
}
