import AppKit
import Foundation
import IntentiveDesktopCore
import IntentiveDesktopNativeAssets

final class UnavailablePassiveAudioStreamingSource: PassiveAudioStreamingSource {
  var isRunning: Bool { false }
  func start(onPCM16k: @escaping @Sendable (Data) -> Void) async throws {
    throw CocoaError(.featureUnsupported)
  }
  func stop() {}
  func clearPendingBuffers() {}
}

/// Omi-derived window observation feeding the Core hysteresis detector. Native
/// call apps and browser call titles are probed off-main; the coordinator sees
/// only stable meeting edges.
@MainActor
final class AppKitMeetingObserver {
  private let detector: MeetingDetector
  private var timer: Timer?
  private var observers: [NSObjectProtocol] = []
  private(set) var isMeetingActive = false

  init(onChange: @escaping (Bool) -> Void) {
    detector = MeetingDetector(pollInterval: 4, offGracePeriod: 8) { active in
      onChange(active)
    }
  }

  func start() {
    guard timer == nil else { return }
    let center = NSWorkspace.shared.notificationCenter
    for name in [
      NSWorkspace.didActivateApplicationNotification,
      NSWorkspace.didLaunchApplicationNotification,
      NSWorkspace.didTerminateApplicationNotification,
    ] {
      observers.append(center.addObserver(forName: name, object: nil, queue: .main) {
        [weak self] _ in self?.probe()
      })
    }
    timer = Timer.scheduledTimer(withTimeInterval: 4, repeats: true) { [weak self] _ in
      self?.probe()
    }
    probe()
  }

  func stop() {
    timer?.invalidate(); timer = nil
    for observer in observers { NSWorkspace.shared.notificationCenter.removeObserver(observer) }
    observers.removeAll()
  }

  private func probe() {
    Task.detached(priority: .utility) { [weak self] in
      let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
        as? [[String: Any]] ?? []
      let detected = windows.contains {
        ConferencingApps.isCallWindow(
          ownerName: $0[kCGWindowOwnerName as String] as? String,
          title: $0[kCGWindowName as String] as? String
        )
      }
      await MainActor.run {
        self?.detector.applyDetected(detected)
        self?.isMeetingActive = self?.detector.isMeetingActive ?? false
      }
    }
  }
}
