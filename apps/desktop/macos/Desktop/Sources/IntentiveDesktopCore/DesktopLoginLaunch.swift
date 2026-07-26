import Foundation

public struct DesktopLoginLauncherRegistrationIdentity: Equatable, Sendable {
  public let label: String
  public let plistName: String

  public init(label: String, plistName: String) {
    self.label = label
    self.plistName = plistName
  }
}

public enum DesktopLoginLauncherRegistrationContract {
  public static let legacyPlistName = "com.heyintentive.desktop.login.plist"

  public static func currentIdentity(
    bundleIdentifier: String
  ) -> DesktopLoginLauncherRegistrationIdentity {
    DesktopLoginLauncherRegistrationIdentity(
      label: "\(bundleIdentifier).login-launcher-v1",
      plistName: "\(bundleIdentifier).login-launcher-v1.plist"
    )
  }

  public static func legacyIdentity(
    bundleIdentifier: String
  ) -> DesktopLoginLauncherRegistrationIdentity {
    DesktopLoginLauncherRegistrationIdentity(
      label: "\(bundleIdentifier).login",
      plistName: legacyPlistName
    )
  }
}

public enum DesktopLaunchPresentationDecision: Equatable, Sendable {
  case menuBarOnly
  case presentWindow
}

/// Makes the initial UI decision from durable local state only.
///
/// Production authentication begins as signed out while Keychain restoration
/// runs. Using that provisional state to decide presentation makes a completed
/// login launch flash onboarding. Durable onboarding progress is the stable
/// signal available before restoration.
public enum DesktopLaunchPresentationPolicy {
  public static func initialDecision(
    launchedInBackground: Bool,
    onboardingProgress: DesktopOnboardingProgress
  ) -> DesktopLaunchPresentationDecision {
    if launchedInBackground, onboardingProgress.completed {
      return .menuBarOnly
    }
    return .presentWindow
  }
}

/// Decides whether the setup surface is visible before Keychain restoration
/// resolves production's provisional signed-out launch composition.
public enum DesktopInitialOnboardingPresentationPolicy {
  public static func shouldPresent(
    setupSurface: DesktopSetupSurface,
    progress: DesktopOnboardingProgress,
    isAuthenticated: Bool,
    screenRecordingPermissionGranted: Bool,
    microphonePermissionGranted: Bool,
    systemAudioPermissionGranted: Bool,
    accessibilityPermissionGranted: Bool
  ) -> Bool {
    guard setupSurface == .onboarding else { return false }

    func requirements(authenticated: Bool) -> DesktopOnboardingRequirements {
      DesktopOnboardingRequirements(
        progress: progress,
        isAuthenticated: authenticated,
        screenRecordingPermissionGranted: screenRecordingPermissionGranted,
        microphonePermissionGranted: microphonePermissionGranted,
        systemAudioPermissionGranted: systemAudioPermissionGranted,
        accessibilityPermissionGranted: accessibilityPermissionGranted
      )
    }

    if requirements(authenticated: isAuthenticated).isComplete {
      return false
    }

    // A completed profile whose only provisional gap is authentication stays
    // hidden until credential restoration resolves. Live permission loss still
    // returns the user to setup immediately.
    if progress.completed, !isAuthenticated {
      return !requirements(authenticated: true).isComplete
    }
    return true
  }
}

/// The bundled LaunchAgent runs a tiny launcher instead of the sensing process.
/// Registration starts that launcher immediately, so it must be a no-op while
/// the foreground app that just completed onboarding is already alive.
public enum DesktopLoginLauncherPolicy {
  public static func shouldLaunchMainApplication(
    currentProcessID: Int32,
    runningApplicationProcessIDs: [Int32]
  ) -> Bool {
    !runningApplicationProcessIDs.contains { $0 != currentProcessID }
  }
}

public enum DesktopLaunchAtLoginRegistrationStatus: Equatable, Sendable {
  case enabled
  case notRegistered
  case requiresApproval
  case notFound
}

public enum DesktopLaunchAtLoginRegistrationAction: Equatable, Sendable {
  case none
  case register
  case requireApproval
}

/// Interprets ServiceManagement's observed state without conflating a missing
/// Background Task Management record with a missing bundled plist.
///
/// On a fresh macOS 26 registration, `SMAppService.status` can report
/// `.notFound` after successfully parsing the bundled LaunchAgent because no
/// BTM record exists yet. Registration is the operation that creates it.
public enum DesktopLaunchAtLoginRegistrationPolicy {
  public static func action(
    for status: DesktopLaunchAtLoginRegistrationStatus
  ) -> DesktopLaunchAtLoginRegistrationAction {
    switch status {
    case .enabled:
      .none
    case .notRegistered, .notFound:
      .register
    case .requiresApproval:
      .requireApproval
    }
  }
}

