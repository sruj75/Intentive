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
  func acknowledge(messageId: String) throws {}
}
