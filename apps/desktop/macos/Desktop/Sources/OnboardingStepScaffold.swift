import SwiftUI

public enum OnboardingLayoutMode {
  case split
  case centered
}

public struct OnboardingStepScaffold<Content: View>: View {
  let stepIndex: Int
  let totalSteps: Int
  let eyebrow: String
  let title: String
  let description: String
  let layoutMode: OnboardingLayoutMode
  let showsSkip: Bool
  let onSkip: (() -> Void)?
  let onForceComplete: (() -> Void)?
  let content: Content

  public init(
    stepIndex: Int,
    totalSteps: Int,
    eyebrow: String,
    title: String,
    description: String,
    layoutMode: OnboardingLayoutMode = .split,
    showsSkip: Bool = false,
    onSkip: (() -> Void)? = nil,
    onForceComplete: (() -> Void)? = nil,
    @ViewBuilder content: () -> Content
  ) {
    self.stepIndex = stepIndex
    self.totalSteps = totalSteps
    self.eyebrow = eyebrow
    self.title = title
    self.description = description
    self.layoutMode = layoutMode
    self.showsSkip = showsSkip
    self.onSkip = onSkip
    self.onForceComplete = onForceComplete
    self.content = content()
  }

  public var body: some View {
    VStack(spacing: 0) {
      header

      Divider()
        .background(IntentiveColors.backgroundTertiary)

      GeometryReader { geometry in
        ScrollView(showsIndicators: false) {
          VStack(alignment: layoutMode == .centered ? .center : .leading, spacing: 28) {
            progressRow
            titleBlock
            content
          }
          .frame(maxWidth: layoutMode == .centered ? 620 : 560, alignment: alignment)
          .frame(
            minWidth: 0,
            maxWidth: .infinity,
            minHeight: geometry.size.height,
            alignment: layoutMode == .centered ? .center : .topLeading
          )
          .padding(.horizontal, 40)
          .padding(.vertical, 36)
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(IntentiveColors.backgroundPrimary)
  }

  private var alignment: Alignment {
    layoutMode == .centered ? .center : .leading
  }

  private var header: some View {
    HStack {
      OnboardingLogoMark(onForceComplete: onForceComplete)

      Spacer()

      if showsSkip, let onSkip {
        Button("Skip", action: onSkip)
          .buttonStyle(.plain)
          .font(.system(size: 13, weight: .medium))
          .foregroundColor(IntentiveColors.textTertiary)
      }
    }
    .padding(.horizontal, 24)
    .padding(.vertical, 16)
  }

  private var progressRow: some View {
    HStack(spacing: 8) {
      ForEach(0..<totalSteps, id: \.self) { index in
        Capsule()
          .fill(index <= stepIndex ? Color.white : Color.white.opacity(0.12))
          .frame(width: index == stepIndex ? 28 : 8, height: 6)
      }
    }
    .frame(maxWidth: .infinity, alignment: layoutMode == .centered ? .center : .leading)
  }

  private var titleBlock: some View {
    VStack(alignment: layoutMode == .centered ? .center : .leading, spacing: 14) {
      if !eyebrow.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        Text(eyebrow.uppercased())
          .font(.system(size: 12, weight: .semibold))
          .tracking(1.2)
          .foregroundColor(IntentiveColors.textTertiary)
      }

      Text(title)
        .font(.system(size: 40, weight: .bold))
        .foregroundColor(IntentiveColors.textPrimary)
        .lineSpacing(2)
        .multilineTextAlignment(layoutMode == .centered ? .center : .leading)

      if !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        Text(description)
          .font(.system(size: 16))
          .foregroundColor(IntentiveColors.textSecondary)
          .lineSpacing(4)
          .multilineTextAlignment(layoutMode == .centered ? .center : .leading)
          .frame(maxWidth: 480, alignment: alignment)
      }
    }
    .frame(maxWidth: .infinity, alignment: alignment)
  }
}

public struct OnboardingLogoMark: View {
  let onForceComplete: (() -> Void)?

  public init(onForceComplete: (() -> Void)?) { self.onForceComplete = onForceComplete }

  public var body: some View {
    Text("Intentive")
      .font(.system(size: 18, weight: .semibold))
      .foregroundColor(.white)
      .contentShape(Rectangle())
      .onLongPressGesture(minimumDuration: 1) {
        onForceComplete?()
      }
      .accessibilityLabel("Intentive")
  }
}

public struct OnboardingCardButtonStyle: ButtonStyle {
  let isPrimary: Bool

  public init(isPrimary: Bool) { self.isPrimary = isPrimary }

  public func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: 15, weight: .semibold))
      .foregroundColor(isPrimary ? .black : IntentiveColors.textPrimary)
      .padding(.horizontal, 18)
      .padding(.vertical, 12)
      .background(
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .fill(isPrimary ? Color.white : IntentiveColors.backgroundTertiary)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .stroke(Color.white.opacity(isPrimary ? 0 : 0.08), lineWidth: 1)
      )
      .opacity(configuration.isPressed ? 0.92 : 1)
      .scaleEffect(configuration.isPressed ? 0.985 : 1)
      .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
  }
}

public struct OnboardingInsightCard: View {
  let icon: String
  let title: String
  let detail: String

  public init(icon: String, title: String, detail: String) {
    self.icon = icon
    self.title = title
    self.detail = detail
  }

  public var body: some View {
    HStack(alignment: .top, spacing: 14) {
      Image(systemName: icon)
        .font(.system(size: 16, weight: .semibold))
        .foregroundColor(IntentiveColors.textSecondary)
        .frame(width: 42, height: 42)
        .background(IntentiveColors.backgroundQuaternary, in: RoundedRectangle(cornerRadius: 14))

      VStack(alignment: .leading, spacing: 6) {
        Text(title)
          .font(.system(size: 15, weight: .semibold))
          .foregroundColor(IntentiveColors.textPrimary)

        Text(detail)
          .font(.system(size: 13))
          .foregroundColor(IntentiveColors.textTertiary)
          .lineSpacing(3)
      }

      Spacer()
    }
    .padding(18)
    .background(
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .fill(IntentiveColors.backgroundSecondary)
        .overlay(
          RoundedRectangle(cornerRadius: 20, style: .continuous)
            .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
    )
  }
}

public struct OnboardingSelectableChip: View {
  let title: String
  let isSelected: Bool
  let action: () -> Void

  public init(title: String, isSelected: Bool, action: @escaping () -> Void) {
    self.title = title
    self.isSelected = isSelected
    self.action = action
  }

  public var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 14, weight: .semibold))
        .foregroundColor(isSelected ? .black : IntentiveColors.textSecondary)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(
          Capsule()
            .fill(isSelected ? Color.white : IntentiveColors.backgroundSecondary)
        )
        .overlay(
          Capsule()
            .stroke(Color.white.opacity(isSelected ? 0 : 0.08), lineWidth: 1)
        )
    }
    .buttonStyle(.plain)
  }
}
