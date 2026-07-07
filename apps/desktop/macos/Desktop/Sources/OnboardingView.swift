import SwiftUI

struct OnboardingView: View {
  @ObservedObject var appState: AppState
  @ObservedObject var chatProvider: ChatProvider

  let screenRecordingGranted: Bool
  let microphoneGranted: Bool
  let requestScreenRecording: () -> Void
  let requestMicrophone: () -> Void
  let onComplete: () -> Void
  let onSkip: () -> Void
  let onForceComplete: (() -> Void)?

  @AppStorage("intentiveOnboardingCurrentStep") private var currentStep = 0

  var body: some View {
    currentStepView
      .frame(minWidth: 920, minHeight: 640)
      .background(IntentiveColors.backgroundPrimary)
  }

  @ViewBuilder
  private var currentStepView: some View {
    switch OnboardingFlow.step(at: currentStep) {
    case .trust:
      OnboardingTrustStepView(
        stepIndex: currentStep,
        totalSteps: OnboardingFlow.introStepCount,
        onContinue: advance,
        onForceComplete: onForceComplete
      )
    case .screenRecording:
      OnboardingPermissionStepView(
        stepIndex: currentStep,
        totalSteps: OnboardingFlow.introStepCount,
        eyebrow: "Mac permission",
        title: "Let Intentive see your screen.",
        description: "Screen Recording powers Screen Memory and desktop perception events.",
        icon: "display",
        reasonTitle: "Screen Recording",
        reasonDetail: "Intentive uses this permission to build local Screen Memory before sending compact perception events to the Runtime.",
        primaryActionLabel: screenRecordingGranted ? "Continue" : "Request Screen Recording",
        isGranted: screenRecordingGranted,
        onRequest: screenRecordingGranted ? advance : requestScreenRecording,
        onContinue: advance,
        onSkip: advance,
        onForceComplete: onForceComplete
      )
    case .microphone:
      OnboardingPermissionStepView(
        stepIndex: currentStep,
        totalSteps: OnboardingFlow.introStepCount,
        eyebrow: "Mac permission",
        title: "Let Intentive use your mic.",
        description: "Microphone access is required for push-to-talk voice turns.",
        icon: "mic.fill",
        reasonTitle: "Microphone",
        reasonDetail: "Voice is intentional input: the client records while the push-to-talk path is active, then routes the turn through the Companion.",
        primaryActionLabel: microphoneGranted ? "Continue" : "Request Microphone",
        isGranted: microphoneGranted,
        onRequest: microphoneGranted ? advance : requestMicrophone,
        onContinue: advance,
        onSkip: advance,
        onForceComplete: onForceComplete
      )
    case .notifications:
      OnboardingNotificationStepView(
        appState: appState,
        chatProvider: chatProvider,
        onContinue: advance,
        onSkip: advance
      )
    case .floatingBarShortcut:
      OnboardingFloatingBarShortcutStepView(
        appState: appState,
        chatProvider: chatProvider,
        onComplete: advance,
        onSkip: advance,
        onForceComplete: onForceComplete
      )
    case .floatingBarDemo:
      OnboardingFloatingBarDemoView(
        appState: appState,
        chatProvider: chatProvider,
        onComplete: advance,
        onSkip: advance,
        onForceComplete: onForceComplete
      )
    case .voiceShortcut:
      OnboardingVoiceShortcutStepView(
        appState: appState,
        chatProvider: chatProvider,
        onComplete: advance,
        onSkip: advance,
        onForceComplete: onForceComplete
      )
    case .voiceDemo:
      OnboardingVoiceDemoView(
        appState: appState,
        chatProvider: chatProvider,
        onComplete: complete,
        onSkip: complete,
        onForceComplete: onForceComplete
      )
    }
  }

  private func advance() {
    if currentStep >= OnboardingFlow.lastStepIndex {
      complete()
      return
    }
    currentStep += 1
  }

  private func complete() {
    currentStep = OnboardingFlow.lastStepIndex
    onComplete()
  }
}
