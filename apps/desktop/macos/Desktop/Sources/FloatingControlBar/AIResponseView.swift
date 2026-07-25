import SwiftUI

/// Text-only conversation surface adapted from Omi's floating response view.
struct AIResponseView: View {
  var isLoading: Bool
  var currentMessage: ChatMessage?
  var userInput: String
  var chatHistory: [FloatingChatExchange]
  var onEscape: () -> Void
  var onSendFollowUp: (String) -> Void

  @State private var followUpText = ""
  @State private var hasMarkedText = false

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      ScrollView {
        VStack(alignment: .leading, spacing: 14) {
          ForEach(chatHistory) { exchange in
            exchangeView(question: exchange.question, answer: exchange.aiMessage.text)
          }
          exchangeView(
            question: userInput.isEmpty ? nil : userInput,
            answer: currentMessage?.text ?? "",
            showsLoader: isLoading && (currentMessage?.text ?? "").isEmpty
          )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 4)
      }
      .frame(maxHeight: 240)

      HStack(spacing: 8) {
        // The follow-up composer is the same real `NSTextView`-backed editor as
        // AskAIInputView, not a plain SwiftUI `TextField`. A plain `TextField`
        // does not relay an AX-driven `kAXValueAttribute` write back into its
        // `@State` binding, so Accessibility (and the acceptance driver) could set
        // the displayed text yet `followUpText` stayed empty and the send no-oped.
        // `IntentiveTextEditor`'s `NSTextViewDelegate.textDidChange` writes the
        // binding on any mutation, including automation-driven ones.
        ZStack(alignment: .topLeading) {
          if followUpText.isEmpty && !hasMarkedText {
            Text("Reply…")
              .scaledFont(size: 13)
              .foregroundColor(.secondary)
              .padding(.horizontal, 8)
          }

          IntentiveTextEditor(
            text: $followUpText,
            lineFragmentPadding: 8,
            onSubmit: sendFollowUp,
            // A Post-Message-Back presents this surface without making the panel
            // key, so it must not grab focus and steal the user's typing in their
            // current app. The AX write no longer depends on focus: the id sits on
            // the inner NSTextView and `setAccessibilityValue` routes through the
            // real edit path, so `sendThroughComposer` lands the text regardless.
            focusOnAppear: false,
            onMarkedTextChange: { hasMarkedText = $0 },
            minHeight: 20,
            maxHeight: 96,
            // Same id as AskAIInputView's composer, on the inner NSTextView: the
            // response surface is the ongoing-conversation form of the one text
            // composer, so Accessibility targets it identically whether the bar
            // opened fresh or as a follow-up.
            accessibilityIdentifier: "floating-composer-input"
          )
        }
        .foregroundColor(IntentiveColors.textPrimary)

        Button(action: sendFollowUp) {
          Image(systemName: "arrow.up.circle.fill")
            .scaledFont(size: 18)
            .foregroundColor(
              canSend ? IntentiveColors.purplePrimary : IntentiveColors.textQuaternary
            )
        }
        .disabled(!canSend)
        .buttonStyle(.plain)
        .accessibilityIdentifier("floating-composer-send")
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
      .background(
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .fill(Color.white.opacity(0.06))
      )
    }
    .padding(16)
    .onExitCommand(perform: onEscape)
  }

  @ViewBuilder
  private func exchangeView(question: String?, answer: String, showsLoader: Bool = false) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      if let question, !question.isEmpty {
        Text(question)
          .scaledFont(size: 13)
          .foregroundColor(IntentiveColors.textPrimary)
          .accessibilityIdentifier("floating-question-text")
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 12)
          .padding(.vertical, 8)
          .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
              .fill(Color.white.opacity(0.08))
          )
      }
      if showsLoader {
        HStack(spacing: 8) {
          ProgressView().scaleEffect(0.6).frame(width: 14, height: 14)
          Text("thinking")
            .scaledFont(size: 13)
            .foregroundColor(IntentiveColors.textTertiary)
        }
      } else if !answer.isEmpty {
        Text(answer)
          .scaledFont(size: 13)
          .foregroundColor(IntentiveColors.textPrimary)
          .textSelection(.enabled)
          .accessibilityIdentifier("floating-response-text")
      }
    }
  }

  private var canSend: Bool {
    !hasMarkedText && !followUpText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  private func sendFollowUp() {
    guard canSend else { return }
    let trimmed = followUpText.trimmingCharacters(in: .whitespacesAndNewlines)
    followUpText = ""
    onSendFollowUp(trimmed)
  }
}
