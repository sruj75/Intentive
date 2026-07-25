import Foundation

/// Semantic identifiers for the six retained Omi setup pages. Sign-in is a
/// separate launch gate and is intentionally outside the progress rail.
public enum DesktopOnboardingStep: String, CaseIterable, Codable, Hashable, Identifiable, Sendable {
  case trust
  case screenRecording = "screen_recording"
  case microphone
  case accessibility
  case floatingBarShortcut = "floating_bar_shortcut"
  case floatingBarDemo = "floating_bar_demo"

  public var id: String { rawValue }
}

public enum DesktopPermissionDecision: String, Codable, Equatable, Sendable {
  case granted, denied, deferred
}

public enum DesktopScreenRecordingState: Equatable, Sendable {
  case notReviewed, deferred, denied, granted, grantLost
}

public struct DesktopOnboardingProgress: Codable, Equatable, Sendable {
  public private(set) var completedSteps: Set<DesktopOnboardingStep>
  public private(set) var screenRecordingDecision: DesktopPermissionDecision?
  public private(set) var microphoneDecision: DesktopPermissionDecision?
  public private(set) var completed: Bool

  public init(
    completedSteps: Set<DesktopOnboardingStep> = [],
    screenRecordingDecision: DesktopPermissionDecision? = nil,
    microphoneDecision: DesktopPermissionDecision? = nil,
    completed: Bool = false
  ) {
    self.completedSteps = completed ? Set(DesktopOnboardingStep.allCases) : completedSteps
    self.screenRecordingDecision = screenRecordingDecision
    self.microphoneDecision = microphoneDecision
    self.completed = completed
  }

  public func isReviewed(_ step: DesktopOnboardingStep) -> Bool { completedSteps.contains(step) }

  public func completing(_ step: DesktopOnboardingStep) -> DesktopOnboardingProgress {
    var copy = self
    copy.completedSteps.insert(step)
    if copy.completedSteps.isSuperset(of: DesktopOnboardingStep.allCases) { copy.completed = true }
    return copy
  }

  public func decidingScreenRecording(_ decision: DesktopPermissionDecision) -> DesktopOnboardingProgress {
    var copy = self
    copy.screenRecordingDecision = decision
    copy.completedSteps.insert(.screenRecording)
    return copy
  }

  public func decidingMicrophone(_ decision: DesktopPermissionDecision) -> DesktopOnboardingProgress {
    var copy = self
    copy.microphoneDecision = decision
    copy.completedSteps.insert(.microphone)
    return copy
  }

  /// Compatibility with the pre-renovation caller until the executable adapter is replaced.
  public func decidingAudio(_ decision: DesktopPermissionDecision) -> DesktopOnboardingProgress {
    decidingMicrophone(decision)
  }

  public func completingOnboarding() -> DesktopOnboardingProgress {
    DesktopOnboardingProgress(
      completedSteps: Set(DesktopOnboardingStep.allCases),
      screenRecordingDecision: screenRecordingDecision,
      microphoneDecision: microphoneDecision,
      completed: true
    )
  }

  private enum CodingKeys: String, CodingKey {
    case completedSteps, screenRecordingDecision, microphoneDecision, audioDecision, completed
  }

  public init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    let isCompleted = try values.decodeIfPresent(Bool.self, forKey: .completed) ?? false
    let legacyRaw = try values.decodeIfPresent(Set<String>.self, forKey: .completedSteps) ?? []
    var migrated = Set(legacyRaw.compactMap(DesktopOnboardingStep.init(rawValue:)))
    if legacyRaw.contains("value_privacy") { migrated.insert(.trust) }
    if legacyRaw.contains("audio_consent") { migrated.insert(.microphone) }
    if legacyRaw.contains("text_chat_shortcut") { migrated.insert(.floatingBarShortcut) }
    if legacyRaw.contains("ready") { migrated.insert(.floatingBarDemo) }
    self.init(
      completedSteps: migrated,
      screenRecordingDecision: try values.decodeIfPresent(
        DesktopPermissionDecision.self, forKey: .screenRecordingDecision),
      microphoneDecision: try values.decodeIfPresent(
        DesktopPermissionDecision.self, forKey: .microphoneDecision)
        ?? values.decodeIfPresent(DesktopPermissionDecision.self, forKey: .audioDecision),
      completed: isCompleted
    )
  }

  public func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    try values.encode(completedSteps.map(\.rawValue), forKey: .completedSteps)
    try values.encodeIfPresent(screenRecordingDecision, forKey: .screenRecordingDecision)
    try values.encodeIfPresent(microphoneDecision, forKey: .microphoneDecision)
    try values.encode(completed, forKey: .completed)
  }
}

