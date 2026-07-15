import Foundation
@testable import IntentiveDesktopCore
import XCTest

final class ScreenMemoryArchiveTests: XCTestCase {
  func testCapturedScreenSurvivesReopenAndIsFoundThroughOCRSearch() async throws {
    let profileRoot = try temporaryDirectory()
    let profile = try ScreenMemoryProfile(userID: "user@example.com", rootURL: profileRoot)
    let recordID = UUID(uuidString: "56D9AB8A-845A-4D66-AE1C-6C72C0FD12D3")!
    let analyzer = FixtureScreenMemoryImageAnalyzer(
      result: ScreenMemoryImageAnalysis(
        perceptualHash: 0x0123_4567_89AB_CDEF,
        ocr: ScreenMemoryOCRResult(
          fullText: "Ship the local screenshot search tracer",
          blocks: [
            ScreenMemoryOCRBlock(
              text: "Ship the local screenshot search tracer",
              x: 0.1,
              y: 0.2,
              width: 0.7,
              height: 0.1,
              confidence: 0.98
            )
          ]
        )
      )
    )
    let archive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: analyzer,
      idFactory: { recordID }
    )

    let outcome = try await archive.ingest(
      ScreenMemoryCaptureInput(
        userID: "user@example.com",
        imageData: Data([0x89, 0x50, 0x4E, 0x47]),
        capturedAt: "2026-07-15T09:30:00.000Z",
        appBundleID: "com.apple.dt.Xcode",
        appName: "Xcode",
        windowTitle: "ScreenMemoryArchive.swift"
      )
    )

    XCTAssertEqual(outcome, .stored(ScreenMemoryRecordID(recordID)))
    XCTAssertEqual(profile.databaseURL.lastPathComponent, "intentive.db")

