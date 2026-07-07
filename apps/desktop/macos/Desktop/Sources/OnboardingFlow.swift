import Foundation

enum OnboardingFlow {
  enum Step: String, CaseIterable {
    case trust = "Trust"
    case screenRecording = "ScreenRecording"
    case microphone = "Microphone"
    case notifications = "Notifications"
    case floatingBarShortcut = "FloatingBarShortcut"
    case floatingBarDemo = "FloatingBarDemo"
    case voiceShortcut = "VoiceShortcut"
    case voiceDemo = "VoiceDemo"
  }

  static let steps = Step.allCases.map(\.rawValue)
  static let introStepCount = Step.allCases.count
  static let legacyPostIntroOffset = 0
  static let lastStepIndex = steps.count - 1

  static func step(at index: Int) -> Step {
    Step.allCases[min(max(0, index), lastStepIndex)]
  }

  static func migratedStep(currentStep: Int) -> Int {
    min(max(0, currentStep), lastStepIndex)
  }

  static func shouldUnlockVoiceShortcutContinue(
    observedShortcutPress: Bool,
    pttState: PushToTalkManager.PTTState
  ) -> Bool {
    observedShortcutPress && pttState == .idle
  }
}
