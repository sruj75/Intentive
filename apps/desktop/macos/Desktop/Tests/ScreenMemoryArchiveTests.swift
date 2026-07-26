import AppKit
import Foundation
@testable import IntentiveDesktopCore
import IntentiveDesktopNativeAdapters
import XCTest

final class ScreenMemoryArchiveTests: XCTestCase {
  func testEncoderRejectedFrameKeepsOCRRecordWithoutFalseMediaMapping() async throws {
    let profile = try ScreenMemoryProfile(userID: "rejected-video-user", rootURL: temporaryDirectory())
    let recordID = UUID(uuidString: "86D284B9-565F-40C2-A667-A7871F3ADE01")!
    let analyzer = FixtureScreenMemoryImageAnalyzer(
      result: ScreenMemoryImageAnalysis(
        perceptualHash: 0xABCD,
        ocr: ScreenMemoryOCRResult(fullText: "OCR survives video rejection", blocks: [])
      )
    )
    let videoArchive = FixtureVideoArchive(appendOutcomes: [.rejected])
    let archive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: analyzer,
      idFactory: { recordID },
      videoArchive: videoArchive
    )

    let outcome = try await archive.ingest(
      ScreenMemoryCaptureInput(
        userID: profile.userID,
        imageData: Data([1, 2, 3]),
        capturedAt: "2026-07-15T09:29:00.000Z",
        appBundleID: "com.intentive.fixture",
        appName: "Fixture",
        windowTitle: "Rejected frame"
      )
    )

