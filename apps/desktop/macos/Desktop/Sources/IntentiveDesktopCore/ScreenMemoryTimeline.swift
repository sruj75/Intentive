import CoreGraphics
import Foundation

// MARK: - OCR card helpers (renovated from Omi's OCRResult / OCRTextBlock)

public extension ScreenMemoryOCRBlock {
  /// Convert a normalized Vision block (bottom-left origin) to a top-left screen
  /// rect for display over a frame of `imageSize`. Omi's `screenRect(for:)`.
  func screenRect(for imageSize: CGSize) -> CGRect {
    CGRect(
      x: x * imageSize.width,
      y: (1.0 - y - height) * imageSize.height,
      width: width * imageSize.width,
      height: height * imageSize.height
    )
  }
}

public extension ScreenMemoryRecord {
  /// OCR blocks whose text contains the query (case-insensitive) — Omi's
  /// `blocksContaining`, used to highlight matches on an opened frame.
  func matchingBlocks(for query: String) -> [ScreenMemoryOCRBlock] {
    let needle = query.lowercased()
    guard !needle.isEmpty else { return [] }
    return ocrBlocks.filter { $0.text.lowercased().contains(needle) }
  }

  /// A short snippet of OCR text around the first match — Omi's `contextSnippet`.
  func contextSnippet(for query: String, maxLength: Int = 150) -> String? {
    let needle = query.lowercased()
    let haystack = ocrText.lowercased()
    guard !needle.isEmpty, let range = haystack.range(of: needle) else { return nil }

    let matchStart = haystack.distance(from: haystack.startIndex, to: range.lowerBound)
    let contextStart = max(0, matchStart - 50)
    let contextEnd = min(ocrText.count, matchStart + query.count + 100)
    guard contextStart <= ocrText.count, contextEnd <= ocrText.count, contextStart <= contextEnd else {
      return nil
    }
    let startIndex = ocrText.index(ocrText.startIndex, offsetBy: contextStart)
    let endIndex = ocrText.index(ocrText.startIndex, offsetBy: contextEnd)
    var snippet = String(ocrText[startIndex ..< endIndex]).replacingOccurrences(of: "\n", with: " ")
    if contextStart > 0 { snippet = "…" + snippet }
    if contextEnd < ocrText.count { snippet += "…" }
    _ = maxLength
    return snippet
  }
}

// MARK: - Search result grouping (renovated from Omi's SearchResultGroup)

/// A run of records from the same app/window context within a time window,
/// preserving relevance order — Omi's `SearchResultGroup`.
public struct ScreenMemoryTimelineGroup: Equatable, Sendable, Identifiable {
  public let id: String
  public let representative: ScreenMemoryRecord
  public let records: [ScreenMemoryRecord]

  public var appName: String { representative.appName }
  public var windowTitle: String { representative.windowTitle }
  public var count: Int { records.count }
}

public extension Array where Element == ScreenMemoryRecord {
  /// Group records by app/window context, splitting into sessions separated by a
  /// time gap, preserving the input relevance order. Omi's `groupedByContext`.
  func groupedByContext(timeWindowSeconds: TimeInterval = 30) -> [ScreenMemoryTimelineGroup] {
    guard !isEmpty else { return [] }
    typealias Session = ScreenMemoryContextSession
    var sessionsByContext: [String: [Session]] = [:]
    var order: [(key: String, index: Int)] = []

    for record in self {
      let time = ScreenMemoryTimestamp.date(record.capturedAt) ?? Date.distantPast
      let key = "\(record.appName)|\(record.windowTitle)"
      if var sessions = sessionsByContext[key] {
        if let slot = sessions.firstIndex(where: { $0.contains(time, within: timeWindowSeconds) }) {
          sessions[slot].records.append(record)
          sessions[slot].minTime = Swift.min(sessions[slot].minTime, time)
          sessions[slot].maxTime = Swift.max(sessions[slot].maxTime, time)
          sessionsByContext[key] = sessions
        } else {
          sessionsByContext[key]?.append(Session(records: [record], minTime: time, maxTime: time))
          order.append((key, sessions.count))
        }
      } else {
        sessionsByContext[key] = [Session(records: [record], minTime: time, maxTime: time)]
        order.append((key, 0))
      }
    }

    return order.compactMap { entry in
      guard let session = sessionsByContext[entry.key]?[safe: entry.index],
            let representative = session.records.first else { return nil }
      return ScreenMemoryTimelineGroup(
        id: "\(entry.key)#\(entry.index)",
        representative: representative,
        records: session.records.sorted { $0.capturedAt > $1.capturedAt }
      )
    }
  }
}

private struct ScreenMemoryContextSession {
  var records: [ScreenMemoryRecord]
  var minTime: Date
  var maxTime: Date
  func contains(_ time: Date, within window: TimeInterval) -> Bool {
    time >= minTime.addingTimeInterval(-window) && time <= maxTime.addingTimeInterval(window)
  }
}

private extension Array {
  subscript(safe index: Int) -> Element? {
    indices.contains(index) ? self[index] : nil
  }
}

enum ScreenMemoryTimestamp {
  static func date(_ value: String) -> Date? {
    ISO8601DateFormatter.intentiveProtocol.date(from: value) ?? ISO8601DateFormatter().date(from: value)
  }
}

// MARK: - Timeline browser

