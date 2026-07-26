import Foundation

public struct DesktopCoachingEligibility: Equatable, Sendable {
  public var isAuthenticated: Bool
  public var onboardingComplete: Bool
  public var screenRecordingGranted: Bool
  public var microphoneGranted: Bool
  public var accessibilityGranted: Bool
  public var systemAudioGranted: Bool

  public init(
    isAuthenticated: Bool,
    onboardingComplete: Bool,
    screenRecordingGranted: Bool,
    microphoneGranted: Bool,
    accessibilityGranted: Bool,
    systemAudioGranted: Bool
  ) {
    self.isAuthenticated = isAuthenticated
    self.onboardingComplete = onboardingComplete
    self.screenRecordingGranted = screenRecordingGranted
    self.microphoneGranted = microphoneGranted
    self.accessibilityGranted = accessibilityGranted
    self.systemAudioGranted = systemAudioGranted
  }

  public var isEligible: Bool {
    isAuthenticated
      && onboardingComplete
      && screenRecordingGranted
      && microphoneGranted
      && accessibilityGranted
      && systemAudioGranted
  }
}

public enum DesktopCoachingWindowInactiveReason: Equatable, Sendable {
  case awaitingLaunch
  case ineligible
  case sleeping
  case signedOut
  case quit
}

public enum DesktopCoachingWindowState: Equatable, Sendable {
  case inactive(DesktopCoachingWindowInactiveReason)
  case active(windowId: String)
  case locked(windowId: String)
  case paused

  public var windowId: String? {
    switch self {
    case .active(let windowId), .locked(let windowId):
      return windowId
    case .inactive, .paused:
      return nil
    }
  }

  /// The Coaching Window that may currently reveal proactive output.
  ///
  /// A locked window retains its durable identity so unlock can reattest the
  /// same window, but it is not active delivery presence.
  public var activeWindowId: String? {
    guard case .active(let windowId) = self else { return nil }
    return windowId
  }
}

public enum DesktopCoachingWindowInput: Equatable, Sendable {
  case launch(CoachingWindowStartReason)
  case screenLocked
  case screenUnlocked
  case systemSleep
  case systemWake
  case pauseRequested
  case resumeRequested
  case eligibilityChanged(
    DesktopCoachingEligibility,
    eligibleStartReason: CoachingWindowStartReason
  )
  case runtimeConnectionChanged(Bool)
  case signOut
  case quit
}

@MainActor
public protocol DesktopCoachingWindowEffects: AnyObject {
  func enqueueWindowStarted(_ event: CoachingWindowStarted) throws
  func enqueueWindowEnded(_ event: CoachingWindowEnded) throws
  func sendWindowPresence(_ event: CoachingWindowPresence) throws
  func startPerception(windowId: String)
  func stopPerception()
}

public struct CoachingWindowIdentity: Codable, Equatable, Sendable {
  public var windowId: String
  public var startedAt: String

  public init(windowId: String, startedAt: String) {
    self.windowId = windowId
    self.startedAt = startedAt
  }

  enum CodingKeys: String, CodingKey {
    case windowId = "window_id"
    case startedAt = "started_at"
  }
}

public struct CoachingWindowLockFile: Equatable, Sendable {
  public let url: URL

  public init(url: URL) {
    self.url = url
  }

  public func read(fileManager: FileManager = .default) -> CoachingWindowIdentity? {
    guard
      fileManager.fileExists(atPath: url.path),
      let data = try? Data(contentsOf: url)
    else {
      return nil
    }
    return try? JSONDecoder().decode(CoachingWindowIdentity.self, from: data)
  }

