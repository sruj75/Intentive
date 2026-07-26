import Foundation

/// Permissions that macOS exposes only when capture is attempted.
///
/// Screen Recording's `CGPreflightScreenCaptureAccess()` and microphone's
/// authorization status are independently attestable. Direct ScreenCaptureKit
/// access and Core Audio taps are not: macOS presents their consent dialogs on
/// first use. A successful, non-retaining foreground probe is therefore the
/// only honest preparation signal for a background Coaching Window.
public enum DesktopCaptureAuthorization: String, Codable, CaseIterable, Sendable {
  case directScreenCapture = "direct_screen_capture"
  case systemAudio = "system_audio"
}

public struct DesktopCaptureAuthorizationState: Codable, Equatable, Sendable {
  public var directScreenCaptureGranted: Bool
  public var systemAudioGranted: Bool

  public init(
    directScreenCaptureGranted: Bool = false,
    systemAudioGranted: Bool = false
  ) {
    self.directScreenCaptureGranted = directScreenCaptureGranted
    self.systemAudioGranted = systemAudioGranted
  }

  public func isGranted(_ authorization: DesktopCaptureAuthorization) -> Bool {
    switch authorization {
    case .directScreenCapture: directScreenCaptureGranted
    case .systemAudio: systemAudioGranted
    }
  }
}

public protocol DesktopCaptureAuthorizationStore: AnyObject {
  func load() -> DesktopCaptureAuthorizationState
  func save(_ state: DesktopCaptureAuthorizationState) throws
}

public final class UserDefaultsDesktopCaptureAuthorizationStore:
  DesktopCaptureAuthorizationStore
{
  private let defaults: UserDefaults
  private let key: String

  public init(
    defaults: UserDefaults = .standard,
    key: String = "intentive.desktop.capture-authorizations.v1"
  ) {
    self.defaults = defaults
    self.key = key
  }

  public func load() -> DesktopCaptureAuthorizationState {
    guard let data = defaults.data(forKey: key) else {
      return DesktopCaptureAuthorizationState()
    }
    return (try? JSONDecoder().decode(DesktopCaptureAuthorizationState.self, from: data))
      ?? DesktopCaptureAuthorizationState()
  }

  public func save(_ state: DesktopCaptureAuthorizationState) throws {
    defaults.set(try JSONEncoder().encode(state), forKey: key)
  }
}

public final class InMemoryDesktopCaptureAuthorizationStore:
  DesktopCaptureAuthorizationStore
{
  public var state: DesktopCaptureAuthorizationState

  public init(state: DesktopCaptureAuthorizationState = DesktopCaptureAuthorizationState()) {
    self.state = state
  }

  public func load() -> DesktopCaptureAuthorizationState { state }
  public func save(_ state: DesktopCaptureAuthorizationState) throws { self.state = state }
}

/// Owns persisted preparation state for permissions without a preflight API.
///
/// Unknown is deliberately represented as `false`: a background or login
/// launch must fail closed instead of discovering a first-use prompt while
/// sensing is already starting.
public final class DesktopCaptureAuthorizationCoordinator {
  private let store: any DesktopCaptureAuthorizationStore
  public private(set) var state: DesktopCaptureAuthorizationState

  public init(store: any DesktopCaptureAuthorizationStore) {
    self.store = store
    state = store.load()
  }

  public func confirm(_ authorization: DesktopCaptureAuthorization) throws {
    try update(authorization, granted: true)
  }

  public func invalidate(_ authorization: DesktopCaptureAuthorization) throws {
    try update(authorization, granted: false)
  }

  private func update(
    _ authorization: DesktopCaptureAuthorization,
    granted: Bool
  ) throws {
    var next = state
    switch authorization {
    case .directScreenCapture:
      next.directScreenCaptureGranted = granted
    case .systemAudio:
      next.systemAudioGranted = granted
    }
    try store.save(next)
    state = next
  }
}