    XCTAssertEqual(outcome, .stored(ScreenMemoryRecordID(recordID)))
    XCTAssertEqual(archive.search("survives rejection", limit: 1).first?.recordID, ScreenMemoryRecordID(recordID))
    let unavailable = try await archive.videoFrame(for: ScreenMemoryRecordID(recordID))
    XCTAssertNil(unavailable)
  }

  func testOmiAspectRatioDebounceStoresOCRWithoutMappingRejectedFrame() async throws {
    let profile = try ScreenMemoryProfile(userID: "aspect-video-user", rootURL: temporaryDirectory())
    let ids = [
      UUID(uuidString: "9C13B645-D965-44A6-A206-4EF6BF816001")!,
      UUID(uuidString: "9C13B645-D965-44A6-A206-4EF6BF816002")!,
    ]
    let idFactory = FixtureIDFactory(ids: ids)
    do {
      let archive = try ScreenMemoryArchive(
        profile: profile,
        imageAnalyzer: SequencedScreenMemoryImageAnalyzer(
          hashes: [0, 0xFFFF],
          ocr: ScreenMemoryOCRResult(fullText: "aspect debounce OCR", blocks: [])
        ),
        idFactory: { idFactory.next() },
        videoArchive: try OmiScreenMemoryVideoArchive(profile: profile)
      )
      _ = try await archive.ingest(
        captureInput(
          profile: profile,
          imageData: try fixtureImageData(color: .systemRed),
          capturedAt: "2026-07-15T09:29:10.000Z",
          windowTitle: "Landscape"
        )
      )
      _ = try await archive.ingest(
        captureInput(
          profile: profile,
          imageData: try fixtureImageData(
            color: .systemGreen,
            size: NSSize(width: 64, height: 96)
          ),
          capturedAt: "2026-07-15T09:29:11.000Z",
          windowTitle: "Portrait"
        )
      )
      try await archive.finalizeActiveVideoChunk()

      let first = try await archive.videoFrame(for: ScreenMemoryRecordID(ids[0]))
      let rejected = try await archive.videoFrame(for: ScreenMemoryRecordID(ids[1]))
      XCTAssertNotNil(first)
      XCTAssertNil(rejected)
      XCTAssertEqual(archive.record(ScreenMemoryRecordID(ids[1]))?.windowTitle, "Portrait")
    } catch let error as OmiScreenMemoryVideoArchiveError where error == .codecUnavailable {
      throw XCTSkip("System HEVC encoder is unavailable: \(error.localizedDescription)")
    }
  }

  func testActiveChunkIsUnavailableUntilExplicitFinalization() async throws {
    let profile = try ScreenMemoryProfile(userID: "active-video-user", rootURL: temporaryDirectory())
    let recordID = UUID(uuidString: "14E44B2E-28CA-4F3C-805A-05C7A3153001")!
    let chunkID = ScreenMemoryVideoChunkID(
      UUID(uuidString: "14E44B2E-28CA-4F3C-805A-05C7A31530C1")!
    )
    let location = ScreenMemoryVideoFrameLocation(chunkID: chunkID, sampleOrdinal: 0)
    let imageData = Data([9, 8, 7])
    let videoArchive = FixtureVideoArchive(
      appendOutcomes: [.accepted(location: location, finalizedChunks: [])],
      finalizeBehavior: .succeed(
        ScreenMemoryVideoChunkFinalization(chunkID: chunkID, sampleCount: 1)
      ),
      frameData: [location: imageData]
    )
    let archive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: FixtureScreenMemoryImageAnalyzer(
        result: ScreenMemoryImageAnalysis(
          perceptualHash: 0x1234,
          ocr: ScreenMemoryOCRResult(fullText: "pending media", blocks: [])
        )
      ),
      idFactory: { recordID },
      videoArchive: videoArchive
    )

    _ = try await archive.ingest(
      ScreenMemoryCaptureInput(
        userID: profile.userID,
        imageData: Data([1]),
        capturedAt: "2026-07-15T09:29:30.000Z",
        appBundleID: "com.intentive.fixture",
        appName: "Fixture",
        windowTitle: "Pending"
      )
    )

    let unavailable = try await archive.videoFrame(for: ScreenMemoryRecordID(recordID))
    XCTAssertNil(unavailable)
    let unavailableReplay = try await archive.videoFrames(
      from: fixtureDate("2026-07-15T09:29:30.000Z"),
      through: fixtureDate("2026-07-15T09:29:30.000Z")
    )
    XCTAssertTrue(unavailableReplay.isEmpty)

    try await archive.finalizeActiveVideoChunk()

    let available = try await archive.videoFrame(for: ScreenMemoryRecordID(recordID))
    XCTAssertEqual(available?.imageData, imageData)
  }

  func testExplicitShortFinalizationKeepsMappedFramesUnavailableAndOCRSearchable() async throws {
    let profile = try ScreenMemoryProfile(userID: "short-explicit-video-user", rootURL: temporaryDirectory())
    let recordIDs = [
      UUID(uuidString: "5EC9E5A6-C59E-4F47-9D6F-0B8ACCF2A001")!,
      UUID(uuidString: "5EC9E5A6-C59E-4F47-9D6F-0B8ACCF2A002")!,
    ]
    let idFactory = FixtureIDFactory(ids: recordIDs)
    let chunkID = ScreenMemoryVideoChunkID(
      UUID(uuidString: "5EC9E5A6-C59E-4F47-9D6F-0B8ACCF2A0C1")!
    )
    let firstLocation = ScreenMemoryVideoFrameLocation(chunkID: chunkID, sampleOrdinal: 0)
    let secondLocation = ScreenMemoryVideoFrameLocation(chunkID: chunkID, sampleOrdinal: 1)
    let archive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: SequencedScreenMemoryImageAnalyzer(
        hashes: [0, UInt64.max],
        ocr: ScreenMemoryOCRResult(fullText: "short explicit finalization OCR", blocks: [])
      ),
      idFactory: { idFactory.next() },
      videoArchive: FixtureVideoArchive(
        appendOutcomes: [
          .accepted(location: firstLocation, finalizedChunks: []),
          .accepted(location: secondLocation, finalizedChunks: []),
        ],
        finalizeBehavior: .succeed(
          ScreenMemoryVideoChunkFinalization(chunkID: chunkID, sampleCount: 1)
        ),
        frameData: [firstLocation: Data([1]), secondLocation: Data([2])]
      )
    )

    for (index, capturedAt) in [
      "2026-07-15T09:29:35.000Z",
      "2026-07-15T09:29:36.000Z",
    ].enumerated() {
      _ = try await archive.ingest(
        captureInput(
          profile: profile,
          imageData: Data([UInt8(index)]),
          capturedAt: capturedAt,
          windowTitle: "Short explicit \(index)"
        )
      )
    }

    do {
      try await archive.finalizeActiveVideoChunk()
      XCTFail("Expected the short finalization to be rejected")
    } catch let error as ScreenMemoryArchiveError {
      XCTAssertEqual(error, .videoFinalizationMismatch)
    }

    XCTAssertEqual(archive.search("short explicit finalization", limit: 10).count, 2)
    let firstFrame = try await archive.videoFrame(for: ScreenMemoryRecordID(recordIDs[0]))
    let secondFrame = try await archive.videoFrame(for: ScreenMemoryRecordID(recordIDs[1]))
    XCTAssertNil(firstFrame)
    XCTAssertNil(secondFrame)
  }

  func testAppendReturnedShortFinalizationKeepsMappedFramesUnavailableAndOCRSearchable() async throws {
    let profile = try ScreenMemoryProfile(userID: "short-automatic-video-user", rootURL: temporaryDirectory())
    let recordIDs = [
      UUID(uuidString: "640D709F-7F89-41B8-8FCD-DDE22E3C1001")!,
      UUID(uuidString: "640D709F-7F89-41B8-8FCD-DDE22E3C1002")!,
    ]
    let idFactory = FixtureIDFactory(ids: recordIDs)
    let chunkID = ScreenMemoryVideoChunkID(
      UUID(uuidString: "640D709F-7F89-41B8-8FCD-DDE22E3C10C1")!
    )
    let firstLocation = ScreenMemoryVideoFrameLocation(chunkID: chunkID, sampleOrdinal: 0)
    let secondLocation = ScreenMemoryVideoFrameLocation(chunkID: chunkID, sampleOrdinal: 1)
    let archive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: SequencedScreenMemoryImageAnalyzer(
        hashes: [0, UInt64.max],
        ocr: ScreenMemoryOCRResult(fullText: "short automatic finalization OCR", blocks: [])
      ),
      idFactory: { idFactory.next() },
      videoArchive: FixtureVideoArchive(
        appendOutcomes: [
          .accepted(location: firstLocation, finalizedChunks: []),
          .accepted(
            location: secondLocation,
            finalizedChunks: [
              ScreenMemoryVideoChunkFinalization(chunkID: chunkID, sampleCount: 1)
            ]
          ),
        ],
        frameData: [firstLocation: Data([1]), secondLocation: Data([2])]
      )
    )

    for (index, capturedAt) in [
      "2026-07-15T09:29:37.000Z",
      "2026-07-15T09:29:38.000Z",
    ].enumerated() {
      _ = try await archive.ingest(
        captureInput(
          profile: profile,
          imageData: Data([UInt8(index)]),
          capturedAt: capturedAt,
          windowTitle: "Short automatic \(index)"
        )
      )
    }

    XCTAssertEqual(archive.search("short automatic finalization", limit: 10).count, 2)
    let firstFrame = try await archive.videoFrame(for: ScreenMemoryRecordID(recordIDs[0]))
    let secondFrame = try await archive.videoFrame(for: ScreenMemoryRecordID(recordIDs[1]))
    XCTAssertNil(firstFrame)
    XCTAssertNil(secondFrame)
  }

  func testStaleChunkFinalizesThroughArchiveStateMachine() async throws {
    let profile = try ScreenMemoryProfile(userID: "stale-video-user", rootURL: temporaryDirectory())
    let recordID = UUID(uuidString: "E1C78125-8945-4779-898B-935073A77001")!
    let chunkID = ScreenMemoryVideoChunkID(
      UUID(uuidString: "E1C78125-8945-4779-898B-935073A770C1")!
    )
    let location = ScreenMemoryVideoFrameLocation(chunkID: chunkID, sampleOrdinal: 0)
    let frameBytes = Data([2, 4, 6])
    let archive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: FixtureScreenMemoryImageAnalyzer(
        result: ScreenMemoryImageAnalysis(
          perceptualHash: 0x1010,
          ocr: ScreenMemoryOCRResult(fullText: "stale chunk", blocks: [])
        )
      ),
      idFactory: { recordID },
      videoArchive: FixtureVideoArchive(
        appendOutcomes: [.accepted(location: location, finalizedChunks: [])],
        finalizeBehavior: .succeed(
          ScreenMemoryVideoChunkFinalization(chunkID: chunkID, sampleCount: 1)
        ),
        frameData: [location: frameBytes]
      ),
      staleVideoChunkDelay: 0.01
    )
    _ = try await archive.ingest(
      captureInput(
        profile: profile,
        imageData: Data([1]),
        capturedAt: "2026-07-15T09:29:45.000Z",
        windowTitle: "Stale"
      )
    )

    let recordIDValue = ScreenMemoryRecordID(recordID)
    var available: ScreenMemoryVideoFrame?
    let pollDeadline = Date().addingTimeInterval(10)
    while Date() < pollDeadline {
      if let frame = try await archive.videoFrame(for: recordIDValue) {
        available = frame
        break
      }
      try await Task.sleep(nanoseconds: 5_000_000)
    }
    XCTAssertEqual(available?.imageData, frameBytes)
  }

  func testReopenClearsInterruptedChunkMappingsButPreservesOCRAndFinalizedChunks() async throws {
    let profile = try ScreenMemoryProfile(userID: "interrupted-video-user", rootURL: temporaryDirectory())
    let finalizedRecordID = UUID(uuidString: "BB9126F6-D19B-4C74-BEE2-7B657B9EC001")!
    let interruptedRecordID = UUID(uuidString: "BB9126F6-D19B-4C74-BEE2-7B657B9EC002")!
    let finalizedChunkID = ScreenMemoryVideoChunkID(
      UUID(uuidString: "BB9126F6-D19B-4C74-BEE2-7B657B9ECC01")!
    )
    let interruptedChunkID = ScreenMemoryVideoChunkID(
      UUID(uuidString: "BB9126F6-D19B-4C74-BEE2-7B657B9ECC02")!
    )
    let finalizedLocation = ScreenMemoryVideoFrameLocation(
      chunkID: finalizedChunkID,
      sampleOrdinal: 0
    )
    let interruptedLocation = ScreenMemoryVideoFrameLocation(
      chunkID: interruptedChunkID,
      sampleOrdinal: 0
    )
    let finalizedBytes = Data([4, 4, 4])

    let first = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: FixtureScreenMemoryImageAnalyzer(
        result: ScreenMemoryImageAnalysis(
          perceptualHash: 0,
          ocr: ScreenMemoryOCRResult(fullText: "valid finalized OCR", blocks: [])
        )
      ),
      idFactory: { finalizedRecordID },
      videoArchive: FixtureVideoArchive(
        appendOutcomes: [.accepted(location: finalizedLocation, finalizedChunks: [])],
        finalizeBehavior: .succeed(
          ScreenMemoryVideoChunkFinalization(chunkID: finalizedChunkID, sampleCount: 1)
        ),
        frameData: [finalizedLocation: finalizedBytes]
      ),
      now: try retentionSafeNow()
    )
    _ = try await first.ingest(
      captureInput(
        profile: profile,
        imageData: Data([1]),
        capturedAt: "2026-07-15T09:28:00.000Z",
        windowTitle: "Finalized"
      )
    )
    try await first.finalizeActiveVideoChunk()

    let second = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: FixtureScreenMemoryImageAnalyzer(
        result: ScreenMemoryImageAnalysis(
          perceptualHash: 0xFFFF,
          ocr: ScreenMemoryOCRResult(fullText: "interrupted OCR remains", blocks: [])
        )
      ),
      idFactory: { interruptedRecordID },
      videoArchive: FixtureVideoArchive(
        appendOutcomes: [.accepted(location: interruptedLocation, finalizedChunks: [])]
      ),
      now: try retentionSafeNow()
    )
    _ = try await second.ingest(
      captureInput(
        profile: profile,
        imageData: Data([2]),
        capturedAt: "2026-07-15T09:28:01.000Z",
        windowTitle: "Interrupted"
      )
    )

    let reopened = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: FixtureScreenMemoryImageAnalyzer(
        result: ScreenMemoryImageAnalysis(
          perceptualHash: 0,
          ocr: ScreenMemoryOCRResult(fullText: "unused", blocks: [])
        )
      ),
      videoArchive: FixtureVideoArchive(
        frameData: [finalizedLocation: finalizedBytes],
        recoveryStates: [interruptedChunkID: .staged]
      ),
      now: try retentionSafeNow()
    )

    let interruptedFrame = try await reopened.videoFrame(for: ScreenMemoryRecordID(interruptedRecordID))
    let finalizedFrame = try await reopened.videoFrame(for: ScreenMemoryRecordID(finalizedRecordID))
    XCTAssertNil(interruptedFrame)
    XCTAssertEqual(finalizedFrame?.imageData, finalizedBytes)
    XCTAssertEqual(reopened.search("interrupted remains", limit: 1).first?.recordID, ScreenMemoryRecordID(interruptedRecordID))
    XCTAssertEqual(reopened.search("valid finalized", limit: 1).first?.recordID, ScreenMemoryRecordID(finalizedRecordID))
  }

  func testRealStagedPartialIsRemovedWhenActiveChunkIsRecovered() async throws {
    let profile = try ScreenMemoryProfile(userID: "real-partial-user", rootURL: temporaryDirectory())
    let recordID = UUID(uuidString: "8C87FE15-99A8-4B9D-9EAF-0682E0239001")!
    let chunkID = ScreenMemoryVideoChunkID(
      UUID(uuidString: "8C87FE15-99A8-4B9D-9EAF-0682E02390C1")!
    )
    let location = ScreenMemoryVideoFrameLocation(chunkID: chunkID, sampleOrdinal: 0)
    let archive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: FixtureScreenMemoryImageAnalyzer(
        result: ScreenMemoryImageAnalysis(
          perceptualHash: 0xFACE,
          ocr: ScreenMemoryOCRResult(fullText: "partial recovery OCR", blocks: [])
        )
      ),
      idFactory: { recordID },
      videoArchive: FixtureVideoArchive(
        appendOutcomes: [.accepted(location: location, finalizedChunks: [])]
      )
    )
    _ = try await archive.ingest(
      captureInput(
        profile: profile,
        imageData: Data([7]),
        capturedAt: "2026-07-15T09:27:30.000Z",
        windowTitle: "Partial"
      )
    )
    let partialURL = profile.videoArchiveURL.appendingPathComponent(
      "\(chunkID.value.uuidString.lowercased()).partial.mp4"
    )
    try Data([0, 1, 2, 3]).write(to: partialURL)

    let reopened = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: FixtureScreenMemoryImageAnalyzer(
        result: ScreenMemoryImageAnalysis(
          perceptualHash: 0,
          ocr: ScreenMemoryOCRResult(fullText: "unused", blocks: [])
        )
      ),
      videoArchive: try OmiScreenMemoryVideoArchive(profile: profile)
    )
    let unavailable = try await reopened.videoFrame(for: ScreenMemoryRecordID(recordID))

    XCTAssertNil(unavailable)
    XCTAssertFalse(FileManager.default.fileExists(atPath: partialURL.path))
    XCTAssertEqual(reopened.search("partial recovery", limit: 1).first?.recordID, ScreenMemoryRecordID(recordID))
  }

  func testReopenAtomicallyReconcilesCompleteFileLeftFinalizing() async throws {
    let profile = try ScreenMemoryProfile(userID: "finalizing-valid-user", rootURL: temporaryDirectory())
    let recordID = UUID(uuidString: "1D61E3B8-3BC3-44BF-8A41-4E48DE829001")!
    let chunkID = ScreenMemoryVideoChunkID(
      UUID(uuidString: "1D61E3B8-3BC3-44BF-8A41-4E48DE8290C1")!
    )
    let location = ScreenMemoryVideoFrameLocation(chunkID: chunkID, sampleOrdinal: 0)
    let frameBytes = Data([5, 6, 7])
    let archive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: FixtureScreenMemoryImageAnalyzer(
        result: ScreenMemoryImageAnalysis(
          perceptualHash: 0xCAFE,
          ocr: ScreenMemoryOCRResult(fullText: "finalizing valid OCR", blocks: [])
        )
      ),
      idFactory: { recordID },
      videoArchive: FixtureVideoArchive(
        appendOutcomes: [.accepted(location: location, finalizedChunks: [])],
        finalizeBehavior: .fail
      )
    )
    _ = try await archive.ingest(
      captureInput(
        profile: profile,
        imageData: Data([3]),
        capturedAt: "2026-07-15T09:27:00.000Z",
        windowTitle: "Finalizing valid"
      )
    )
    do {
      try await archive.finalizeActiveVideoChunk()
      XCTFail("Expected the injected finalization interruption")
    } catch FixtureVideoArchiveError.finalizationFailed {
      // Simulates process loss after the DB enters finalizing.
    }

    let reopened = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: FixtureScreenMemoryImageAnalyzer(
        result: ScreenMemoryImageAnalysis(
          perceptualHash: 0,
          ocr: ScreenMemoryOCRResult(fullText: "unused", blocks: [])
        )
      ),
      videoArchive: FixtureVideoArchive(
        frameData: [location: frameBytes],
        recoveryStates: [chunkID: .finalized(sampleCount: 1)]
      )
    )

    let recovered = try await reopened.videoFrame(for: ScreenMemoryRecordID(recordID))
    XCTAssertEqual(recovered?.imageData, frameBytes)
    XCTAssertEqual(reopened.search("finalizing valid", limit: 1).first?.recordID, ScreenMemoryRecordID(recordID))
  }

  func testRealFinalizedMP4LeftFinalizingIsValidatedOnReopen() async throws {
    let profile = try ScreenMemoryProfile(userID: "real-finalizing-user", rootURL: temporaryDirectory())
    let recordID = UUID(uuidString: "44AA2E27-F2C8-41B8-8837-8B479DA99001")!
    do {
      let native = try OmiScreenMemoryVideoArchive(profile: profile)
      let archive = try ScreenMemoryArchive(
        profile: profile,
        imageAnalyzer: FixtureScreenMemoryImageAnalyzer(
          result: ScreenMemoryImageAnalysis(
            perceptualHash: 0xAA55,
            ocr: ScreenMemoryOCRResult(fullText: "real finalizing MP4", blocks: [])
          )
        ),
        idFactory: { recordID },
        videoArchive: FinalizeThenFailVideoArchive(base: native)
      )
      _ = try await archive.ingest(
        captureInput(
          profile: profile,
          imageData: try fixtureImageData(color: .systemBlue),
          capturedAt: "2026-07-15T09:26:30.000Z",
          windowTitle: "Real finalizing"
        )
      )
      do {
        try await archive.finalizeActiveVideoChunk()
        XCTFail("Expected simulated process interruption after MP4 publication")
      } catch FixtureVideoArchiveError.finalizationFailed {
        // The underlying Omi encoder has published the finalized MP4 already.
      }

      let reopened = try ScreenMemoryArchive(
        profile: profile,
        imageAnalyzer: FixtureScreenMemoryImageAnalyzer(
          result: ScreenMemoryImageAnalysis(
            perceptualHash: 0,
            ocr: ScreenMemoryOCRResult(fullText: "unused", blocks: [])
          )
        ),
        videoArchive: try OmiScreenMemoryVideoArchive(profile: profile)
      )
      let recovered = try await reopened.videoFrame(for: ScreenMemoryRecordID(recordID))
      let frame = try XCTUnwrap(recovered)
      assertDominantColor(.blue, in: frame.imageData)
    } catch let error as OmiScreenMemoryVideoArchiveError where error == .codecUnavailable {
      throw XCTSkip("System HEVC encoder is unavailable: \(error.localizedDescription)")
    }
  }

  func testReopenRemovesInvalidFileMappingLeftFinalizingButKeepsOCRHealthy() async throws {
    let profile = try ScreenMemoryProfile(userID: "finalizing-invalid-user", rootURL: temporaryDirectory())
    let recordID = UUID(uuidString: "08B28B07-D0D0-4DDA-A346-AC1D2C519001")!
    let chunkID = ScreenMemoryVideoChunkID(
      UUID(uuidString: "08B28B07-D0D0-4DDA-A346-AC1D2C5190C1")!
    )
    let location = ScreenMemoryVideoFrameLocation(chunkID: chunkID, sampleOrdinal: 0)
    let archive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: FixtureScreenMemoryImageAnalyzer(
        result: ScreenMemoryImageAnalysis(
          perceptualHash: 0xBEEF,
          ocr: ScreenMemoryOCRResult(fullText: "invalid video keeps searchable OCR", blocks: [])
        )
      ),
      idFactory: { recordID },
      videoArchive: FixtureVideoArchive(
        appendOutcomes: [.accepted(location: location, finalizedChunks: [])],
        finalizeBehavior: .fail
      )
    )
    _ = try await archive.ingest(
      captureInput(
        profile: profile,
        imageData: Data([4]),
        capturedAt: "2026-07-15T09:26:00.000Z",
        windowTitle: "Finalizing invalid"
      )
    )
    do {
      try await archive.finalizeActiveVideoChunk()
      XCTFail("Expected the injected finalization interruption")
    } catch FixtureVideoArchiveError.finalizationFailed {
      // Simulates a finalizing row whose published file is unusable.
    }

    let reopened = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: FixtureScreenMemoryImageAnalyzer(
        result: ScreenMemoryImageAnalysis(
          perceptualHash: 0,
          ocr: ScreenMemoryOCRResult(fullText: "unused", blocks: [])
        )
      ),
      videoArchive: FixtureVideoArchive(
        recoveryStates: [chunkID: .missingOrInvalid]
      )
    )

    let unavailable = try await reopened.videoFrame(for: ScreenMemoryRecordID(recordID))
    XCTAssertNil(unavailable)
    XCTAssertEqual(
      reopened.search("searchable OCR", limit: 1).first?.recordID,
      ScreenMemoryRecordID(recordID)
    )
    XCTAssertNotNil(reopened.record(ScreenMemoryRecordID(recordID)))
  }

  func testFinalizedVideoFramesSurviveReopenAndReplayInCaptureOrder() async throws {
    let profile = try ScreenMemoryProfile(userID: "video-user", rootURL: temporaryDirectory())
    let ids = [
      UUID(uuidString: "427A6373-3E31-4E2B-A210-C1F769C86501")!,
      UUID(uuidString: "427A6373-3E31-4E2B-A210-C1F769C86502")!,
      UUID(uuidString: "427A6373-3E31-4E2B-A210-C1F769C86503")!,
    ]
    let idFactory = FixtureIDFactory(ids: ids)
    let analyzer = SequencedScreenMemoryImageAnalyzer(
      hashes: [0x0000, 0xFFFF, 0xFFFF_0000],
      ocr: ScreenMemoryOCRResult(fullText: "fixture screen", blocks: [])
    )

    do {
      let archive = try ScreenMemoryArchive(
        profile: profile,
        imageAnalyzer: analyzer,
        idFactory: { idFactory.next() },
        videoArchive: try OmiScreenMemoryVideoArchive(profile: profile)
      )
      let captures = [
        ("2026-07-15T09:30:00.000Z", NSColor.systemRed),
        ("2026-07-15T09:30:01.000Z", NSColor.systemGreen),
        ("2026-07-15T09:30:02.000Z", NSColor.systemBlue),
      ]

      for (index, capture) in captures.enumerated() {
        let outcome = try await archive.ingest(
          ScreenMemoryCaptureInput(
            userID: profile.userID,
            imageData: try fixtureImageData(color: capture.1),
            capturedAt: capture.0,
            appBundleID: "com.intentive.fixture",
            appName: "Fixture",
            windowTitle: "Frame \(index)"
          )
        )
        XCTAssertEqual(outcome, .stored(ScreenMemoryRecordID(ids[index])))
      }

      try await archive.finalizeActiveVideoChunk()

      let reopened = try ScreenMemoryArchive(
        profile: profile,
        imageAnalyzer: analyzer,
        videoArchive: try OmiScreenMemoryVideoArchive(profile: profile)
      )
      let loadedMiddle = try await reopened.videoFrame(for: ScreenMemoryRecordID(ids[1]))
      let middle = try XCTUnwrap(loadedMiddle)
      XCTAssertEqual(middle.recordID, ScreenMemoryRecordID(ids[1]))
      assertDominantColor(.green, in: middle.imageData)
      let cachedMiddle = try await reopened.videoFrame(for: ScreenMemoryRecordID(ids[1]))
      XCTAssertEqual(cachedMiddle?.imageData, middle.imageData)

      let replay = try await reopened.videoFrames(
        from: try fixtureDate("2026-07-15T09:30:00.000Z"),
        through: try fixtureDate("2026-07-15T09:30:02.000Z")
      )
      XCTAssertEqual(replay.map(\.recordID), ids.map(ScreenMemoryRecordID.init))
      assertDominantColor(.red, in: replay[0].imageData)
      assertDominantColor(.green, in: replay[1].imageData)
      assertDominantColor(.blue, in: replay[2].imageData)
      XCTAssertFalse(String(describing: replay).contains(profile.databaseURL.deletingLastPathComponent().path))
    } catch let error as OmiScreenMemoryVideoArchiveError where error == .codecUnavailable {
      throw XCTSkip("System HEVC encoder is unavailable: \(error.localizedDescription)")
    }
  }

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
      idFactory: { storedID },
      now: try retentionSafeNow()
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
    let reopenedArchive = try ScreenMemoryArchive(
      profile: profile,
      imageAnalyzer: reopenedAnalyzer,
      now: try retentionSafeNow()
    )

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
      publisher: PerceptionPublisher(
        runtimeClient: DisconnectedRuntimeChatClient(),
        windowIdProvider: desktopTestCoachingWindowIdProvider
      ),
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

  private func fixtureImageData(
    color: NSColor,
    size: NSSize = NSSize(width: 96, height: 64)
  ) throws -> Data {
    let image = NSImage(size: size)
    image.lockFocus()
    color.setFill()
    NSRect(origin: .zero, size: size).fill()
    image.unlockFocus()
    guard
      let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let data = bitmap.representation(using: .png, properties: [:])
    else {
      throw FixtureImageError.encodingFailed
    }
    return data
  }

  private func captureInput(
    profile: ScreenMemoryProfile,
    imageData: Data,
    capturedAt: String,
    windowTitle: String
  ) -> ScreenMemoryCaptureInput {
    ScreenMemoryCaptureInput(
      userID: profile.userID,
      imageData: imageData,
      capturedAt: capturedAt,
      appBundleID: "com.intentive.fixture",
      appName: "Fixture",
      windowTitle: windowTitle
    )
  }

  private func fixtureDate(_ value: String) throws -> Date {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let date = formatter.date(from: value) else { throw FixtureImageError.invalidDate }
    return date
  }

  /// A clock pinned inside the seven-day retention window of the `2026-07-15`
  /// fixtures. Reopen-then-ingest fixtures re-run launch-time expiry on the
  /// second archive; without a fixed `now` the wall clock eventually advances
  /// past the fixtures' real expiry and prunes them mid-test. This only pins
  /// the fixtures' clock — production retention and recovery are unchanged.
  private func retentionSafeNow(
    _ value: String = "2026-07-15T09:30:00.000Z"
  ) throws -> @Sendable () -> Date {
    let reference = try fixtureDate(value)
    return { reference }
  }

  private func assertDominantColor(
    _ expected: FixtureDominantColor,
    in imageData: Data,
    file: StaticString = #filePath,
    line: UInt = #line
  ) {
    guard
      let image = NSImage(data: imageData),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
    else {
      return XCTFail("Expected decoded image bytes", file: file, line: line)
    }
    let bitmap = NSBitmapImageRep(cgImage: cgImage)
    guard
      let color = bitmap.colorAt(x: bitmap.pixelsWide / 2, y: bitmap.pixelsHigh / 2)?
        .usingColorSpace(.deviceRGB)
    else {
      return XCTFail("Expected a readable center pixel", file: file, line: line)
    }
    let channels = [
      FixtureDominantColor.red: color.redComponent,
      FixtureDominantColor.green: color.greenComponent,
      FixtureDominantColor.blue: color.blueComponent,
    ]
    XCTAssertEqual(channels.max(by: { $0.value < $1.value })?.key, expected, file: file, line: line)
  }
}