  public func write(
    _ identity: CoachingWindowIdentity,
    fileManager: FileManager = .default
  ) throws {
    try fileManager.createDirectory(
      at: url.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try JSONEncoder().encode(identity).write(to: url, options: .atomic)
  }

  public func markClean(fileManager: FileManager = .default) throws {
    guard fileManager.fileExists(atPath: url.path) else { return }
    try fileManager.removeItem(at: url)
  }
}

@MainActor
public final class DesktopCoachingWindowCoordinator {
  public private(set) var state: DesktopCoachingWindowState = .inactive(.awaitingLaunch) {
    didSet {
      if oldValue != state {
        onStateChange?(state)
      }
    }
  }
  public var onStateChange: ((DesktopCoachingWindowState) -> Void)?

  private var eligibility: DesktopCoachingEligibility
  private let effects: DesktopCoachingWindowEffects
  private let eligibilityAttestation: (() -> DesktopCoachingEligibility)?
  private let lockFile: CoachingWindowLockFile?
  private var runtimeConnected: Bool
  private var didHandleLaunch = false
  private var pendingCrashRecovery: CoachingWindowIdentity?
  private var pendingCrashEndWasEnqueued = false
  private let now: () -> Date
  private let makeUUID: () -> String

  public init(
    initialEligibility: DesktopCoachingEligibility,
    effects: DesktopCoachingWindowEffects,
    eligibilityAttestation: (() -> DesktopCoachingEligibility)? = nil,
    lockFile: CoachingWindowLockFile? = nil,
    runtimeConnected: Bool = false,
    now: @escaping () -> Date = Date.init,
    makeUUID: @escaping () -> String = { UUID().uuidString }
  ) {
    self.eligibility = initialEligibility
    self.effects = effects
    self.eligibilityAttestation = eligibilityAttestation
    self.lockFile = lockFile
    self.runtimeConnected = runtimeConnected
    self.now = now
    self.makeUUID = makeUUID
  }

  /// Re-read the process's live permission state and route any change through
  /// the same lifecycle boundary as onboarding and System Settings updates.
  ///
  /// Production calls this from the active capture cadence so a background
  /// window does not depend on Intentive becoming frontmost before a TCC
  /// revocation stops every source. Returning the current eligibility lets the
  /// caller skip the capture tick that observed the loss.
  @discardableResult
  public func reattestEligibility(
    eligibleStartReason: CoachingWindowStartReason = .permissionRestored
  ) throws -> Bool {
    guard let eligibilityAttestation else { return eligibility.isEligible }
    let updated = eligibilityAttestation()
    try handle(
      .eligibilityChanged(
        updated,
        eligibleStartReason: eligibleStartReason
      )
    )
    return updated.isEligible
  }

  public func handle(_ input: DesktopCoachingWindowInput) throws {
    switch input {
    case .launch(let reason):
      guard !didHandleLaunch else { return }
      pendingCrashRecovery = lockFile?.read()
      didHandleLaunch = true
      state = .inactive(.ineligible)
      try startEligibleWindow(requestedReason: reason)
    case .screenLocked:
      guard case .active(let windowId) = state else { return }
      effects.stopPerception()
      state = .locked(windowId: windowId)
      if runtimeConnected {
        try sendPresence(windowId: windowId, state: .locked)
      }
    case .screenUnlocked:
      guard case .locked(let windowId) = state, eligibility.isEligible else { return }
      state = .active(windowId: windowId)
      effects.startPerception(windowId: windowId)
      if runtimeConnected {
        try sendPresence(windowId: windowId, state: .active)
      }
    case .systemSleep:
      guard didHandleLaunch, state.windowId != nil else { return }
      try endCurrentWindow(reason: .systemSleep, nextState: .inactive(.sleeping))
    case .systemWake:
      guard didHandleLaunch, state == .inactive(.sleeping) else { return }
      try startWindow(reason: .systemWake)
    case .pauseRequested:
      guard state.windowId != nil else { return }
      try endCurrentWindow(reason: .pause, nextState: .paused)
    case .resumeRequested:
      guard state == .paused else { return }
      try startWindow(reason: .userResume)
    case .eligibilityChanged(let updated, let eligibleStartReason):
      eligibility = updated
      if state.windowId != nil, !updated.isEligible {
        try endCurrentWindow(
          reason: .permissionLost,
          nextState: .inactive(.ineligible)
        )
        return
      }
      guard updated.isEligible else {
        switch state {
        case .inactive(.awaitingLaunch), .inactive(.ineligible):
          state = .inactive(.ineligible)
        case .inactive(.sleeping), .inactive(.signedOut), .inactive(.quit),
          .active, .locked, .paused:
          break
        }
        return
      }
      switch state {
      case .inactive(.ineligible), .inactive(.signedOut):
        if didHandleLaunch {
          try startEligibleWindow(requestedReason: eligibleStartReason)
        }
      case .inactive(.awaitingLaunch), .inactive(.sleeping), .inactive(.quit),
        .active, .locked, .paused:
        break
      }
    case .runtimeConnectionChanged(let connected):
      let didReconnect = connected && !runtimeConnected
      runtimeConnected = connected
      guard didReconnect else { return }
      switch state {
      case .active(let windowId):
        try sendPresence(windowId: windowId, state: .active)
      case .locked(let windowId):
        try sendPresence(windowId: windowId, state: .locked)
      case .inactive, .paused:
        break
      }
    case .signOut:
      eligibility.isAuthenticated = false
      try endCurrentWindow(
        reason: .signOut,
        nextState: .inactive(.signedOut)
      )
    case .quit:
      try endCurrentWindow(
        reason: .quit,
        nextState: .inactive(.quit)
      )
    }
  }

