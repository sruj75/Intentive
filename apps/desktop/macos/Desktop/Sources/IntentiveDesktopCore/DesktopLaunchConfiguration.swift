import Foundation

public enum DesktopPermissionState: String, Equatable, Sendable {
  case notDetermined
  case granted
  case denied
  case restricted
}

public struct DesktopPermissionSnapshot: Equatable, Sendable {
  public let screenRecording: DesktopPermissionState
  public let microphone: DesktopPermissionState

  public init(
    screenRecording: DesktopPermissionState,
    microphone: DesktopPermissionState
  ) {
    self.screenRecording = screenRecording
    self.microphone = microphone
  }
}

public enum DesktopLaunchAuthenticationState: Equatable, Sendable {
  case signedOut
  case signedIn(userID: String)
}

public enum DesktopLaunchRuntimeState: String, Equatable, Sendable {
  case disconnected
  case connected
}

public struct DesktopSystemBoundaryPolicy: Equatable, Sendable {
  public let captureEnabled: Bool
  public let networkEnabled: Bool
  public let updatesEnabled: Bool
  public let telemetryEnabled: Bool

  public init(
    captureEnabled: Bool,
    networkEnabled: Bool,
    updatesEnabled: Bool,
    telemetryEnabled: Bool
  ) {
    self.captureEnabled = captureEnabled
    self.networkEnabled = networkEnabled
    self.updatesEnabled = updatesEnabled
    self.telemetryEnabled = telemetryEnabled
  }

  public static let production = DesktopSystemBoundaryPolicy(
    captureEnabled: true,
    networkEnabled: true,
    updatesEnabled: true,
    telemetryEnabled: true
  )

  public static let deterministicTest = DesktopSystemBoundaryPolicy(
    captureEnabled: false,
    networkEnabled: false,
    updatesEnabled: false,
    telemetryEnabled: false
  )
}

public enum DesktopMainWindowSection: String, CaseIterable, Equatable, Sendable {
  case home
  case screenMemory
  case settings
}

public enum DesktopConversationSurface: String, Equatable, Sendable {
  case floatingBar
}

public enum DesktopConversationInput: String, Equatable, Sendable {
  case textOnly
}

public enum DesktopSetupSurface: String, Equatable, Sendable {
  case utilityMainWindow
  case onboarding
}

public enum DesktopCapability: String, Hashable, Sendable {
  case screenMemory
  case floatingBarConversation
  case runtimeConversation
  case proactiveOverlay
  case voiceInput
  case dictation
  case pushToTalk
  case textToSpeech
  case providerCredentials
  case localAgentBrain
  case mainWindowChat
  case subagentInterface
  case toolCallInterface
  case productMacOSNotification
}

/// Product-level contract for the Desktop surfaces assembled at launch.
///
/// This deliberately describes presentation ownership and capabilities rather
/// than mirroring the SwiftUI view hierarchy. The executable consumes it at its
/// composition root; tests can verify the shipped product boundary without
/// reaching into private view implementation.
public struct DesktopSurfaceContract: Equatable, Sendable {
  public let mainWindowSections: [DesktopMainWindowSection]
  public let conversationSurface: DesktopConversationSurface
  public let conversationInput: DesktopConversationInput
  public let setupSurface: DesktopSetupSurface
  public let capabilities: Set<DesktopCapability>

  public init(
    mainWindowSections: [DesktopMainWindowSection],
    conversationSurface: DesktopConversationSurface,
    conversationInput: DesktopConversationInput,
    setupSurface: DesktopSetupSurface,
    capabilities: Set<DesktopCapability>
  ) {
    self.mainWindowSections = mainWindowSections
    self.conversationSurface = conversationSurface
    self.conversationInput = conversationInput
    self.setupSurface = setupSurface
    self.capabilities = capabilities
  }

  public static let desktopV1 = DesktopSurfaceContract(
    mainWindowSections: [.home, .screenMemory, .settings],
    conversationSurface: .floatingBar,
    conversationInput: .textOnly,
    setupSurface: .onboarding,
    capabilities: [
      .screenMemory,
      .floatingBarConversation,
      .runtimeConversation,
      .proactiveOverlay,
    ]
  )
}