public struct DesktopOnboardingRequirements: Equatable, Sendable {
  public var progress: DesktopOnboardingProgress
  public var isAuthenticated: Bool
  public var crossClientSetupComplete: Bool
  public var screenRecordingPermissionGranted: Bool
  public var microphonePermissionGranted: Bool
  public var accessibilityPermissionGranted: Bool

  public init(
    progress: DesktopOnboardingProgress,
    isAuthenticated: Bool,
    crossClientSetupComplete: Bool = true,
    screenRecordingPermissionGranted: Bool,
    microphonePermissionGranted: Bool,
    systemAudioPermissionGranted _: Bool = false,
    accessibilityPermissionGranted: Bool = false
  ) {
    self.progress = progress
    self.isAuthenticated = isAuthenticated
    self.crossClientSetupComplete = crossClientSetupComplete
    self.screenRecordingPermissionGranted = screenRecordingPermissionGranted
    self.microphonePermissionGranted = microphonePermissionGranted
    self.accessibilityPermissionGranted = accessibilityPermissionGranted
  }

  public var screenRecordingState: DesktopScreenRecordingState {
    switch progress.screenRecordingDecision {
    case nil: .notReviewed
    case .deferred: .deferred
    case .denied: .denied
    case .granted: screenRecordingPermissionGranted ? .granted : .grantLost
    }
  }

  public var captureReady: Bool { isAuthenticated && screenRecordingPermissionGranted }
  public var textChatReady: Bool { isAuthenticated }

  public func isSatisfied(_ step: DesktopOnboardingStep) -> Bool { progress.isReviewed(step) }

  public var isComplete: Bool {
    isAuthenticated && crossClientSetupComplete && progress.completed
      && DesktopOnboardingStep.allCases.allSatisfy(isSatisfied)
  }

  public var nextIncompleteStep: DesktopOnboardingStep? {
    guard isAuthenticated, crossClientSetupComplete else { return nil }
    return DesktopOnboardingStep.allCases.first { !isSatisfied($0) }
  }
}

public protocol DesktopOnboardingProgressStore {
  func load() -> DesktopOnboardingProgress
  func save(_ progress: DesktopOnboardingProgress) throws
}

public enum DesktopOnboardingProgressStoreError: Error, LocalizedError {
  case encodeFailed(String)
  public var errorDescription: String? {
    switch self { case .encodeFailed(let message): "Desktop onboarding progress could not be saved: \(message)" }
  }
}

public final class UserDefaultsDesktopOnboardingProgressStore: DesktopOnboardingProgressStore {
  private let defaults: UserDefaults
  private let key: String
  public init(defaults: UserDefaults = .standard, key: String = "intentive.desktop.onboarding.progress.v3") {
    self.defaults = defaults
    self.key = key
  }
  public func load() -> DesktopOnboardingProgress {
    guard let data = defaults.data(forKey: key) else { return DesktopOnboardingProgress() }
    return (try? JSONDecoder().decode(DesktopOnboardingProgress.self, from: data)) ?? DesktopOnboardingProgress()
  }
  public func save(_ progress: DesktopOnboardingProgress) throws {
    do { defaults.set(try JSONEncoder().encode(progress), forKey: key) }
    catch { throw DesktopOnboardingProgressStoreError.encodeFailed(error.localizedDescription) }
  }
}
