import Foundation
@testable import IntentiveDesktopCore
import XCTest

/// Slice 05 — accessibility-driven UI-smoke harness.
///
/// The tracer: launch a seeded archive, search known OCR content, open a result,
/// scrub its timeline, and render the expected frame — every step addressed
/// through `ScreenMemoryAccessibilityID`, never by poking the model. This is the
/// same logical tree the SwiftUI timeline wears, so the harness proves the
/// identifiers a UI test would drive against.
@MainActor
final class ScreenMemoryTimelineSmokeTests: XCTestCase {
  func testTracerSearchesOpensScrubsAndRendersThroughAccessibilityTree() async throws {
    let (archive, frameBytes) = try await TimelineFixture.seededArchive(frames: sampleFrames)
    let smoke = ScreenMemoryTimelineSmoke(
      timeline: ScreenMemoryTimeline(archive: archive, selectedDate: day, calendar: utc)
    )

    // Launch: the day view exposes every frame and app filter by identifier.
    await smoke.launch(on: day)
    let launched = smoke.snapshot()
    XCTAssertEqual(launched.frameIdentifiers, sampleFrames.map { frameID($0.id) })
    XCTAssertEqual(
      launched.appFilterIdentifiers,
      ["Books", "Ledger", "Xcode"].map(ScreenMemoryAccessibilityID.appFilter)
    )
    XCTAssertNotNil(launched.storageLabel)
    XCTAssertFalse(launched.isEmpty)

    // Search known OCR content — the filmstrip collapses to the ledger frame.
    await smoke.typeSearch("invoice reconciliation")
    let searched = smoke.snapshot()
    XCTAssertEqual(searched.searchQuery, "invoice reconciliation")
    XCTAssertEqual(searched.frameIdentifiers, [frameID(ledgerID)])

    // Open the result by tapping its filmstrip cell identifier.
    XCTAssertTrue(smoke.tapFrame(frameID(ledgerID)))
    let opened = smoke.snapshot()
    XCTAssertEqual(opened.selectedFrameIdentifier, frameID(ledgerID))
    XCTAssertFalse(opened.ocrHighlightIdentifiers.isEmpty)

    // Render the opened frame from its finalized chunk.
    let rendered = await smoke.renderCurrentFrame()
    XCTAssertEqual(rendered, frameBytes[ledgerID])

    // Back on the day view, the scrubber walks frames by identifier.
    await smoke.launch(on: day)
    XCTAssertTrue(smoke.tapFrame(frameID(xcodeID)))
    smoke.tapScrubForward()
    XCTAssertEqual(smoke.snapshot().selectedFrameIdentifier, frameID(ledgerID))
    smoke.tapScrubForward()
    XCTAssertEqual(smoke.snapshot().selectedFrameIdentifier, frameID(booksID))
    smoke.tapScrubBackward()
    XCTAssertEqual(smoke.snapshot().selectedFrameIdentifier, frameID(ledgerID))
  }

  func testDeleteThroughSmokeDropsCurrentFrameAndUpdatesStorage() async throws {
    let (archive, _) = try await TimelineFixture.seededArchive(frames: sampleFrames)
    let smoke = ScreenMemoryTimelineSmoke(
      timeline: ScreenMemoryTimeline(archive: archive, selectedDate: day, calendar: utc)
    )
    await smoke.launch(on: day)

    XCTAssertTrue(smoke.tapFrame(frameID(ledgerID)))
    let result = await smoke.tapDeleteCurrentFrame(confirmChunkDeletion: true)

    XCTAssertNotNil(result)
    XCTAssertFalse(smoke.snapshot().frameIdentifiers.contains(frameID(ledgerID)))
  }

  // MARK: - Fixtures

  private let day = ISO8601DateFormatter().date(from: "2026-07-14T00:00:00Z")!
  private var utc: Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    return calendar
  }

  private let xcodeID = "11110000-0000-0000-0000-000000000001"
  private let ledgerID = "22220000-0000-0000-0000-000000000002"
  private let booksID = "33330000-0000-0000-0000-000000000003"

  private func frameID(_ id: String) -> String {
    ScreenMemoryAccessibilityID.frame(ScreenMemoryRecordID(UUID(uuidString: id)!))
  }

  private var sampleFrames: [TimelineFrameSeed] {
    [
      TimelineFrameSeed(id: xcodeID, capturedAt: "2026-07-14T09:00:00.000Z", appName: "Xcode", windowTitle: "Timeline.swift", ocr: "func loadDay renders frames", ocrBlocks: []),
      TimelineFrameSeed(
        id: ledgerID,
        capturedAt: "2026-07-14T12:00:00.000Z",
        appName: "Ledger",
        windowTitle: "Q3",
        ocr: "invoice reconciliation pending review",
        ocrBlocks: [ScreenMemoryOCRBlock(text: "invoice reconciliation", x: 0.1, y: 0.8, width: 0.4, height: 0.05, confidence: 0.99)]
      ),
      TimelineFrameSeed(id: booksID, capturedAt: "2026-07-14T18:00:00.000Z", appName: "Books", windowTitle: "Chapter 3", ocr: "reading about attention", ocrBlocks: []),
    ]
  }
}
