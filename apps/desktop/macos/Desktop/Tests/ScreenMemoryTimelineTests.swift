import CoreGraphics
import Foundation
@testable import IntentiveDesktopCore
import XCTest

/// Slice 05 — Screen Memory timeline browser (renovated from Omi's RewindViewModel).
/// Drives the day view, hybrid search, scrubber, single-frame rendering, OCR
/// highlight cards, deletion, and storage reporting through the public seam.
@MainActor
final class ScreenMemoryTimelineTests: XCTestCase {
  func testLoadDayOrdersFramesListsAppsAndReportsStorage() async throws {
    let (archive, _) = try await TimelineFixture.seededArchive(frames: sampleFrames)
    let timeline = ScreenMemoryTimeline(archive: archive, selectedDate: day, calendar: utc)

    await timeline.loadDay(day)

    XCTAssertEqual(timeline.state.frames.map(\.id), sampleFrames.map(\.id))
    XCTAssertEqual(timeline.state.availableApps, ["Books", "Ledger", "Xcode"])
    XCTAssertEqual(timeline.state.selectedRecordID?.value.uuidString, sampleFrames.first?.id)
    XCTAssertNotNil(timeline.state.storage)
  }

  func testSearchOpensResultScrubsTimelineAndRendersFrame() async throws {
    let (archive, frameBytes) = try await TimelineFixture.seededArchive(frames: sampleFrames)
    let timeline = ScreenMemoryTimeline(archive: archive, selectedDate: day, calendar: utc)
    await timeline.loadDay(day)

    // Search known OCR content — the ledger frame.
    await timeline.search("invoice reconciliation")
    XCTAssertEqual(timeline.state.frames.map(\.id), [ledgerID])
    XCTAssertEqual(timeline.state.activeQuery, "invoice reconciliation")
    XCTAssertEqual(timeline.state.searchGroups.first?.appName, "Ledger")

    // Open the result and render its frame from the finalized chunk.
    let recordID = ScreenMemoryRecordID(UUID(uuidString: ledgerID)!)
    timeline.select(recordID)
    let frame = await timeline.frameImage(for: recordID)
    XCTAssertEqual(frame?.imageData, frameBytes[ledgerID])

    // Highlight cards for the query.
    XCTAssertFalse(timeline.matchingBlocks(for: recordID).isEmpty)

    // Back on the day view, the scrubber walks frames in order from a chosen frame.
    await timeline.loadDay(day)
    timeline.select(ScreenMemoryRecordID(UUID(uuidString: sampleFrames[0].id)!))
    XCTAssertEqual(timeline.state.selectedRecordID?.value.uuidString, sampleFrames[0].id)
    timeline.selectNext()
    XCTAssertEqual(timeline.state.selectedRecordID?.value.uuidString, sampleFrames[1].id)
    timeline.selectNext()
    XCTAssertEqual(timeline.state.selectedRecordID?.value.uuidString, sampleFrames[2].id)
    timeline.selectPrevious()
    XCTAssertEqual(timeline.state.selectedRecordID?.value.uuidString, sampleFrames[1].id)
  }

  func testDeleteRemovesFrameFromTimelineAndUpdatesStorage() async throws {
    let (archive, _) = try await TimelineFixture.seededArchive(frames: sampleFrames)
    let timeline = ScreenMemoryTimeline(archive: archive, selectedDate: day, calendar: utc)
    await timeline.loadDay(day)

    let recordID = ScreenMemoryRecordID(UUID(uuidString: ledgerID)!)
    let result = await timeline.delete(recordID, confirmChunkDeletion: true)

    XCTAssertNotNil(result)
    XCTAssertFalse(timeline.state.frames.contains { $0.id == ledgerID })
    XCTAssertNil(timeline.state.frames.first { $0.id == ledgerID })
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