private enum FixtureDominantColor: Hashable {
  case red
  case green
  case blue
}

private enum FixtureImageError: Error {
  case encodingFailed
  case invalidDate
}

private final class FixtureIDFactory: @unchecked Sendable {
  private let lock = NSLock()
  private var ids: [UUID]

  init(ids: [UUID]) {
    self.ids = ids
  }

  func next() -> UUID {
    lock.withLock { ids.removeFirst() }
  }
}

private enum FixtureVideoArchiveError: Error {
  case finalizationFailed
  case missingFixtureFrame
}

private actor FixtureVideoArchive: ScreenMemoryVideoArchiving {
  enum FinalizeBehavior: Sendable {
    case succeed(ScreenMemoryVideoChunkFinalization?)
    case fail
  }

  private var appendOutcomes: [ScreenMemoryVideoWriteOutcome]
  private var activeChunk: ScreenMemoryVideoChunkID?
  private let finalizeBehavior: FinalizeBehavior
  private let frameData: [String: Data]
  private let recoveryStates: [ScreenMemoryVideoChunkID: ScreenMemoryVideoChunkRecoveryState]

  init(
    appendOutcomes: [ScreenMemoryVideoWriteOutcome] = [],
    finalizeBehavior: FinalizeBehavior = .succeed(nil),
    frameData: [ScreenMemoryVideoFrameLocation: Data] = [:],
    recoveryStates: [ScreenMemoryVideoChunkID: ScreenMemoryVideoChunkRecoveryState] = [:]
  ) {
    self.appendOutcomes = appendOutcomes
    self.finalizeBehavior = finalizeBehavior
    self.frameData = Dictionary(
      uniqueKeysWithValues: frameData.map { (Self.key($0.key), $0.value) }
    )
    self.recoveryStates = recoveryStates
  }

  func appendFrame(imageData _: Data, capturedAt _: Date) async throws -> ScreenMemoryVideoWriteOutcome {
    let outcome = appendOutcomes.removeFirst()
    if case .accepted(let location, let finalizedChunks) = outcome {
      activeChunk = finalizedChunks.contains(where: { $0.chunkID == location.chunkID })
        ? nil
        : location.chunkID
    }
    return outcome
  }

  func activeChunkID() async -> ScreenMemoryVideoChunkID? {
    activeChunk
  }

  func finalizeActiveChunk() async throws -> ScreenMemoryVideoChunkFinalization? {
    switch finalizeBehavior {
    case .succeed(let result):
      activeChunk = nil
      return result
    case .fail:
      throw FixtureVideoArchiveError.finalizationFailed
    }
  }

  func loadFrame(at location: ScreenMemoryVideoFrameLocation) async throws -> Data {
    guard let data = frameData[Self.key(location)] else {
      throw FixtureVideoArchiveError.missingFixtureFrame
    }
    return data
  }

  func recoveryState(
    for chunkID: ScreenMemoryVideoChunkID,
    expectedSampleCount _: Int
  ) async -> ScreenMemoryVideoChunkRecoveryState {
    recoveryStates[chunkID] ?? .missingOrInvalid
  }

  func discardChunk(_ chunkID: ScreenMemoryVideoChunkID) async {
    if activeChunk == chunkID { activeChunk = nil }
  }

  private nonisolated static func key(_ location: ScreenMemoryVideoFrameLocation) -> String {
    "\(location.chunkID.value.uuidString):\(location.sampleOrdinal)"
  }
}

