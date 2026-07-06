import Foundation

// Build-only shims for restored native assets that are compiled outside the app
// target while their old app-wide dependencies are being strangled.
enum UpdaterViewModel {
  static var isUpdateInProgress: Bool { false }
}

final class AnalyticsManager {
  static let shared = AnalyticsManager()

  func screenCaptureResetCompleted(success: Bool) {}

  func notificationRepairTriggered(reason: String, previousStatus: String, currentStatus: String) {
    _ = reason
    _ = previousStatus
    _ = currentStatus
  }
}

func log(_ message: String) {
  _ = message
}

func logError(_ message: String, error: Error? = nil) {
  _ = message
  _ = error
}
