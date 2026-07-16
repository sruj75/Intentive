import Combine
@testable import IntentiveDesktopNativeAssets
import XCTest

@MainActor
final class FloatingControlBarStateTests: XCTestCase {
  func testTextConversationHasOnlyClosedInputAndResponseSurfaces() {
    let state = FloatingControlBarState()

    state.present(.mainInput)
    XCTAssertTrue(state.hasVisibleConversation)
    XCTAssertTrue(state.showingAIConversation)
    XCTAssertFalse(state.showingAIResponse)

    state.beginTurn(clientTurnId: "turn-1", question: "What should I do next?")
    XCTAssertEqual(state.conversationSurface, .mainResponse)
    XCTAssertTrue(state.showingAIResponse)
    XCTAssertTrue(state.isAILoading)
    XCTAssertEqual(state.displayedQuery, "What should I do next?")

    state.hideConversationSurface()
    XCTAssertEqual(state.conversationSurface, .closed)
    XCTAssertFalse(state.hasVisibleConversation)
  }

  func testContentHeightReportsOnlyMeaningfulChanges() {
    let state = FloatingControlBarState()
    state.present(.mainResponse)
    var publishCount = 0
    let cancellable = state.$responseContentHeights.dropFirst().sink { _ in publishCount += 1 }

    state.reportContentHeight(120.1, for: .mainResponse)
    state.reportContentHeight(120.2, for: .mainResponse)
    state.reportContentHeight(121.0, for: .mainResponse)

    XCTAssertEqual(state.measuredContentHeight(for: .mainResponse), 121)
    XCTAssertEqual(state.responseContentHeight, 121)
    XCTAssertEqual(publishCount, 2)
    cancellable.cancel()
  }

  func testClearVisibleConversationResetsRuntimeProjectionAndPresentation() {
    let state = FloatingControlBarState()
    state.beginTurn(clientTurnId: "turn-1", question: "Question")
    state.setLocalAnswerOverride(ChatMessage(text: "Answer", sender: .ai))

    state.clearVisibleConversation()

    XCTAssertEqual(state.conversationSurface, .closed)
    XCTAssertFalse(state.showingAIConversation)
    XCTAssertFalse(state.isAILoading)
    XCTAssertEqual(state.displayedQuery, "")
    XCTAssertNil(state.localAnswerOverride)
  }

  func testRuntimeMessagesProjectIntoArchivedTextHistory() {
    let state = FloatingControlBarState()
    let provider = ChatProvider()
    provider.messages = [
      ChatMessage(id: "q1", text: "Question one", sender: .user),
      ChatMessage(id: "a1", text: "Answer one", sender: .ai),
    ]
    state.chatViewport.archivedExchanges = [
      FloatingChatExchangePair(questionMessageId: "q1", answerMessageId: "a1")
    ]

    let history = state.derivedChatHistory(from: provider)

    XCTAssertEqual(history.count, 1)
    XCTAssertEqual(history.first?.question, "Question one")
    XCTAssertEqual(history.first?.aiMessage.text, "Answer one")
  }
}
