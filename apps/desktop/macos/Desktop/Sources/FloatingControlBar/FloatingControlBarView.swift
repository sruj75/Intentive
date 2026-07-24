import SwiftUI

/// Omi's floating glass/notch presentation, narrowed to the one Runtime-owned
/// text conversation and PMB nudges.
struct FloatingControlBarView: View {
  @ObservedObject var state: FloatingControlBarState
  var window: NSWindow?
  var onAskAI: () -> Void
  var onHide: () -> Void
  var onSendQuery: (String) -> Void
  var onCloseAI: () -> Void

  @ObservedObject private var settings = ShortcutSettings.shared

  var body: some View {
    Group {
      if state.showingAIConversation {
        conversationView
      } else {
        compactBar
      }
    }
    .foregroundStyle(.white)
    .floatingBackground(cornerRadius: state.showingAIConversation ? 18 : 14)
    .overlay {
      DraggableAreaView(targetWindow: window)
        .allowsHitTesting(settings.draggableBarEnabled && !state.showingAIConversation)
    }
  }

  private var compactBar: some View {
    Button(action: onAskAI) {
      HStack(spacing: 8) {
        Circle()
          .fill(IntentiveColors.purplePrimary)
          .frame(width: 8, height: 8)
        Text("Intentive")
          .scaledFont(size: 12, weight: .semibold)
        HStack(spacing: 2) {
          ForEach(settings.floatingBarShortcut.displayTokens, id: \.self) { token in
            Text(token)
              .scaledFont(size: 9)
              .padding(.horizontal, token.count > 1 ? 4 : 2)
              .frame(minHeight: 16)
              .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 4))
          }
        }
      }
      .padding(.horizontal, 14)
      .frame(height: 34)
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Open Intentive conversation")
    .accessibilityIdentifier("floating-bar-open")
  }

  private var conversationView: some View {
    VStack(spacing: 0) {
      HStack {
        Text("Intentive")
          .scaledFont(size: 12, weight: .semibold)
        Spacer()
        Button(action: onCloseAI) {
          Image(systemName: "xmark")
            .scaledFont(size: 11, weight: .semibold)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Close conversation")
        .accessibilityIdentifier("floating-bar-close")
      }
      .padding(.horizontal, 16)
      .padding(.top, 12)

      if state.showingAIResponse {
        AIResponseView(
          isLoading: state.isAILoading,
          currentMessage: state.currentAIMessage(
            from: FloatingControlBarManager.shared.sharedFloatingProvider),
          userInput: state.displayedQuery,
          chatHistory: state.derivedChatHistory(
            from: FloatingControlBarManager.shared.sharedFloatingProvider),
          onEscape: onCloseAI,
          onSendFollowUp: submit
        )
      } else {
        AskAIInputView(
          userInput: $state.aiInputText,
          onSend: submit,
          onEscape: onCloseAI,
          onHeightChange: { state.inputViewHeight = $0 + 64 }
        )
      }
    }
    .frame(width: 430)
  }

  private func submit(_ message: String) {
    state.beginTurn(clientTurnId: UUID().uuidString, question: message)
    onSendQuery(message)
  }
}
