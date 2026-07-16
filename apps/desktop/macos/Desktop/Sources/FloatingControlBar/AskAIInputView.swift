import SwiftUI

/// Omi-derived floating composer narrowed to Intentive's text-only Runtime seam.
struct AskAIInputView: View {
  @Binding var userInput: String
  var onSend: (String) -> Void
  var onEscape: () -> Void
  var onHeightChange: (CGFloat) -> Void

  @State private var textHeight: CGFloat = 40
  @State private var hasMarkedText = false

  private var trimmedInput: String {
    userInput.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  var body: some View {
    HStack(spacing: 6) {
      ZStack(alignment: .topLeading) {
        if userInput.isEmpty && !hasMarkedText {
          Text("Ask Intentive…")
            .scaledFont(size: 13)
            .foregroundColor(.secondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 8)
        }

        IntentiveTextEditor(
          text: $userInput,
          lineFragmentPadding: 8,
          onSubmit: send,
          focusOnAppear: true,
          onMarkedTextChange: { hasMarkedText = $0 },
          minHeight: 40,
          maxHeight: 200,
          onHeightChange: { height in
            guard abs(textHeight - height) > 1 else { return }
            textHeight = height
            onHeightChange(height)
          }
        )
      }
      .padding(.horizontal, 4)
      .frame(height: textHeight)

      Button(action: send) {
        Image(systemName: "arrow.up.circle.fill")
          .scaledFont(size: 24)
          .foregroundColor(canSend ? .white : .secondary)
      }
      .disabled(!canSend)
      .buttonStyle(.plain)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
    .onExitCommand(perform: onEscape)
  }

  private var canSend: Bool {
    !hasMarkedText && !trimmedInput.isEmpty
  }

  private func send() {
    guard canSend else { return }
    let message = trimmedInput
    userInput = ""
    onSend(message)
  }
}