/// Immutable inputs to the executable composition boundary.
///
/// Production construction is explicit. Deterministic assembled scenarios are
/// available to test and smoke harnesses only when injected by the composition
/// root; normal launch never chooses them from ambient environment variables.
public struct DesktopLaunchConfiguration: Equatable, Sendable {
  public let profileRoot: URL
  public let permissions: DesktopPermissionSnapshot
  public let authentication: DesktopLaunchAuthenticationState
  public let runtime: DesktopLaunchRuntimeState
  public let systemBoundaries: DesktopSystemBoundaryPolicy
  public let surface: DesktopSurfaceContract

  private init(
    profileRoot: URL,
    permissions: DesktopPermissionSnapshot,
    authentication: DesktopLaunchAuthenticationState,
    runtime: DesktopLaunchRuntimeState,
    systemBoundaries: DesktopSystemBoundaryPolicy,
    surface: DesktopSurfaceContract
  ) {
    self.profileRoot = profileRoot
    self.permissions = permissions
    self.authentication = authentication
    self.runtime = runtime
    self.systemBoundaries = systemBoundaries
    self.surface = surface
  }

  public static func production(profileRoot: URL) -> DesktopLaunchConfiguration {
    DesktopLaunchConfiguration(
      profileRoot: profileRoot,
      permissions: DesktopPermissionSnapshot(
        screenRecording: .notDetermined,
        microphone: .notDetermined
      ),
      authentication: .signedOut,
      runtime: .disconnected,
      systemBoundaries: .production,
      surface: .desktopV1
    )
  }

  public static func assembledTest(
    profileRoot: URL,
    permissions: DesktopPermissionSnapshot,
    authentication: DesktopLaunchAuthenticationState,
    runtime: DesktopLaunchRuntimeState
  ) -> DesktopLaunchConfiguration {
    DesktopLaunchConfiguration(
      profileRoot: profileRoot,
      permissions: permissions,
      authentication: authentication,
      runtime: runtime,
      systemBoundaries: .deterministicTest,
      surface: .desktopV1
    )
  }
}

public enum DesktopSystemBoundary: String, Hashable, Sendable {
  case capture
  case network
  case updates
  case telemetry
}

/// Observable result of assembling the Desktop process from launch policy.
/// The executable drives its real sections and system-boundary startup from
/// this value rather than branching independently in private SwiftUI views.
public struct DesktopApplicationComposition: Equatable, Sendable {
  public let profileRoot: URL
  public let mainWindowSections: [DesktopMainWindowSection]
  public let activeSystemBoundaries: Set<DesktopSystemBoundary>
  public let permissions: DesktopPermissionSnapshot
  public let authentication: DesktopLaunchAuthenticationState
  public let runtime: DesktopLaunchRuntimeState
  public let setupSurface: DesktopSetupSurface
  public let deliversProductMacOSNotifications: Bool
  public let offersFloatingBarComposer: Bool
}

public enum DesktopApplicationAssembler {
  public static func assemble(
    configuration: DesktopLaunchConfiguration
  ) -> DesktopApplicationComposition {
    var boundaries = Set<DesktopSystemBoundary>()
    if configuration.systemBoundaries.captureEnabled { boundaries.insert(.capture) }
    if configuration.systemBoundaries.networkEnabled { boundaries.insert(.network) }
    if configuration.systemBoundaries.updatesEnabled { boundaries.insert(.updates) }
    if configuration.systemBoundaries.telemetryEnabled { boundaries.insert(.telemetry) }

    return DesktopApplicationComposition(
      profileRoot: configuration.profileRoot,
      mainWindowSections: configuration.surface.mainWindowSections,
      activeSystemBoundaries: boundaries,
      permissions: configuration.permissions,
      authentication: configuration.authentication,
      runtime: configuration.runtime,
      setupSurface: configuration.surface.setupSurface,
      deliversProductMacOSNotifications: configuration.surface.capabilities.contains(
        .productMacOSNotification
      ),
      offersFloatingBarComposer:
        configuration.surface.conversationSurface == .floatingBar
        && configuration.surface.conversationInput == .textOnly
    )
  }
}
