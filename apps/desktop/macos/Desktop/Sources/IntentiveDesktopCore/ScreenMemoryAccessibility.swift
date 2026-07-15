import Foundation

/// Stable accessibility identifiers for the Screen Memory timeline surface.
///
/// Omi's Rewind view carried no accessibility identifiers, so this namespace is
/// an Intentive introduction. It exists so a single UI tracer can drive both the
/// SwiftUI timeline (which labels its controls with these constants) and the
/// headless `ScreenMemoryTimelineSmoke` harness through the same logical tree.
/// Names follow the codebase's existing snake_case convention (the sole prior
/// example being `notch_floating_bar_settings`).
public enum ScreenMemoryAccessibilityID {
  /// Root container for the Screen Memory surface.
  public static let root = "screen_memory"

  public static let searchField = "screen_memory_search_field"
  public static let previousDay = "screen_memory_previous_day"
  public static let nextDay = "screen_memory_next_day"
  public static let filmstrip = "screen_memory_filmstrip"
  public static let currentFrame = "screen_memory_current_frame"
  public static let scrubForward = "screen_memory_scrub_forward"
  public static let scrubBackward = "screen_memory_scrub_backward"
  public static let deleteFrame = "screen_memory_delete_frame"
  public static let storageLabel = "screen_memory_storage_label"
  public static let emptyState = "screen_memory_empty_state"

  /// Filmstrip cell for a specific frame.
  public static func frame(_ recordID: ScreenMemoryRecordID) -> String {
    "screen_memory_frame_\(recordID.value.uuidString)"
  }

  /// App filter chip for a specific app.
  public static func appFilter(_ appName: String) -> String {
    "screen_memory_app_filter_\(appName)"
  }

  /// OCR highlight card at `index` over the current frame.
  public static func ocrHighlight(_ index: Int) -> String {
    "screen_memory_ocr_highlight_\(index)"
  }
}
