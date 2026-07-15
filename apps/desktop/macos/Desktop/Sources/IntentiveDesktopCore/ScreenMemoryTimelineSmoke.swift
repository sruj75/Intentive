import Foundation

/// Headless accessibility snapshot of the Screen Memory timeline — the same
/// logical tree the SwiftUI view exposes, every element addressed by a
/// `ScreenMemoryAccessibilityID`. A UI-smoke test asserts against this tree and
/// issues actions by identifier, so it exercises exactly the seam a real
/// XCUITest would drive against the rendered view.
public struct ScreenMemoryTimelineSnapshot: Equatable, Sendable {
  public struct Frame: Equatable, Sendable {
    public let identifier: String
    public let recordID: ScreenMemoryRecordID
    public let appName: String
    public let capturedAt: String
    public let isSelected: Bool
  }

  public let searchQuery: String
  public let frames: [Frame]
  public let selectedFrameIdentifier: String?
  public let appFilterIdentifiers: [String]
  public let ocrHighlightIdentifiers: [String]
  public let storageLabel: String?
  public let isEmpty: Bool
  public let isSearching: Bool

  /// Identifiers of every filmstrip cell, in display order.
  public var frameIdentifiers: [String] { frames.map(\.identifier) }
}

/// Accessibility-driven UI-smoke harness over `ScreenMemoryTimeline`.
///
/// This is the introduced UI tracer: launch a seeded archive, search known OCR
/// or semantic content, open a result, scrub its timeline, and render the frame
/// — all addressed through `ScreenMemoryAccessibilityID` rather than by poking
/// the model directly, so the SwiftUI timeline can wear the same identifiers and
/// a UI test drives both surfaces identically.
@MainActor
public final class ScreenMemoryTimelineSmoke {
  private let timeline: ScreenMemoryTimeline

  public init(timeline: ScreenMemoryTimeline) {
    self.timeline = timeline
  }

  // MARK: - Actions (as a UI test would issue them)

  /// Launch onto a day — the day view's initial load.
  public func launch(on day: Date) async {
    await timeline.loadDay(day)
  }

  /// Type into `ScreenMemoryAccessibilityID.searchField` and submit.
  public func typeSearch(_ query: String) async {
    await timeline.search(query)
  }

  /// Tap the app-filter chip identified by `identifier` (nil clears the filter).
  public func tapAppFilter(_ identifier: String?) async {
    guard let identifier else {
      await timeline.filterByApp(nil)
      return
    }
    let app = timeline.state.availableApps.first {
      ScreenMemoryAccessibilityID.appFilter($0) == identifier
    }
    await timeline.filterByApp(app)
  }

  /// Tap a filmstrip cell by its accessibility identifier. Returns `false` when
  /// no visible frame carries that identifier.
  @discardableResult
  public func tapFrame(_ identifier: String) -> Bool {
    guard let record = timeline.state.frames.first(where: { frameIdentifier(for: $0) == identifier }),
          let recordID = recordID(for: record) else { return false }
    timeline.select(recordID)
    return true
  }

  /// Tap `ScreenMemoryAccessibilityID.scrubForward`.
  public func tapScrubForward() {
    timeline.selectNext()
  }

  /// Tap `ScreenMemoryAccessibilityID.scrubBackward`.
  public func tapScrubBackward() {
    timeline.selectPrevious()
  }

  /// Render the frame shown at `ScreenMemoryAccessibilityID.currentFrame`.
  public func renderCurrentFrame() async -> Data? {
    guard let recordID = timeline.state.selectedRecordID else { return nil }
    return await timeline.frameImage(for: recordID)?.imageData
  }

  /// Tap `ScreenMemoryAccessibilityID.deleteFrame` on the current frame.
  @discardableResult
  public func tapDeleteCurrentFrame(confirmChunkDeletion: Bool) async -> ScreenMemoryDeletionResult? {
    guard let recordID = timeline.state.selectedRecordID else { return nil }
    return await timeline.delete(recordID, confirmChunkDeletion: confirmChunkDeletion)
  }

  // MARK: - Observation

  /// The current accessibility tree.
  public func snapshot() -> ScreenMemoryTimelineSnapshot {
    let state = timeline.state
    let frames = state.frames.compactMap { record -> ScreenMemoryTimelineSnapshot.Frame? in
      guard let recordID = recordID(for: record) else { return nil }
      return ScreenMemoryTimelineSnapshot.Frame(
        identifier: ScreenMemoryAccessibilityID.frame(recordID),
        recordID: recordID,
        appName: record.appName,
        capturedAt: record.capturedAt,
        isSelected: state.selectedRecordID == recordID
      )
    }
    let ocrHighlights: [String]
    if let selected = state.selectedRecordID {
      ocrHighlights = timeline.matchingBlocks(for: selected).indices
        .map(ScreenMemoryAccessibilityID.ocrHighlight)
    } else {
      ocrHighlights = []
    }
    return ScreenMemoryTimelineSnapshot(
      searchQuery: state.activeQuery ?? "",
      frames: frames,
      selectedFrameIdentifier: state.selectedRecordID.map(ScreenMemoryAccessibilityID.frame),
      appFilterIdentifiers: state.availableApps.map(ScreenMemoryAccessibilityID.appFilter),
      ocrHighlightIdentifiers: ocrHighlights,
      storageLabel: state.storage.map(Self.storageLabel),
      isEmpty: state.frames.isEmpty,
      isSearching: state.isSearching
    )
  }

  // MARK: - Private

  private func frameIdentifier(for record: ScreenMemoryRecord) -> String? {
    recordID(for: record).map(ScreenMemoryAccessibilityID.frame)
  }

  private func recordID(for record: ScreenMemoryRecord) -> ScreenMemoryRecordID? {
    UUID(uuidString: record.id).map(ScreenMemoryRecordID.init)
  }

  private static func storageLabel(_ report: ScreenMemoryStorageReport) -> String {
    let formatter = ByteCountFormatter()
    formatter.countStyle = .file
    return formatter.string(fromByteCount: report.totalBytes)
  }
}
