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
        TextField("Reply…", text: $followUpText)
          .textFieldStyle(.plain)
          .scaledFont(size: 13)
          .foregroundColor(IntentiveColors.textPrimary)
          .onSubmit(sendFollowUp)

        Button(action: sendFollowUp) {
          Image(systemName: "arrow.up.circle.fill")
            .scaledFont(size: 18)
            .foregroundColor(
              followUpText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? IntentiveColors.textQuaternary
                : IntentiveColors.purplePrimary
            )
        }
        .buttonStyle(.plain)
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
      }
    }
  }

  private func sendFollowUp() {
    let trimmed = followUpText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    followUpText = ""
    onSendFollowUp(trimmed)
  }
}