/// Screen Memory timeline browser — renovated from Omi's `RewindViewModel`.
/// Owns day navigation, the loaded frame list, the scrubber selection, hybrid
/// search with context grouping, single-frame retrieval, deletion, and storage
/// reporting. UI is a thin shell over this observable value state.
@MainActor
public final class ScreenMemoryTimeline {
  public struct State: Equatable, Sendable {
    public var selectedDate: Date
    public var frames: [ScreenMemoryRecord] = []
    public var selectedRecordID: ScreenMemoryRecordID?
    public var activeQuery: String?
    public var searchGroups: [ScreenMemoryTimelineGroup] = []
    public var availableApps: [String] = []
    public var selectedApp: String?
    public var storage: ScreenMemoryStorageReport?
    public var isSearching: Bool = false
  }

  public private(set) var state: State

  private let archive: ScreenMemoryArchive
  private let calendar: Calendar
  private let dayTargetCount: Int
  private let searchGroupingWindow: TimeInterval

  public init(
    archive: ScreenMemoryArchive,
    selectedDate: Date = Date(),
    calendar: Calendar = .current,
    dayTargetCount: Int = 500,
    searchGroupingWindow: TimeInterval = 30
  ) {
    self.archive = archive
    self.calendar = calendar
    self.dayTargetCount = dayTargetCount
    self.searchGroupingWindow = searchGroupingWindow
    state = State(selectedDate: selectedDate)
  }

  /// Load a day's frames (date filter is always active, like Omi). Clears any
  /// active search and selects the first frame.
  public func loadDay(_ date: Date) async {
    state.selectedDate = date
    state.activeQuery = nil
    state.searchGroups = []
    state.isSearching = false
    applyFrames(dayFrames())
    state.availableApps = archive.appNames()
    state.storage = try? archive.storageReport()
  }

  /// Filter the current view by app (nil clears). Mirrors Omi's `filterByApp`.
  public func filterByApp(_ app: String?) async {
    state.selectedApp = app
    if let query = state.activeQuery {
      await search(query)
    } else {
      applyFrames(dayFrames())
    }
  }

  /// Hybrid search over the selected day — Omi's `performSearch`. Empty query
  /// resets to the day view. Results are grouped by context for the filmstrip.
  public func search(_ query: String) async {
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      await loadDay(state.selectedDate)
      return
    }
    state.isSearching = true
    state.activeQuery = trimmed
    var results = archive.semanticSearch(trimmed, limit: 200).map(\.record)
    if let app = state.selectedApp {
      results = results.filter { $0.appName == app }
    }
    state.searchGroups = results.groupedByContext(timeWindowSeconds: searchGroupingWindow)
    applyFrames(results)
    state.isSearching = false
  }

  public func select(_ recordID: ScreenMemoryRecordID) {
    guard state.frames.contains(where: { $0.id == recordID.value.uuidString }) else { return }
    state.selectedRecordID = recordID
  }

  /// Advance the scrubber one frame — Omi's `selectNextScreenshot`.
  public func selectNext() {
    guard let index = selectedIndex(), index < state.frames.count - 1 else { return }
    state.selectedRecordID = resolveRecordID(state.frames[index + 1])
  }

  /// Step the scrubber back one frame — Omi's `selectPreviousScreenshot`.
  public func selectPrevious() {
    guard let index = selectedIndex(), index > 0 else { return }
    state.selectedRecordID = resolveRecordID(state.frames[index - 1])
  }

  /// The rendered frame for a record (decoded from its video chunk on the Mac).
  public func frameImage(for recordID: ScreenMemoryRecordID) async -> ScreenMemoryVideoFrame? {
    try? await archive.videoFrame(for: recordID)
  }

  /// OCR highlight cards for the active query on a record — Omi's search overlay.
  public func matchingBlocks(for recordID: ScreenMemoryRecordID) -> [ScreenMemoryOCRBlock] {
    guard let query = state.activeQuery,
          let record = archive.record(recordID)?.record else { return [] }
    return record.matchingBlocks(for: query)
  }

  /// Delete a record (confirming chunk deletion when it is video-backed) and drop
  /// it from the loaded frames. Renovated from Omi's `deleteScreenshot`.
  @discardableResult
  public func delete(
    _ recordID: ScreenMemoryRecordID,
    confirmChunkDeletion: Bool
  ) async -> ScreenMemoryDeletionResult? {
    let result = try? await archive.delete(recordID: recordID, confirmChunkDeletion: confirmChunkDeletion)
    guard let result, result.requiredChunkConfirmation == false else { return result }
    let deleted = Set(result.recordIDs)
    state.frames.removeAll { deleted.contains($0.id) }
    if let selected = state.selectedRecordID, deleted.contains(selected.value.uuidString) {
      state.selectedRecordID = state.frames.first.flatMap { resolveRecordID($0) }
    }
    state.storage = try? archive.storageReport()
    return result
  }

  // MARK: - Private

  private func dayFrames() -> [ScreenMemoryRecord] {
    var frames = archive.records(on: state.selectedDate, targetCount: dayTargetCount, calendar: calendar)
    if let app = state.selectedApp {
      frames = frames.filter { $0.appName == app }
    }
    return frames
  }

  private func applyFrames(_ frames: [ScreenMemoryRecord]) {
    state.frames = frames
    if let selected = state.selectedRecordID,
       frames.contains(where: { $0.id == selected.value.uuidString }) {
      return
    }
    state.selectedRecordID = frames.first.flatMap { resolveRecordID($0) }
  }

  private func selectedIndex() -> Int? {
    guard let selected = state.selectedRecordID else { return nil }
    return state.frames.firstIndex { $0.id == selected.value.uuidString }
  }

  private func resolveRecordID(_ record: ScreenMemoryRecord) -> ScreenMemoryRecordID? {
    UUID(uuidString: record.id).map(ScreenMemoryRecordID.init)
  }
}
