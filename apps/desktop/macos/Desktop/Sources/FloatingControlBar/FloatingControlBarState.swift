import Combine
import SwiftUI

struct FloatingChatExchangePair: Equatable {
  var questionMessageId: String?
  var answerMessageId: String?
}

struct FloatingChatViewport: Equatable {
  var activeClientTurnId: String?
  var questionMessageId: String?
  var answerMessageId: String?
  var archivedExchanges: [FloatingChatExchangePair] = []

  mutating func archiveCurrentExchange() {
    guard questionMessageId != nil || answerMessageId != nil else { return }
    archivedExchanges.append(
      FloatingChatExchangePair(
        questionMessageId: questionMessageId,
        answerMessageId: answerMessageId
      )
    )
    activeClientTurnId = nil
    questionMessageId = nil
    answerMessageId = nil
  }

  mutating func clear() {
    activeClientTurnId = nil
    questionMessageId = nil
    answerMessageId = nil
    archivedExchanges = []
  }
}

struct FloatingChatExchange: Identifiable {
  let id: String
  let question: String?
  let aiMessage: ChatMessage
}

enum FloatingConversationSurface: Equatable {
  case closed
  case mainInput
  case mainResponse

  var isOpen: Bool { self != .closed }
  var measurementKey: String {
    switch self {
    case .closed: return "closed"
    case .mainInput: return "mainInput"
    case .mainResponse: return "mainResponse"
    }
  }
}

struct FloatingBarNotification: Identifiable, Equatable {
  let id = UUID()
  let title: String
  let message: String

  init(
    title: String,
    message: String
  ) {
    self.title = title
    self.message = message
  }

  static func == (lhs: FloatingBarNotification, rhs: FloatingBarNotification) -> Bool {
    lhs.id == rhs.id
  }
}

/// Omi-derived floating-bar state narrowed to one text conversation and PMB
/// presentation. It deliberately has no agent, attachment, model, or audio state.
@MainActor
final class FloatingControlBarState: NSObject, ObservableObject {
  @Published var isDragging = false
  @Published var isHoveringBar = false
  @Published var currentNotification: FloatingBarNotification?
  @Published var showingAIConversation = false
  @Published var showingAIResponse = false
  @Published var isAILoading = false
  @Published var aiInputText = ""
  @Published var displayedQuery = ""
  @Published var inputViewHeight: CGFloat = 120
  @Published var responseContentHeight: CGFloat = 0
  @Published private(set) var responseContentHeights: [String: CGFloat] = [:]
  @Published var chatViewport = FloatingChatViewport()
  @Published private(set) var localAnswerOverride: ChatMessage?
  @Published var lastConversationActivityAt: Date?
  @Published var conversationSurface: FloatingConversationSurface = .closed
  @Published var usesNotchIsland = false
  @Published var notchRevealProgress: CGFloat = 1

  var isShowingNotification: Bool { currentNotification != nil }
  var hasMainConversation: Bool {
    !displayedQuery.isEmpty || localAnswerOverride != nil || chatViewport.questionMessageId != nil
      || chatViewport.answerMessageId != nil || !chatViewport.archivedExchanges.isEmpty
  }
  var hasVisibleConversation: Bool { showingAIConversation && conversationSurface.isOpen }

  var currentQuestionMessageId: String? {
    get { chatViewport.questionMessageId }
    set { chatViewport.questionMessageId = newValue }
  }

  func currentAIMessage(from provider: ChatProvider?) -> ChatMessage? {
    if let id = chatViewport.answerMessageId,
      let message = provider?.messages.first(where: { $0.id == id })
    {
      return message
    }
    return localAnswerOverride
  }

  func derivedChatHistory(from provider: ChatProvider?) -> [FloatingChatExchange] {
    guard let messages = provider?.messages else { return [] }
    return chatViewport.archivedExchanges.compactMap { pair in
      guard let answerID = pair.answerMessageId,
        let answer = messages.first(where: { $0.id == answerID })
      else { return nil }
      let question = pair.questionMessageId.flatMap { id in
        messages.first(where: { $0.id == id })?.text
      }
      return FloatingChatExchange(id: answer.id, question: question, aiMessage: answer)
    }
  }

  func beginTurn(clientTurnId: String, question: String) {
    chatViewport.archiveCurrentExchange()
    chatViewport.activeClientTurnId = clientTurnId
    displayedQuery = question
    localAnswerOverride = nil
    isAILoading = true
    present(.mainResponse)
    markConversationActivity()
  }

  func setLocalAnswerOverride(_ message: ChatMessage?) {
    localAnswerOverride = message
    if message != nil {
      isAILoading = false
      present(.mainResponse)
    }
  }

  func markConversationActivity(at date: Date = Date()) {
    lastConversationActivityAt = date
  }

  func present(_ surface: FloatingConversationSurface) {
    conversationSurface = surface
    showingAIConversation = surface.isOpen
    showingAIResponse = surface == .mainResponse
  }

  func hideConversationSurface() {
    present(.closed)
    isAILoading = false
  }

  func clearVisibleConversation(cancelInFlightWork: Bool = true) {
    chatViewport.clear()
    displayedQuery = ""
    localAnswerOverride = nil
    aiInputText = ""
    isAILoading = false
    responseContentHeight = 0
    responseContentHeights = [:]
    lastConversationActivityAt = nil
    present(.closed)
  }

  func reportContentHeight(_ height: CGFloat, for surface: FloatingConversationSurface) {
    let normalized = (max(0, height) * 2).rounded(.up) / 2
    let key = surface.measurementKey
    guard abs((responseContentHeights[key] ?? -1) - normalized) >= 0.5 else { return }
    responseContentHeights[key] = normalized
    if surface == conversationSurface {
      responseContentHeight = normalized
    }
  }

  func measuredContentHeight(for surface: FloatingConversationSurface) -> CGFloat? {
    responseContentHeights[surface.measurementKey]
  }
}