public protocol DesktopLaunchAtLoginRegistering: AnyObject {
  func register() throws
  func unregister() throws
  /// Reconciles the current versioned ServiceManagement registration when the
  /// persisted setting is enabled.
  ///
  /// Implementations must make this a no-op when the current contract is
  /// already registered and must not unregister the potentially live legacy
  /// LaunchAgent on this path.
  func refreshRegistrationIfNeeded() throws
  /// Removes only Intentive's pre-versioned ServiceManagement registration.
  ///
  /// Callers must invoke this after the active Coaching Window and every
  /// sensing source have shut down because the legacy agent may own—and
  /// terminate—the current main process.
  func retireLegacyRegistration() throws
}

public extension DesktopLaunchAtLoginRegistering {
  func refreshRegistrationIfNeeded() throws {}
}

/// Keeps the OS registration and persisted toggle in one ordered transaction.
public enum DesktopLaunchAtLoginEnrollment {
  public static func reconcileRegistrationIfNeeded(
    settings: DesktopUtilitySettings,
    registrar: any DesktopLaunchAtLoginRegistering
  ) throws {
    guard settings.launchAtLogin else { return }
    try registrar.refreshRegistrationIfNeeded()
  }

  /// Orders the one-time legacy ServiceManagement cleanup after the app's
  /// privacy boundary. A global Background Task Management reset is never
  /// required and would disturb unrelated login items.
  public static func retireLegacyRegistration(
    afterPrivacyShutdown privacyShutdown: () throws -> Void,
    registrar: any DesktopLaunchAtLoginRegistering
  ) throws -> Error? {
    try privacyShutdown()
    do {
      try registrar.retireLegacyRegistration()
      return nil
    } catch {
      // The current versioned item is already authoritative. Failure to remove
      // stale migration state must not trap a fully stopped app; a later
      // graceful termination can retry the targeted cleanup.
      return error
    }
  }

  public static func setEnabled(
    _ enabled: Bool,
    settings: DesktopUtilitySettings,
    registrar: any DesktopLaunchAtLoginRegistering,
    persist: (DesktopUtilitySettings) throws -> Void
  ) throws -> DesktopUtilitySettings {
    if enabled {
      try registrar.register()
    } else {
      try registrar.unregister()
    }

    var updated = settings
    updated.launchAtLogin = enabled
    do {
      try persist(updated)
      return updated
    } catch {
      // Avoid a toggle that lies about the OS registration if persistence
      // fails after ServiceManagement accepted the change.
      if enabled {
        try? registrar.unregister()
      } else {
        try? registrar.register()
      }
      throw error
    }
  }
}

public struct DesktopOnboardingCompletionResult: Equatable, Sendable {
  public var progress: DesktopOnboardingProgress
  public var settings: DesktopUtilitySettings
}

public enum DesktopOnboardingCompletionError: Error, LocalizedError {
  case requirementsIncomplete

  public var errorDescription: String? {
    "Every required setup step and live permission must be complete."
  }
}

/// Commits the final setup step and default login enrollment in privacy-safe
/// order. The OS registration and its toggle become durable before onboarding
/// can be persisted as complete, so a registration failure never hides setup.
public enum DesktopOnboardingCompletion {
  public static func finish(
    progress: DesktopOnboardingProgress,
    requirements: (DesktopOnboardingProgress) -> DesktopOnboardingRequirements,
    settings: DesktopUtilitySettings,
    registrar: any DesktopLaunchAtLoginRegistering,
    persistSettings: (DesktopUtilitySettings) throws -> Void,
    persistProgress: (DesktopOnboardingProgress) throws -> Void
  ) throws -> DesktopOnboardingCompletionResult {
    let candidate = progress
      .completing(.floatingBarDemo)
      .completingOnboarding()
    guard requirements(candidate).isComplete else {
      throw DesktopOnboardingCompletionError.requirementsIncomplete
    }

    let updatedSettings = try DesktopLaunchAtLoginEnrollment.setEnabled(
      true,
      settings: settings,
      registrar: registrar,
      persist: persistSettings
    )
    do {
      try persistProgress(candidate)
    } catch {
      // Completion is one transaction from the user's perspective. If the
      // final progress write fails, restore both the prior toggle and the
      // corresponding OS registration before exposing the failure.
      _ = try? DesktopLaunchAtLoginEnrollment.setEnabled(
        settings.launchAtLogin,
        settings: updatedSettings,
        registrar: registrar,
        persist: persistSettings
      )
      throw error
    }
    return DesktopOnboardingCompletionResult(
      progress: candidate,
      settings: updatedSettings
    )
  }
}
