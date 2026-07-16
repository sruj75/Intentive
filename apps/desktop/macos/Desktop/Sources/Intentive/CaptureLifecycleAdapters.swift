import AppKit
import Foundation
import IOKit.ps
import IntentiveDesktopCore

// MARK: - AppKit-powered system-event observer
// Renovated from Omi's `ProactiveAssistantsPlugin.setupSystemEventObservers`
// (sleep/wake/lock/unlock) plus `FloatingControlBarWindow`'s
// didChangeScreenParameters observer. The OS notifications are exact; the
// Intentive seam (`CaptureSystemEventObserver`) keeps `IntentiveDesktopCore`
// free of AppKit so the controller is unit-testable.

final class AppKitCaptureSystemEventObserver: CaptureSystemEventObserver {
  private var distributedObservers: [NSObjectProtocol] = []
  private var workspaceObservers: [NSObjectProtocol] = []
  private var appObservers: [NSObjectProtocol] = []
  private var handler: ((CaptureSystemEventKind) -> Void)?

  init() {}

  deinit {
    for token in distributedObservers {
      DistributedNotificationCenter.default().removeObserver(token)
    }
    for token in workspaceObservers {
      NSWorkspace.shared.notificationCenter.removeObserver(token)
    }
    for token in appObservers {
      NotificationCenter.default.removeObserver(token)
    }
  }

  func observe(_ handler: @escaping (CaptureSystemEventKind) -> Void) {
    self.handler = handler

    let workspace = NSWorkspace.shared.notificationCenter
    workspaceObservers.append(
      workspace.addObserver(
        forName: NSWorkspace.willSleepNotification,
        object: nil,
        queue: .main
      ) { _ in handler(.systemSleep) }
    )
    // Omi's `AppState.systemDidWakeNotification` is a republished variant of
    // `NSWorkspace.didWakeNotification`; the raw notification is sufficient.
    workspaceObservers.append(
      workspace.addObserver(
        forName: NSWorkspace.didWakeNotification,
        object: nil,
        queue: .main
      ) { _ in handler(.systemWake) }
    )

    let distributed = DistributedNotificationCenter.default()
    distributedObservers.append(
      distributed.addObserver(
        forName: NSNotification.Name("com.apple.screenIsLocked"),
        object: nil,
        queue: .main
      ) { _ in handler(.screenLock) }
    )
    distributedObservers.append(
      distributed.addObserver(
        forName: NSNotification.Name("com.apple.screenIsUnlocked"),
        object: nil,
        queue: .main
      ) { _ in handler(.screenUnlock) }
    )

    appObservers.append(
      NotificationCenter.default.addObserver(
        forName: NSApplication.didChangeScreenParametersNotification,
        object: nil,
        queue: .main
      ) { _ in handler(.displayChange) }
    )
  }
}

// MARK: - Competing screen-recorder detector
// Renovated from Omi's `ProactiveAssistantsPlugin.isScreenshotAppFrontmost`
// (which consults `NSWorkspace.shared.frontmostApplication.bundleIdentifier`).

final class AppKitCompetingScreenRecorderDetector: CompetingScreenRecorderDetector {
  private let bundleIDs: Set<String>

  init(bundleIDs: Set<String> = DefaultCompetingScreenRecorderBundleIDs.shared) {
    self.bundleIDs = bundleIDs
  }

  func isCompetingRecorderFrontmost() -> Bool {
    guard let bundleID = NSWorkspace.shared.frontmostApplication?.bundleIdentifier else {
      return false
    }
    return bundleIDs.contains(bundleID)
  }
}

// MARK: - Power source adapter
// Renovated from Omi's `PowerMonitor` (`Rewind/Services/PowerMonitor.swift`,
// which is preserved but currently excluded from compilation as legacy).
// Reimplements the IOKit `kIOPSPowerSourceStateKey` probe behind the
// Intentive `DesktopPowerSource` seam, pollable per-tick by the lifecycle
// controller's `captureInterval(at:)`. The run-loop change-notification hook
// (`IOPSCreateLimitedPowerNotification`) is reserved for a future slice; the
// cadence is read on every loop tick so polling is sufficient for v1.

final class PowerMonitorDesktopPowerSource: DesktopPowerSource {
  /// Callback stored for compatibility; not wired to a run-loop source in v1.
  var onPowerSourceChanged: ((Bool) -> Void)?

  init() {}

  var isOnBattery: Bool { Self.checkBatteryState() }

  nonisolated static func checkBatteryState() -> Bool {
    guard let snapshot = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
          let sources = IOPSCopyPowerSourcesList(snapshot)?.takeRetainedValue() as? [Any],
          !sources.isEmpty else {
      // No power sources = desktop Mac (always on AC), same as Omi's heuristic.
      return false
    }
    for source in sources {
      if let info = IOPSGetPowerSourceDescription(snapshot, source as CFTypeRef)?.takeUnretainedValue() as? [String: Any],
         let powerSource = info[kIOPSPowerSourceStateKey] as? String {
        return powerSource == kIOPSBatteryPowerValue
      }
    }
    return false
  }
}