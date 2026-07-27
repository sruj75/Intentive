import Foundation
import IntentiveDesktopCore

final class AlreadyAcknowledgedRuntimeClient: RuntimeChatClient {
  @discardableResult
  func sendUserMessage(_ body: String) throws -> ChatMessage {
    ChatMessage(
      id: "already-acknowledged-\(UUID().uuidString)",
      author: .user,
      body: body,
      at: Date().protocolTimestamp,
      status: .failed("Runtime message sending is not available from this sink.")
    )
  }

  func sendPerceptionEvent(_ event: PerceptionEvent) throws {}
  func sendPerceptionTombstone(_ tombstone: PerceptionTombstone) throws {}
  func sendSessionEndMarker(_ marker: SessionEndMarker) throws {}
  func acknowledge(messageId: String) throws {}
}

@MainActor
final class DesktopCoachingWindowEffectAdapter: DesktopCoachingWindowEffects {
  private let publisher: () -> PerceptionPublisher
  private let startPerceptionAction: (String) -> Void
  private let stopPerceptionAction: () -> Void
  private let finalizePerceptionAction: (CoachingWindowEndReason) -> Void
  private let onWindowStarted: (CoachingWindowStarted) -> Void
  private let onWindowEnded: (CoachingWindowEnded) -> Void

  init(
    publisher: @escaping () -> PerceptionPublisher,
    startPerception: @escaping (String) -> Void,
    stopPerception: @escaping () -> Void,
    finalizePerception: @escaping (CoachingWindowEndReason) -> Void,
    onWindowStarted: @escaping (CoachingWindowStarted) -> Void = { _ in },
    onWindowEnded: @escaping (CoachingWindowEnded) -> Void = { _ in }
  ) {
    self.publisher = publisher
    self.startPerceptionAction = startPerception
    self.stopPerceptionAction = stopPerception
    self.finalizePerceptionAction = finalizePerception
    self.onWindowStarted = onWindowStarted
    self.onWindowEnded = onWindowEnded
  }

  func enqueueWindowStarted(_ event: CoachingWindowStarted) throws {
    try publisher().publishWindowStarted(event)
    onWindowStarted(event)
  }

  func enqueueWindowEnded(_ event: CoachingWindowEnded) throws {
    finalizePerceptionAction(event.reason)
    try publisher().publishWindowEnded(event)
    onWindowEnded(event)
  }

  func sendWindowPresence(_ event: CoachingWindowPresence) throws {
    try publisher().publishWindowPresence(event)
  }

  func startPerception(windowId: String) {
    startPerceptionAction(windowId)
  }

  func stopPerception() {
    stopPerceptionAction()
  }
}
