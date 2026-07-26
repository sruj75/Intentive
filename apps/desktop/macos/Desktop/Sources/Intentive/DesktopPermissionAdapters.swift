import AppKit
import AVFoundation
import IntentiveDesktopCore
import IntentiveDesktopNativeAdapters
import IntentiveDesktopNativeAssets
import ServiceManagement

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
    NSWorkspace.shared.open(DesktopSystemSettingsDestination.microphone.url)
  }
}

protocol DesktopDirectScreenCapturePermissionGateway {
  func requestAccess() async -> Bool
}

struct NativeDirectScreenCapturePermissionGateway:
  DesktopDirectScreenCapturePermissionGateway
{
  func requestAccess() async -> Bool {
    do {
      // ScreenCaptureKit has no preflight for its private-picker bypass
      // consent. Perform one foreground, non-retaining capture and discard it.
      _ = try await NativeScreenCaptureSource().captureFrame()
      return true
    } catch {
      return false
    }
  }
}

protocol DesktopSystemAudioPermissionGateway {
  func requestAccess() async -> Bool
  func openSystemAudioSettings()
}

struct NativeSystemAudioPermissionGateway: DesktopSystemAudioPermissionGateway {
  func requestAccess() async -> Bool {
    guard #available(macOS 14.4, *) else { return false }
    let probe = SystemAudioCaptureService()
    let (audioArrivals, audioArrival) = AsyncStream<Void>.makeStream()
    do {
      // Core Audio taps expose no authorization preflight. Start one
      // disposable tap during foreground setup and require one real PCM
      // callback. A successful `AudioDeviceStart` alone is not enough evidence
      // that an asynchronous macOS consent sheet has resolved.
      try await probe.start { pcm in
        guard !pcm.isEmpty else { return }
        audioArrival.yield()
        audioArrival.finish()
      }
      guard !Task.isCancelled else {
        audioArrival.finish()
        probe.stop()
        await probe.waitForCaptureStop()
        probe.clearPendingBuffers()
        return false
      }
      let observedAudio = await withTaskGroup(of: Bool.self) { group in
        group.addTask {
          for await _ in audioArrivals { return true }
          return false
        }
        group.addTask {
          try? await Task.sleep(nanoseconds: 60_000_000_000)
          return false
        }
        let result = await group.next() ?? false
        group.cancelAll()
        return result
      }
      audioArrival.finish()
      probe.stop()
      await probe.waitForCaptureStop()
      probe.clearPendingBuffers()
      return observedAudio && !Task.isCancelled
    } catch {
      audioArrival.finish()
      probe.stop()
      await probe.waitForCaptureStop()
      probe.clearPendingBuffers()
      return false
    }
  }

  func openSystemAudioSettings() {
    NSWorkspace.shared.open(DesktopSystemSettingsDestination.systemAudioRecording.url)
  }
}

final class NativeDesktopLaunchAtLoginRegistrar: DesktopLaunchAtLoginRegistering {
  private let service: SMAppService
  private let legacyService: SMAppService

  init(
    service: SMAppService? = nil,
    legacyService: SMAppService? = nil
  ) {
    let bundleIdentifier =
      Bundle.main.bundleIdentifier ?? "com.heyintentive.desktop"
    let currentIdentity =
      DesktopLoginLauncherRegistrationContract.currentIdentity(
        bundleIdentifier: bundleIdentifier
      )
    self.service = service ?? .agent(plistName: currentIdentity.plistName)
    self.legacyService = legacyService ?? .agent(
      plistName: DesktopLoginLauncherRegistrationContract.legacyPlistName
    )
  }

  func register() throws {
    let observedStatus: DesktopLaunchAtLoginRegistrationStatus =
      switch service.status {
      case .enabled:
        .enabled
      case .notRegistered:
        .notRegistered
      case .requiresApproval:
        .requiresApproval
      case .notFound:
        .notFound
      @unknown default:
        throw DesktopLaunchAtLoginRegistrationError.unknownStatus
      }

    switch DesktopLaunchAtLoginRegistrationPolicy.action(for: observedStatus) {
    case .none:
      return
    case .register:
      try service.register()
    case .requireApproval:
      throw DesktopLaunchAtLoginRegistrationError.requiresApproval
    }
  }

  func unregister() throws {
    switch service.status {
    case .notRegistered, .notFound:
      return
    case .enabled, .requiresApproval:
      try service.unregister()
    @unknown default:
      throw DesktopLaunchAtLoginRegistrationError.unknownStatus
    }
  }

  func refreshRegistrationIfNeeded() throws {
    // The current plist filename and label are versioned. Status therefore
    // describes the new registration itself instead of a cached old-label
    // snapshot, so reconciliation never unregisters a live legacy job.
    try register()
  }

  func retireLegacyRegistration() throws {
    switch legacyService.status {
    case .notRegistered, .notFound:
      return
    case .enabled, .requiresApproval:
      try legacyService.unregister()
    @unknown default:
      throw DesktopLaunchAtLoginRegistrationError.unknownStatus
    }
  }
}

private enum DesktopLaunchAtLoginRegistrationError: Error, LocalizedError {
  case requiresApproval
  case serviceNotFound
  case unknownStatus

  var errorDescription: String? {
    switch self {
    case .requiresApproval:
      "Launch at Login needs approval in System Settings > General > Login Items."
    case .serviceNotFound:
      "The bundled Intentive login launcher could not be found."
    case .unknownStatus:
      "macOS returned an unknown Launch at Login status."
    }
  }
}
