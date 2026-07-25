import AppKit
import AVFoundation

enum DesktopMicrophonePermissionStatus: Equatable {
  case notDetermined, granted, denied, restricted, unknown
  var isGranted: Bool { self == .granted }
}

protocol DesktopMicrophonePermissionGateway {
  func authorizationStatus() -> DesktopMicrophonePermissionStatus
  func requestAccess() async -> DesktopMicrophonePermissionStatus
  func openMicrophoneSettings()
}

struct NativeMicrophonePermissionGateway: DesktopMicrophonePermissionGateway {
  func authorizationStatus() -> DesktopMicrophonePermissionStatus {
    switch AVCaptureDevice.authorizationStatus(for: .audio) {
    case .notDetermined: .notDetermined
    case .authorized: .granted
    case .denied: .denied
    case .restricted: .restricted
    @unknown default: .unknown
    }
  }

  func requestAccess() async -> DesktopMicrophonePermissionStatus {
    await withCheckedContinuation { continuation in
      AVCaptureDevice.requestAccess(for: .audio) { granted in
        continuation.resume(returning: granted ? .granted : authorizationStatus())
      }
    }
  }

  func openMicrophoneSettings() {
    guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone") else { return }
    NSWorkspace.shared.open(url)
  }
}
