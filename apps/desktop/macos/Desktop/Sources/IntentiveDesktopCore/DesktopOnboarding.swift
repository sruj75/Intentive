import Foundation

public enum DesktopOnboardingStep: String, CaseIterable, Codable, Hashable, Identifiable, Sendable {
  case trustPrimer = "trust_primer"
  case permissions = "permissions"
  case notificationPreview = "notification_preview"
  case floatingBarShortcut = "floating_bar_shortcut"
  case floatingBarDemo = "floating_bar"
  case voiceShortcut = "voice_shortcut"
  case voiceDemo = "voice_demo"
  case ambientAudioConsent = "ambient_audio_consent"

  public var id: String { rawValue }
}

public struct DesktopOnboardingProgress: Codable, Equatable, Sendable {
  public private(set) var completedSteps: Set<DesktopOnboardingStep>

  public init(completedSteps: Set<DesktopOnboardingStep> = []) {
    self.completedSteps = completedSteps
  }

  public func isReviewed(_ step: DesktopOnboardingStep) -> Bool {
    completedSteps.contains(step)
  }

  public func completing(_ step: DesktopOnboardingStep) -> DesktopOnboardingProgress {
    var copy = self
    copy.completedSteps.insert(step)
    return copy
  }
}

public struct DesktopOnboardingRequirements: Equatable, Sendable {
  public var progress: DesktopOnboardingProgress
  public var screenRecordingPermissionGranted: Bool
  public var accessibilityPermissionGranted: Bool
  public var microphonePermissionGranted: Bool

  public init(
    progress: DesktopOnboardingProgress,
    screenRecordingPermissionGranted: Bool,
    accessibilityPermissionGranted: Bool = true,
    microphonePermissionGranted: Bool
  ) {
    self.progress = progress
    self.screenRecordingPermissionGranted = screenRecordingPermissionGranted
    self.accessibilityPermissionGranted = accessibilityPermissionGranted
    self.microphonePermissionGranted = microphonePermissionGranted
  }

  public func isSatisfied(_ step: DesktopOnboardingStep) -> Bool {
    switch step {
    case .trustPrimer, .notificationPreview, .floatingBarShortcut, .floatingBarDemo, .voiceShortcut,
      .voiceDemo, .ambientAudioConsent:
      return progress.isReviewed(step)
    case .permissions:
      return progress.isReviewed(step)
        && screenRecordingPermissionGranted
        && accessibilityPermissionGranted
        && microphonePermissionGranted
    }
  }

  public var isComplete: Bool {
    DesktopOnboardingStep.allCases.allSatisfy(isSatisfied)
  }

  public var nextIncompleteStep: DesktopOnboardingStep? {
    DesktopOnboardingStep.allCases.first { !isSatisfied($0) }
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
    key: String = "intentive.desktop.onboarding.progress.v1"
  ) {
    self.defaults = defaults
    self.key = key
  }

  public func load() -> DesktopOnboardingProgress {
    guard let data = defaults.data(forKey: key) else {
      return DesktopOnboardingProgress()
    }

    do {
      return try JSONDecoder().decode(DesktopOnboardingProgress.self, from: data)
    } catch {
      return DesktopOnboardingProgress()
    }
  }

  public func save(_ progress: DesktopOnboardingProgress) throws {
    do {
      defaults.set(try JSONEncoder().encode(progress), forKey: key)
    } catch {
      throw DesktopOnboardingProgressStoreError.encodeFailed(error.localizedDescription)
    }
  }
}
