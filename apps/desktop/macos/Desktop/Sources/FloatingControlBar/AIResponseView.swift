import AppKit
import SwiftUI

/// The floating bar's answer surface, adapted from Omi's rich chat renderer into
/// Intentive's conversational, text-first companion (ADR-0007). It keeps the
/// original initializer shape so `FloatingControlBarView` calls it verbatim, but
/// renders answers as plain text — no Markdown, no structured content blocks, no
/// resources, no rating/voice-follow-up chrome. Prior turns and the current
/// exchange scroll above a lightweight follow-up composer.
struct AIResponseView: View {
    @Binding var isLoading: Bool
    var currentMessage: ChatMessage?
    var userInput: String
    var chatHistory: [FloatingChatExchange]
    @Binding var isVoiceFollowUp: Bool
    @Binding var voiceFollowUpTranscript: String
    var canClearVisibleConversation: Bool
    var showsHeader: Bool
    var onClearVisibleConversation: (() -> Void)?
    var onEscape: (() -> Void)?
    var onSendFollowUp: ((String) -> Void)?
    var onRate: ((String, Int?) -> Void)?
    var onShareLink: (() async -> String?)?
    var onOpenAgent: ((UUID, @escaping (Bool) -> Void) -> Void)?
    var onOpenAgentRef: ((AgentTimelineRef, @escaping (Bool) -> Void) -> Void)?

    @State private var followUpText: String = ""

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

            followUpComposer
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
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
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private var followUpComposer: some View {
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
            .disabled(followUpText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.06))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(IntentiveColors.border.opacity(0.5), lineWidth: 1)
                )
        )
    }

    private func sendFollowUp() {
        let trimmed = followUpText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        followUpText = ""
        onSendFollowUp?(trimmed)
    }
}
