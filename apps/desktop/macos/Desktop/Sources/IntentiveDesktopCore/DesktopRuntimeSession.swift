import Foundation

public enum DesktopRuntimeSessionState: Equatable, Sendable {
  case signedOut
  case checkingAccount
  case registeringDevice
  case routing
  case connecting
  case connected
  case gate(PreChatGateKind)
  case retry(retryAfterSeconds: Double?)
  case failed(String)

  public var connectionStatus: RuntimeConnectionStatus {
    switch self {
    case .signedOut:
      return .reauthRequired
    case .checkingAccount, .registeringDevice, .routing:
      return .routing
    case .connecting:
      return .connecting
    case .connected:
      return .connected
    case .gate(let gate):
      return .gate(gate.rawValue)
    case .retry(let seconds):
      if let seconds {
        return .failed("Runtime unavailable. Retry after \(Int(seconds)) second(s).")
      }
      return .failed("Runtime unavailable. Retry shortly.")
    case .failed(let message):
      return .failed(message)
    }
  }
}

/// Fail-closed bridge from verified account identity to the durable local
/// profile that owns Coaching Window lifecycle and perception ingress.
public enum DesktopCoachingProfileReadiness {
  public static func isReady(
    verifiedUserID: String?,
    mountedDurableProfileUserID: String?
  ) -> Bool {
    guard
      let verifiedUserID = stableUserID(verifiedUserID),
      let mountedUserID = stableUserID(mountedDurableProfileUserID)
    else {
      return false
    }
    return verifiedUserID == mountedUserID
  }

  fileprivate static func stableUserID(_ rawUserID: String?) -> String? {
    let userID = rawUserID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard
      !userID.isEmpty,
      DesktopLocalProfile.sanitizedUserID(userID) != DesktopLocalProfile.anonymousUserID
    else {
      return nil
    }
    return userID
  }
}

@MainActor
public final class DesktopRuntimeSessionCoordinator {
  public private(set) var state: DesktopRuntimeSessionState = .signedOut
  public private(set) var accountState: AccountState?
  public private(set) var registeredDeviceId: String?
  public private(set) var hasAuthenticatedCredential: Bool
  /// A stable user identity verified by the Control Plane for this process.
  ///
  /// A restored credential alone does not establish which durable local
  /// profile owns Coaching Window evidence.
  public var verifiedUserID: String? {
    DesktopCoachingProfileReadiness.stableUserID(accountState?.userId)
  }

  public let runtime: RuntimeAdapter

  private let auth: AuthAdapter
  private let controlPlane: any DesktopControlPlaneRoutingClient
  private let device: ClientDeviceService
  private let capturePermissionGranted: () -> Bool
  private let timeZone: () -> TimeZone

  public init(
    auth: AuthAdapter,
    controlPlane: any DesktopControlPlaneRoutingClient,
    device: ClientDeviceService,
    runtime: RuntimeAdapter,
    initialAccountState: AccountState? = nil,
    capturePermissionGranted: @escaping () -> Bool,
    timeZone: @escaping () -> TimeZone = { .current }
  ) {
    self.auth = auth
    self.controlPlane = controlPlane
    self.device = device
    self.runtime = runtime
    accountState = initialAccountState
    hasAuthenticatedCredential = initialAccountState != nil
    self.capturePermissionGranted = capturePermissionGranted
    self.timeZone = timeZone
  }

  @discardableResult
  public func restoreAndConnect() async -> DesktopRuntimeSessionState {
    do {
      guard let jwt = try await auth.restore() else {
        markSignedOut()
        return state
      }
      hasAuthenticatedCredential = true
      return await connect(jwt: jwt)
    } catch {
      state = .failed(error.localizedDescription)
      return state
    }
  }

  @discardableResult
  public func signInAndConnect() async -> DesktopRuntimeSessionState {
    do {
      let jwt = try await auth.signIn()
      hasAuthenticatedCredential = true
      return await connect(jwt: jwt)
    } catch DesktopAuthError.missingToken {
      markSignedOut()
      return state
    } catch {
      state = .failed(error.localizedDescription)
      return state
    }
  }

  public func disconnect() {
    runtime.disconnect()
    markSignedOut()
  }

  public func cancelSignIn() {
    auth.cancelSignIn()
    markSignedOut()
  }

  @discardableResult
  public func signOut() async -> DesktopRuntimeSessionState {
    runtime.disconnect()
    do {
      try await auth.signOut()
      markSignedOut()
    } catch {
      state = .failed("Sign out failed: \(error.localizedDescription)")
    }
    return state
  }

  public func markRuntimeConnected() {
    state = .connected
  }

  public func markRuntimeClosed(reason: String) {
    runtime.markConnectionLost(reason: reason)
    state = .failed(reason)
  }

  @discardableResult
  private func connect(jwt: String) async -> DesktopRuntimeSessionState {
    do {
      let permissionGranted = capturePermissionGranted()
      state = .checkingAccount
      let account = try await controlPlane.getMe(jwt: jwt, capturePermissionGranted: permissionGranted)
      accountState = account

      if let gate = account.nextGate {
        state = .gate(gate)
        return state
      }

      state = .registeringDevice
      registeredDeviceId = try await controlPlane.registerDevice(
        jwt: jwt,
        deviceFingerprint: device.deviceId
      )

      state = .routing
      switch try await controlPlane.getRuntimeRouting(jwt: jwt, capturePermissionGranted: permissionGranted) {
      case .ok(let route):
        try runtime.connect(routing: route.routingInfo, timeZone: timeZone())
        state = .connecting
      case .retry(let retryAfterSeconds):
        state = .retry(retryAfterSeconds: retryAfterSeconds)
      case .reauth:
        markSignedOut()
      case .gate:
        state = account.nextGate.map(DesktopRuntimeSessionState.gate) ?? .gate(.capturePermissionSetup)
      }
      return state
    } catch {
      state = .failed(error.localizedDescription)
      return state
    }
  }

  private func markSignedOut() {
    accountState = nil
    registeredDeviceId = nil
    hasAuthenticatedCredential = false
    state = .signedOut
  }
}
