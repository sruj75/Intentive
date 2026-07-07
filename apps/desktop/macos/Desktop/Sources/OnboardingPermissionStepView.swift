import SwiftUI

struct OnboardingPermissionStepView: View {
  let stepIndex: Int
  let totalSteps: Int
  let eyebrow: String
  let title: String
  let description: String
  let icon: String
  let reasonTitle: String
  let reasonDetail: String
  let primaryActionLabel: String
  let isGranted: Bool
  let onRequest: () -> Void
  let onContinue: () -> Void
  let onSkip: () -> Void
  let onForceComplete: (() -> Void)?

  var body: some View {
    OnboardingStepScaffold(
      stepIndex: stepIndex,
      totalSteps: totalSteps,
      eyebrow: eyebrow,
      title: title,
      description: description,
      showsSkip: true,
      onSkip: onSkip,
      onForceComplete: onForceComplete
    ) {
      VStack(alignment: .leading, spacing: 20) {
        HStack(spacing: 14) {
          Image(systemName: icon)
            .font(.system(size: 24, weight: .semibold))
            .foregroundColor(IntentiveColors.textSecondary)
            .frame(width: 58, height: 58)
            .background(IntentiveColors.backgroundSecondary, in: RoundedRectangle(cornerRadius: 18))

          VStack(alignment: .leading, spacing: 4) {
            Text(reasonTitle)
              .font(.system(size: 18, weight: .semibold))
              .foregroundColor(IntentiveColors.textPrimary)
            Text(isGranted ? "Granted" : "Not granted yet")
              .font(.system(size: 13, weight: .medium))
              .foregroundColor(isGranted ? IntentiveColors.success : IntentiveColors.textTertiary)
          }

          Spacer()
        }

        Text(reasonDetail)
          .font(.system(size: 14))
          .foregroundColor(IntentiveColors.textSecondary)
          .lineSpacing(4)

        HStack {
          Button(primaryActionLabel, action: isGranted ? onContinue : onRequest)
            .buttonStyle(OnboardingCardButtonStyle(isPrimary: true))
          if !isGranted {
            Button("Continue after granting", action: onContinue)
              .buttonStyle(OnboardingCardButtonStyle(isPrimary: false))
          }
        }
      }
      .frame(maxWidth: 540, alignment: .leading)
    }
  }
}