    let reopened = try ScreenMemoryArchive(profile: profile, imageAnalyzer: analyzer)
    let result = try XCTUnwrap(reopened.search("screenshot tracer", limit: 10).first)
    XCTAssertEqual(result.recordID, ScreenMemoryRecordID(recordID))
    XCTAssertEqual(result.appBundleID, "com.apple.dt.Xcode")
    XCTAssertEqual(result.appName, "Xcode")
    XCTAssertEqual(result.windowTitle, "ScreenMemoryArchive.swift")
    XCTAssertEqual(result.ocrText, "Ship the local screenshot search tracer")
    XCTAssertEqual(result.ocrBlocks, analyzer.result.ocr.blocks)
  }

  func testPerceptuallyDuplicateScreenIsNotIndexedTwice() async throws {
    let profile = try ScreenMemoryProfile(userID: "duplicate-user", rootURL: temporaryDirectory())
    let firstID = UUID(uuidString: "6C851B2D-6D68-4A52-9752-943E3F7F44BA")!
    let analyzer = FixtureScreenMemoryImageAnalyzer(
      result: ScreenMemoryImageAnalysis(
        perceptualHash: 0b1010,
        ocr: ScreenMemoryOCRResult(fullText: "same perceptual screen", blocks: [])
      )
    )
    let archive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: analyzer,
      idFactory: { firstID }
    )
    let input = ScreenMemoryCaptureInput(
      userID: "duplicate-user",
      imageData: Data([1, 2, 3]),
      capturedAt: "2026-07-15T09:30:00.000Z",
      appBundleID: "com.apple.Safari",
      appName: "Safari",
      windowTitle: "Attention guide"
    )

    let first = try await archive.ingest(input)
    let second = try await archive.ingest(input)

    XCTAssertEqual(first, .stored(ScreenMemoryRecordID(firstID)))
    XCTAssertEqual(second, .duplicate(existingRecordID: ScreenMemoryRecordID(firstID)))
    XCTAssertEqual(archive.search("perceptual screen", limit: 10).count, 1)
    XCTAssertEqual(analyzer.recognitionCount, 1, "Omi dHash deduplication must skip duplicate OCR work")
  }

  func testPerceptualDeduplicationComparesWithEveryPreviouslyObservedFrame() async throws {
    let profile = try ScreenMemoryProfile(userID: "chained-user", rootURL: temporaryDirectory())
    let storedID = UUID(uuidString: "778BBE24-8CDA-4B9B-A37C-60EAF9102A97")!
    let analyzer = SequencedScreenMemoryImageAnalyzer(
      hashes: [
        0,
        0b0000_0000_0001_1111,
        0b0000_0011_1111_1111,
      ],
      ocr: ScreenMemoryOCRResult(fullText: "chained perceptual observation", blocks: [])
    )
    let archive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: analyzer,
      idFactory: { storedID }
    )
    let input = ScreenMemoryCaptureInput(
      userID: "chained-user",
      imageData: Data([1, 2, 3]),
      capturedAt: "2026-07-15T09:30:00.000Z",
      appBundleID: "com.apple.Safari",
      appName: "Safari",
      windowTitle: "Attention guide"
    )

    let first = try await archive.ingest(input)
    let second = try await archive.ingest(input)
    let third = try await archive.ingest(input)

    XCTAssertEqual(first, .stored(ScreenMemoryRecordID(storedID)))
    XCTAssertEqual(second, .duplicate(existingRecordID: ScreenMemoryRecordID(storedID)))
    XCTAssertEqual(third, .duplicate(existingRecordID: ScreenMemoryRecordID(storedID)))
    XCTAssertEqual(archive.search("chained observation", limit: 10).count, 1)
    XCTAssertEqual(analyzer.recognitionCount, 1)
  }

  func testReopenedArchiveSeedsPreviousObservationFromLatestStoredFrame() async throws {
    let profile = try ScreenMemoryProfile(userID: "reopened-user", rootURL: temporaryDirectory())
    let storedID = UUID(uuidString: "18F47A9C-FB13-4CD1-A17E-B45E2D2BFA92")!
    let initialAnalyzer = SequencedScreenMemoryImageAnalyzer(
      hashes: [0b0000_1111],
      ocr: ScreenMemoryOCRResult(fullText: "persisted observation seed", blocks: [])
    )
    let initialArchive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: initialAnalyzer,
      idFactory: { storedID }
    )
    let input = ScreenMemoryCaptureInput(
      userID: "reopened-user",
      imageData: Data([1, 2, 3]),
      capturedAt: "2026-07-15T09:30:00.000Z",
      appBundleID: "com.apple.Safari",
      appName: "Safari",
      windowTitle: "Attention guide"
    )
    _ = try await initialArchive.ingest(input)

    let reopenedAnalyzer = SequencedScreenMemoryImageAnalyzer(
      hashes: [0b0001_1111],
      ocr: ScreenMemoryOCRResult(fullText: "must not be recognized", blocks: [])
    )
    let reopenedArchive = try ScreenMemoryArchive(profile: profile, imageAnalyzer: reopenedAnalyzer)

    let outcome = try await reopenedArchive.ingest(input)

    XCTAssertEqual(outcome, .duplicate(existingRecordID: ScreenMemoryRecordID(storedID)))
    XCTAssertEqual(reopenedAnalyzer.recognitionCount, 0)
    XCTAssertEqual(reopenedArchive.search("persisted seed", limit: 10).count, 1)
  }

  func testSecretLikeOCRStaysSearchableLocallyButOutboundContentIsSuppressed() async throws {
    let profile = try ScreenMemoryProfile(userID: "private-user", rootURL: temporaryDirectory())
    let recordID = UUID(uuidString: "993A45D1-A45B-4F44-8CF1-2822E4D463B4")!
    let analyzer = FixtureScreenMemoryImageAnalyzer(
      result: ScreenMemoryImageAnalysis(
        perceptualHash: 0xBEEF,
        ocr: ScreenMemoryOCRResult(
          fullText: "export API_KEY=locally-visible-value",
          blocks: []
        )
      )
    )
    let archive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: analyzer,
      idFactory: { recordID }
    )

    _ = try await archive.ingest(
      ScreenMemoryCaptureInput(
        userID: "private-user",
        imageData: Data([4, 5, 6]),
        capturedAt: "2026-07-15T09:31:00.000Z",
        appBundleID: "com.apple.Terminal",
        appName: "Terminal",
        windowTitle: "API_KEY=window-secret"
      )
    )

    let local = try XCTUnwrap(archive.search("locally visible value", limit: 10).first)
    XCTAssertEqual(local.ocrText, "export API_KEY=locally-visible-value")
    XCTAssertEqual(local.windowTitle, "API_KEY=window-secret")

    let outbound = try XCTUnwrap(archive.outboundRepresentation(for: ScreenMemoryRecordID(recordID)))
    XCTAssertEqual(outbound.state, .secretDetected)
    XCTAssertEqual(outbound.summary, "Secret-like content was detected and suppressed.")
    XCTAssertNil(outbound.ocrText)
    XCTAssertNil(outbound.windowTitle)
    XCTAssertNil(outbound.embedding)
    XCTAssertFalse(String(describing: outbound).contains("locally-visible-value"))
    XCTAssertFalse(String(describing: outbound).contains("window-secret"))
  }

  func testCaptureCoordinatorRoutesCapturedPixelsThroughArchiveBeforePublishing() async throws {
    let profile = try ScreenMemoryProfile(userID: "assembled-user", rootURL: temporaryDirectory())
    let analyzer = FixtureScreenMemoryImageAnalyzer(
      result: ScreenMemoryImageAnalysis(
        perceptualHash: 0xFACE,
        ocr: ScreenMemoryOCRResult(fullText: "assembled archive routing", blocks: [])
      )
    )
    let archive = try ScreenMemoryArchive(profile: profile, imageAnalyzer: analyzer)
    let coordinator = CaptureCoordinator(
      compiler: ContextCompiler(),
      screenMemory: InMemoryScreenMemoryStore(),
      publisher: PerceptionPublisher(runtimeClient: DisconnectedRuntimeChatClient()),
      archiveProvider: { archive }
    )
    let source = FixturePixelCaptureSource(
      frame: CapturedFrame(
        id: "source-owned-id-is-not-the-record-id",
        capturedAt: "2026-07-15T09:32:00.000Z",
        appBundleID: "com.apple.Safari",
        appName: "Safari",
        windowTitle: "Intentive architecture",
        ocrText: "",
        rawFrameBytes: Data([7, 8, 9])
      )
    )

    let events = try await coordinator.captureOnce(from: source)

    XCTAssertEqual(events.count, 1)
    XCTAssertEqual(archive.search("assembled routing", limit: 10).count, 1)
    XCTAssertEqual(
      events.first?.localRecordRef,
      archive.search("assembled routing", limit: 1).first?.recordID?.value.uuidString
    )
  }

  private func temporaryDirectory() throws -> URL {
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("ScreenMemoryArchiveTests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }
}

private struct FixturePixelCaptureSource: DesktopCaptureSource {
  let frame: CapturedFrame

  func captureFrame() async throws -> CapturedFrame {
    frame
  }
}

private final class FixtureScreenMemoryImageAnalyzer: ScreenMemoryImageAnalyzing, @unchecked Sendable {
  let result: ScreenMemoryImageAnalysis
  private let lock = NSLock()
  private var storedRecognitionCount = 0

  init(result: ScreenMemoryImageAnalysis) {
    self.result = result
  }

  var recognitionCount: Int {
    lock.withLock { storedRecognitionCount }
  }

  func perceptualHash(imageData: Data) throws -> UInt64 {
    result.perceptualHash
  }

  func recognizeText(imageData: Data) async throws -> ScreenMemoryOCRResult {
    lock.withLock { storedRecognitionCount += 1 }
    return result.ocr
  }
}

private final class SequencedScreenMemoryImageAnalyzer: ScreenMemoryImageAnalyzing, @unchecked Sendable {
  private let lock = NSLock()
  private var hashes: [UInt64]
  private let ocr: ScreenMemoryOCRResult
  private var storedRecognitionCount = 0

  init(hashes: [UInt64], ocr: ScreenMemoryOCRResult) {
    self.hashes = hashes
    self.ocr = ocr
  }

  var recognitionCount: Int {
    lock.withLock { storedRecognitionCount }
  }

  func perceptualHash(imageData: Data) throws -> UInt64 {
    lock.withLock { hashes.removeFirst() }
  }

  func recognizeText(imageData: Data) async throws -> ScreenMemoryOCRResult {
    lock.withLock { storedRecognitionCount += 1 }
    return ocr
  }
}