  private func startEligibleWindow(requestedReason: CoachingWindowStartReason) throws {
    guard eligibility.isEligible else {
      state = .inactive(.ineligible)
      return
    }

    var reason = requestedReason
    if let prior = pendingCrashRecovery {
      effects.stopPerception()
      if !pendingCrashEndWasEnqueued {
        try effects.enqueueWindowEnded(
          CoachingWindowEnded(
            windowId: prior.windowId,
            endedAt: now().protocolTimestamp,
            reason: .crash
          )
        )
        pendingCrashEndWasEnqueued = true
      }
      try lockFile?.markClean()
      reason = .crashRecovery
    }

    try startWindow(reason: reason)
    if reason == .crashRecovery, state.windowId != nil {
      pendingCrashRecovery = nil
      pendingCrashEndWasEnqueued = false
    }
  }

  private func startWindow(reason: CoachingWindowStartReason) throws {
    guard eligibility.isEligible else {
      state = .inactive(.ineligible)
      return
    }
    guard state.windowId == nil else { return }

    // PostgreSQL canonicalizes UUID text to lowercase. Keep the wire identity
    // canonical from its source so live connection state and durable rows use
    // byte-identical Coaching Window identifiers.
    let windowId = makeUUID().lowercased()
    let startedAt = now().protocolTimestamp
    try effects.enqueueWindowStarted(
      CoachingWindowStarted(windowId: windowId, startedAt: startedAt, reason: reason)
    )
    try lockFile?.write(
      CoachingWindowIdentity(windowId: windowId, startedAt: startedAt)
    )
    state = .active(windowId: windowId)
    effects.startPerception(windowId: windowId)
    if runtimeConnected {
      try sendPresence(windowId: windowId, state: .active)
    }
  }

  private func sendPresence(
    windowId: String,
    state: CoachingWindowPresenceState
  ) throws {
    try effects.sendWindowPresence(
      CoachingWindowPresence(
        windowId: windowId,
        state: state,
        changedAt: now().protocolTimestamp
      )
    )
  }

  private func endCurrentWindow(
    reason: CoachingWindowEndReason,
    nextState: DesktopCoachingWindowState
  ) throws {
    guard let windowId = state.windowId else {
      state = nextState
      effects.stopPerception()
      return
    }
    effects.stopPerception()
    try effects.enqueueWindowEnded(
      CoachingWindowEnded(
        windowId: windowId,
        endedAt: now().protocolTimestamp,
        reason: reason
      )
    )
    try lockFile?.markClean()
    state = nextState
  }
}
