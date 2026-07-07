import SwiftUI

struct OnboardingTrustStepView: View {
  let stepIndex: Int
  let totalSteps: Int
  let onContinue: () -> Void
  let onForceComplete: (() -> Void)?

  var body: some View {
    OnboardingStepScaffold(
      stepIndex: stepIndex,
      totalSteps: totalSteps,
      eyebrow: "Before we continue",
      title: "Intentive needs a few explicit Mac permissions.",
      description:
        "The desktop client captures local context, teaches the floating bar, and demonstrates voice only after the user sees what each permission is for.",
      layoutMode: .centered,
      onForceComplete: onForceComplete
    ) {
      VStack(alignment: .leading, spacing: 12) {
        OnboardingInsightCard(
          icon: "display",
          title: "Screen Memory",
          detail: "Raw screen capture stays local while compact perception events go to the Runtime."
        )
        OnboardingInsightCard(
          icon: "text.bubble",
          title: "Floating bar",
          detail: "The Mac can start a normal Companion turn without opening the main window."
        )
        OnboardingInsightCard(
          icon: "waveform",
          title: "Voice",
          detail: "Push-to-talk is intentional input, separate from ambient capture."
        )

        HStack {
          Spacer()
          Button("Continue", action: onContinue)
            .buttonStyle(OnboardingCardButtonStyle(isPrimary: true))
            .keyboardShortcut(.defaultAction)
        }
      }
      .frame(maxWidth: 560, alignment: .leading)
    }
  }
}
