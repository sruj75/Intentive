import Foundation

/// The approved Intentive journey, retaining Omi's ordered, resumable page
/// mechanism while removing Omi product/provider and Intentive voice steps.
public enum DesktopOnboardingStep: String, CaseIterable, Codable, Hashable, Identifiable, Sendable {
  case valuePrivacy = "value_privacy"
  case authentication
  case screenRecording = "screen_recording"
  case audioConsent = "audio_consent"
  case privacyControls = "privacy_controls"
  case textChatShortcut = "text_chat_shortcut"
  case ready

  public var id: String { rawValue }
}

public enum DesktopPermissionDecision: String, Codable, Equatable, Sendable {
  case granted
  case denied
  case deferred
}

public enum DesktopScreenRecordingState: Equatable, Sendable {
  case notReviewed
  case deferred
  case denied
  case granted
  case grantLost
}

public struct DesktopOnboardingProgress: Codable, Equatable, Sendable {
  public private(set) var completedSteps: Set<DesktopOnboardingStep>
  public private(set) var screenRecordingDecision: DesktopPermissionDecision?
  public private(set) var audioDecision: DesktopPermissionDecision?
  public private(set) var completed: Bool

  public init(
    completedSteps: Set<DesktopOnboardingStep> = [],
    screenRecordingDecision: DesktopPermissionDecision? = nil,
    audioDecision: DesktopPermissionDecision? = nil,
    completed: Bool = false
  ) {
    self.completedSteps = completedSteps
    self.screenRecordingDecision = screenRecordingDecision
    self.audioDecision = audioDecision
    self.completed = completed
  }

  public func isReviewed(_ step: DesktopOnboardingStep) -> Bool {
    completedSteps.contains(step)
  }

  public func completing(_ step: DesktopOnboardingStep) -> DesktopOnboardingProgress {
    var copy = self
    copy.completedSteps.insert(step)
    return copy
  }

  public func decidingScreenRecording(
    _ decision: DesktopPermissionDecision
  ) -> DesktopOnboardingProgress {
    var copy = self
    copy.screenRecordingDecision = decision
    copy.completedSteps.insert(.screenRecording)
    return copy
  }

  public func decidingAudio(_ decision: DesktopPermissionDecision) -> DesktopOnboardingProgress {
    var copy = self
    copy.audioDecision = decision
    copy.completedSteps.insert(.audioConsent)
    return copy
  }

  public func completingOnboarding() -> DesktopOnboardingProgress {
    var copy = completing(.ready)
    copy.completed = true
    return copy
  }
}

public struct DesktopOnboardingRequirements: Equatable, Sendable {
  public var progress: DesktopOnboardingProgress
  public var isAuthenticated: Bool
  public var screenRecordingPermissionGranted: Bool
  public var microphonePermissionGranted: Bool
  public var systemAudioPermissionGranted: Bool

  public init(
    progress: DesktopOnboardingProgress,
    isAuthenticated: Bool,
    screenRecordingPermissionGranted: Bool,
    microphonePermissionGranted: Bool,
    systemAudioPermissionGranted: Bool
  ) {
    self.progress = progress
    self.isAuthenticated = isAuthenticated
    self.screenRecordingPermissionGranted = screenRecordingPermissionGranted
    self.microphonePermissionGranted = microphonePermissionGranted
    self.systemAudioPermissionGranted = systemAudioPermissionGranted
  }

  public var screenRecordingState: DesktopScreenRecordingState {
    switch progress.screenRecordingDecision {
    case nil: return .notReviewed
    case .deferred: return .deferred
    case .denied: return .denied
    case .granted: return screenRecordingPermissionGranted ? .granted : .grantLost
    }
  }

  public var captureReady: Bool {
    isAuthenticated && screenRecordingPermissionGranted
  }

  public var textChatReady: Bool { isAuthenticated }

  public func isSatisfied(_ step: DesktopOnboardingStep) -> Bool {
    switch step {
    case .valuePrivacy, .privacyControls, .textChatShortcut:
      return progress.isReviewed(step)
    case .authentication:
      return isAuthenticated
    case .screenRecording:
      return progress.screenRecordingDecision != nil
    case .audioConsent:
      return progress.audioDecision != nil
    case .ready:
      return progress.completed
    }
  }

  public var isComplete: Bool {
    progress.completed && DesktopOnboardingStep.allCases.allSatisfy(isSatisfied)
  }

  public var nextIncompleteStep: DesktopOnboardingStep? {
    guard !isComplete else { return nil }
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
    switch self {
    case .encodeFailed(let message):
      return "Desktop onboarding progress could not be saved: \(message)"
    }
  }
}

public final class UserDefaultsDesktopOnboardingProgressStore: DesktopOnboardingProgressStore {
  private let defaults: UserDefaults
  private let key: String

  public init(
    defaults: UserDefaults = .standard,
    key: String = "intentive.desktop.onboarding.progress.v2"
  ) {
    self.defaults = defaults
    self.key = key
  }

  public func load() -> DesktopOnboardingProgress {
    guard let data = defaults.data(forKey: key) else { return DesktopOnboardingProgress() }
    return (try? JSONDecoder().decode(DesktopOnboardingProgress.self, from: data))
      ?? DesktopOnboardingProgress()
  }

  public func save(_ progress: DesktopOnboardingProgress) throws {
    do {
      defaults.set(try JSONEncoder().encode(progress), forKey: key)
    } catch {
      throw DesktopOnboardingProgressStoreError.encodeFailed(error.localizedDescription)
    }
  }
}
