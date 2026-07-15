import Foundation
@testable import IntentiveDesktopCore

/// Shared slice-05 timeline fixtures: a one-chunk seeded archive with scripted
/// OCR and deterministic frame bytes, used by both the timeline model test and
/// the accessibility UI-smoke test so they exercise the same tracer setup.

struct TimelineFrameSeed {
  let id: String
  let capturedAt: String
  let appName: String
  let windowTitle: String
  let ocr: String
  let ocrBlocks: [ScreenMemoryOCRBlock]
}

struct NullSemanticEmbedder: LocalSemanticEmbedding {
  var identifier: String { "null" }
  var isAvailable: Bool { false }
  func embed(_ text: String) -> [Float]? { nil }
}

final class TimelineFixtureIDs: @unchecked Sendable {
  private let lock = NSLock()
  private var ids: [UUID]
  init(ids: [UUID]) { self.ids = ids }
  func next() -> UUID { lock.withLock { ids.removeFirst() } }
}

final class TimelineFixtureAnalyzer: ScreenMemoryImageAnalyzing, @unchecked Sendable {
  private let lock = NSLock()
  private var steps: [(hash: UInt64, ocr: ScreenMemoryOCRResult)]
  private var cursor = 0
  init(steps: [(hash: UInt64, ocr: ScreenMemoryOCRResult)]) { self.steps = steps }
  func perceptualHash(imageData: Data) throws -> UInt64 {
    lock.withLock { cursor < steps.count ? steps[cursor].hash : 0 }
  }
  func recognizeText(imageData: Data) async throws -> ScreenMemoryOCRResult {
    lock.withLock {
      guard cursor < steps.count else { return ScreenMemoryOCRResult(fullText: "", blocks: []) }
      let ocr = steps[cursor].ocr
      cursor += 1
      return ocr
    }
  }
}

/// One-chunk fixture archive: each appended frame becomes the next sample in a
/// single chunk; finalize closes it so frames become retrievable.
actor TimelineFixtureVideoArchive: ScreenMemoryVideoArchiving {
  private let chunkID = ScreenMemoryVideoChunkID(UUID())
  private let orderedFrameData: [Data]
  private var appended = 0
  private var active = false

  init(orderedFrameData: [Data]) { self.orderedFrameData = orderedFrameData }

  func appendFrame(imageData: Data, capturedAt: Date) async throws -> ScreenMemoryVideoWriteOutcome {
    let ordinal = appended
    appended += 1
    active = true
    return .accepted(
      location: ScreenMemoryVideoFrameLocation(chunkID: chunkID, sampleOrdinal: ordinal),
      finalizedChunks: []
    )
  }

  func activeChunkID() async -> ScreenMemoryVideoChunkID? { active ? chunkID : nil }

  func finalizeActiveChunk() async throws -> ScreenMemoryVideoChunkFinalization? {
    active = false
    return ScreenMemoryVideoChunkFinalization(chunkID: chunkID, sampleCount: appended)
  }

  func loadFrame(at location: ScreenMemoryVideoFrameLocation) async throws -> Data {
    orderedFrameData[location.sampleOrdinal]
  }

  func recoveryState(
    for chunkID: ScreenMemoryVideoChunkID,
    expectedSampleCount: Int
  ) async -> ScreenMemoryVideoChunkRecoveryState {
    .finalized(sampleCount: appended)
  }

  func discardChunk(_ chunkID: ScreenMemoryVideoChunkID) async { active = false }
}

enum TimelineFixture {
  /// Build a seeded, finalized archive plus the per-frame bytes it will render.
  static func seededArchive(
    frames: [TimelineFrameSeed],
    userID: String = "timeline-user"
  ) async throws -> (archive: ScreenMemoryArchive, frameBytes: [String: Data]) {
    let analyzer = TimelineFixtureAnalyzer(
      steps: frames.enumerated().map { index, frame in
        // Spread hashes widely so distinct frames never dedup by perceptual hash.
        (hash: 0x9E37_79B9_7F4A_7C15 &* UInt64(index + 1),
         ocr: ScreenMemoryOCRResult(fullText: frame.ocr, blocks: frame.ocrBlocks))
      }
    )
    let ids = frames.map { UUID(uuidString: $0.id)! }
    let idFactory = TimelineFixtureIDs(ids: ids)
    var frameBytes: [String: Data] = [:]
    for (index, frame) in frames.enumerated() {
      frameBytes[frame.id] = Data([UInt8(index + 1), 0xAB, 0xCD])
    }
    let videoArchive = TimelineFixtureVideoArchive(orderedFrameData: frames.map { frameBytes[$0.id]! })
    let archive = try ScreenMemoryArchive(
      profile: try ScreenMemoryProfile(userID: userID, rootURL: temporaryDirectory()),
      imageAnalyzer: analyzer,
      idFactory: { idFactory.next() },
      semanticEmbedder: NullSemanticEmbedder(),
      videoArchive: videoArchive,
      staleVideoChunkDelay: 0
    )
    for frame in frames {
      _ = try await archive.ingest(
        ScreenMemoryCaptureInput(
          userID: archive.userID,
          imageData: Data([0x1]),
          capturedAt: frame.capturedAt,
          appBundleID: "com.intentive.\(frame.appName.lowercased())",
          appName: frame.appName,
          windowTitle: frame.windowTitle
        )
      )
    }
    try await archive.finalizeActiveVideoChunk()
    return (archive, frameBytes)
  }

  static func temporaryDirectory() throws -> URL {
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("ScreenMemoryTimelineFixtures-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }
}