private actor FinalizeThenFailVideoArchive: ScreenMemoryVideoArchiving {
  private let base: OmiScreenMemoryVideoArchive

  init(base: OmiScreenMemoryVideoArchive) {
    self.base = base
  }

  func appendFrame(imageData: Data, capturedAt: Date) async throws -> ScreenMemoryVideoWriteOutcome {
    try await base.appendFrame(imageData: imageData, capturedAt: capturedAt)
  }

  func activeChunkID() async -> ScreenMemoryVideoChunkID? {
    await base.activeChunkID()
  }

  func finalizeActiveChunk() async throws -> ScreenMemoryVideoChunkFinalization? {
    _ = try await base.finalizeActiveChunk()
    throw FixtureVideoArchiveError.finalizationFailed
  }

  func loadFrame(at location: ScreenMemoryVideoFrameLocation) async throws -> Data {
    try await base.loadFrame(at: location)
  }

  func recoveryState(
    for chunkID: ScreenMemoryVideoChunkID,
    expectedSampleCount: Int
  ) async -> ScreenMemoryVideoChunkRecoveryState {
    await base.recoveryState(for: chunkID, expectedSampleCount: expectedSampleCount)
  }

  func discardChunk(_ chunkID: ScreenMemoryVideoChunkID) async {
    await base.discardChunk(chunkID)
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
