import Foundation
@testable import IntentiveDesktopCore
import XCTest

final class RuntimeBridgeTests: XCTestCase {
  func testFloatingBarControllerSubmitsTrimmedMessageToSharedStore() throws {
    let store = MessageStore()
    let runtime = RecordingFloatingBarRuntimeClient(messageStore: store)
    let controller = FloatingBarController(runtimeClient: runtime, messageStore: store)

    let message = try controller.submit("  hello from floating bar  ")

    XCTAssertEqual(runtime.userMessages, ["hello from floating bar"])
    XCTAssertEqual(message.body, "hello from floating bar")
    XCTAssertEqual(controller.messages.map(\.body), ["hello from floating bar"])
  }

  func testFloatingBarControllerRejectsEmptyDraft() {
    let store = MessageStore()
    let runtime = RecordingFloatingBarRuntimeClient(messageStore: store)
    let controller = FloatingBarController(runtimeClient: runtime, messageStore: store)

    XCTAssertThrowsError(try controller.submit(" \n\t ")) { error in
      XCTAssertEqual(error as? FloatingBarSubmissionError, .emptyMessage)
    }
    XCTAssertTrue(runtime.userMessages.isEmpty)
    XCTAssertTrue(controller.messages.isEmpty)
  }

  func testFloatingConversationProjectsRuntimeHistoryForCloseAndReopen() {
    let store = MessageStore()
    store.replaceServerWindow(
      SessionSnapshot(
        messages: [
          SessionMessage(messageId: "u1", author: .user, body: "First", at: "2026-07-16T00:00:00.000Z"),
          SessionMessage(messageId: "c1", author: .companion, body: "One", at: "2026-07-16T00:00:01.000Z"),
          SessionMessage(messageId: "u2", author: .user, body: "Second", at: "2026-07-16T00:00:02.000Z"),
          SessionMessage(messageId: "c2", author: .companion, body: "Two", at: "2026-07-16T00:00:03.000Z"),
        ],
        beforeCursor: "older"
      )
    )
    let controller = FloatingBarController(
      runtimeClient: RecordingFloatingBarRuntimeClient(messageStore: store),
      messageStore: store
    )

    let firstOpen = controller.conversation
    let reopened = controller.conversation

    XCTAssertEqual(firstOpen, reopened)
    XCTAssertEqual(firstOpen.exchanges.count, 2)
    XCTAssertEqual(firstOpen.exchanges[0].question?.id, "u1")
    XCTAssertEqual(firstOpen.exchanges[0].answer?.id, "c1")
    XCTAssertEqual(firstOpen.exchanges[1].question?.id, "u2")
    XCTAssertEqual(firstOpen.exchanges[1].answer?.id, "c2")
  }

  func testFloatingConversationKeepsPendingQuestionWithoutInventingAnswer() {
    let store = MessageStore()
    _ = store.appendPending(
      UserMessage(messageId: "pending", body: "Still sending", sentAt: "2026-07-16T00:00:00.000Z")
    )
    let controller = FloatingBarController(
      runtimeClient: RecordingFloatingBarRuntimeClient(messageStore: store),
      messageStore: store
    )

    XCTAssertEqual(controller.conversation.exchanges.count, 1)
    XCTAssertEqual(controller.conversation.exchanges[0].question?.id, "pending")
    XCTAssertNil(controller.conversation.exchanges[0].answer)
  }

  func testQueuesOutboundUntilHelloOkThenFlushesInOrder() throws {
    let socket = FakeRuntimeSocket()
    let adapter = RuntimeAdapter(socket: socket, clientVersion: "test")
    try adapter.connect(routing: RoutingInfo(webSocketURL: URL(string: "wss://runtime.test")!, runtimeJWT: "jwt"))

    let message = try adapter.sendUserMessage("hello from Mac")
    XCTAssertEqual(adapter.messageStore.message(id: message.id)?.status, .pending)
    XCTAssertEqual(socket.sentTypes, ["connect"])

    let hello = HelloOk(sessionSnapshot: SessionSnapshot(messages: [], beforeCursor: nil))
    try adapter.handleSocketEvent(ProtocolEventCodec.encode(hello))

    XCTAssertEqual(adapter.status, .connected)
    XCTAssertEqual(socket.sentTypes, ["connect", "user_message"])
  }

  func testHelloOkPreservesPendingLocalUserMessagesMissingFromServerWindow() throws {
    let store = MessageStore()
    let pending = UserMessage(
      messageId: "desktop-pending",
      body: "still local",
      sentAt: "2026-07-06T00:00:01.000Z"
    )
    _ = store.appendPending(pending)

    store.replaceServerWindow(
      SessionSnapshot(
        messages: [
          SessionMessage(
            messageId: "server-reply",
            author: .companion,
            body: "server",
            at: "2026-07-06T00:00:02.000Z"
          )
        ],
        beforeCursor: nil
      )
    )

    XCTAssertEqual(store.messages.map(\.id), ["server-reply", "desktop-pending"])
    XCTAssertEqual(store.message(id: "desktop-pending")?.status, .pending)
  }

  func testConnectFrameIdentifiesDesktopAndCarriesRuntimeJWT() throws {
    let socket = FakeRuntimeSocket()
    let adapter = RuntimeAdapter(socket: socket, clientVersion: "desktop-test")

    try adapter.connect(
      routing: RoutingInfo(webSocketURL: URL(string: "wss://runtime.test")!, runtimeJWT: "runtime-jwt"),
      timeZone: TimeZone(identifier: "Asia/Kolkata")!
    )

    XCTAssertEqual(socket.connectedURL, URL(string: "wss://runtime.test")!)
    XCTAssertEqual(socket.connectedJWT, "runtime-jwt")
    let connect = try XCTUnwrap(socket.sentObjects.first)
    XCTAssertEqual(connect["type"] as? String, "connect")
    XCTAssertEqual(connect["auth_token"] as? String, "runtime-jwt")
    XCTAssertEqual(connect["client_kind"] as? String, "desktop")
    XCTAssertEqual(connect["client_version"] as? String, "desktop-test")
    XCTAssertEqual(connect["client_tz"] as? String, "Asia/Kolkata")
  }

  func testGenerationGuardIgnoresStaleEvents() throws {
    let socket = FakeRuntimeSocket()
    let adapter = RuntimeAdapter(socket: socket, clientVersion: "test")
    try adapter.connect(routing: RoutingInfo(webSocketURL: URL(string: "wss://runtime.test")!, runtimeJWT: "jwt"))
    let staleGeneration = adapter.connectionGeneration
    try adapter.connect(routing: RoutingInfo(webSocketURL: URL(string: "wss://runtime.test")!, runtimeJWT: "jwt"))

    let companion = CompanionMessage(messageId: "c1", body: "stale", emittedAt: Date().protocolTimestamp)
    try adapter.handleSocketEvent(ProtocolEventCodec.encode(companion), generation: staleGeneration)
    XCTAssertNil(adapter.messageStore.message(id: "c1"))

    try adapter.handleSocketEvent(ProtocolEventCodec.encode(companion), generation: adapter.connectionGeneration)
    XCTAssertEqual(adapter.messageStore.message(id: "c1")?.body, "stale")
  }

  func testCompanionMessageSendsDeliveryAck() throws {
    let socket = FakeRuntimeSocket()
    let adapter = RuntimeAdapter(socket: socket, clientVersion: "test")
    try adapter.connect(routing: RoutingInfo(webSocketURL: URL(string: "wss://runtime.test")!, runtimeJWT: "jwt"))
    try adapter.handleSocketEvent(
      ProtocolEventCodec.encode(HelloOk(sessionSnapshot: SessionSnapshot(messages: [], beforeCursor: nil)))
    )

    let companion = CompanionMessage(messageId: "c1", body: "reply", emittedAt: Date().protocolTimestamp)
    try adapter.handleSocketEvent(ProtocolEventCodec.encode(companion))

    XCTAssertEqual(socket.sentTypes.suffix(1), ["delivery_ack"])
    let ack = try XCTUnwrap(socket.sentObjects.last)
    XCTAssertEqual(Set(ack.keys), Set(["type", "message_id"]))
    XCTAssertEqual(ack["message_id"] as? String, "c1")
  }

  func testCompanionMessageNotifiesLiveHandler() throws {
    let socket = FakeRuntimeSocket()
    let adapter = RuntimeAdapter(socket: socket, clientVersion: "test")
    var received: [CompanionMessage] = []
    adapter.onCompanionMessage = { received.append($0) }
    try adapter.connect(routing: RoutingInfo(webSocketURL: URL(string: "wss://runtime.test")!, runtimeJWT: "jwt"))
    try adapter.handleSocketEvent(
      ProtocolEventCodec.encode(HelloOk(sessionSnapshot: SessionSnapshot(messages: [], beforeCursor: nil)))
    )

    let companion = CompanionMessage(
      messageId: "pmb-1",
      body: "runtime nudge",
      emittedAt: Date().protocolTimestamp,
      viaPostMessageBack: true
    )
    try adapter.handleSocketEvent(ProtocolEventCodec.encode(companion))

    XCTAssertEqual(received.map(\.messageId), ["pmb-1"])
    XCTAssertEqual(received.first?.viaPostMessageBack, true)
  }

  func testPresenceUpdateMatchesStrictProtocolShape() throws {
    let socket = FakeRuntimeSocket()
    let adapter = RuntimeAdapter(socket: socket, clientVersion: "test")
    try adapter.connect(routing: RoutingInfo(webSocketURL: URL(string: "wss://runtime.test")!, runtimeJWT: "jwt"))
    try adapter.handleSocketEvent(
      ProtocolEventCodec.encode(HelloOk(sessionSnapshot: SessionSnapshot(messages: [], beforeCursor: nil)))
    )

    try adapter.sendPresence(foreground: true)

    let presence = try XCTUnwrap(socket.sentObjects.last)
    XCTAssertEqual(Set(presence.keys), Set(["type", "foreground"]))
    XCTAssertEqual(presence["type"] as? String, "presence_update")
    XCTAssertEqual(presence["foreground"] as? Bool, true)
  }

  func testHistoryBackfillRequestAndResponsePrependsServerPage() throws {
    let socket = FakeRuntimeSocket()
    let adapter = RuntimeAdapter(socket: socket, clientVersion: "test")
    try adapter.connect(routing: RoutingInfo(webSocketURL: URL(string: "wss://runtime.test")!, runtimeJWT: "jwt"))
    try adapter.handleSocketEvent(
      ProtocolEventCodec.encode(
        HelloOk(
          sessionSnapshot: SessionSnapshot(
            messages: [
              SessionMessage(
                messageId: "newer",
                author: .companion,
                body: "newer",
                at: "2026-07-06T00:00:02.000Z"
              )
            ],
            beforeCursor: "42"
          )
        )
      )
    )

    let requested = try adapter.requestHistoryBackfill(limit: 25)

    XCTAssertTrue(requested)
    let request = try XCTUnwrap(socket.sentObjects.last)
    XCTAssertEqual(request["type"] as? String, "history_backfill_request")
    XCTAssertEqual(request["before_cursor"] as? String, "42")
    XCTAssertEqual(request["limit"] as? Int, 25)

    try adapter.handleSocketEvent(
      ProtocolEventCodec.encode(
        HistoryBackfillResponse(
          sessionSnapshot: SessionSnapshot(
            messages: [
              SessionMessage(
                messageId: "older",
                author: .user,
                body: "older",
                at: "2026-07-06T00:00:01.000Z"
              )
            ],
            beforeCursor: "7"
          )
        )
      )
    )

    XCTAssertEqual(adapter.messageStore.messages.map(\.id), ["older", "newer"])
    XCTAssertEqual(adapter.messageStore.beforeCursor, "7")
  }

  func testHistoryBackfillRequestNoopsWithoutCursor() throws {
    let socket = FakeRuntimeSocket()
    let adapter = RuntimeAdapter(socket: socket, clientVersion: "test")
    try adapter.connect(routing: RoutingInfo(webSocketURL: URL(string: "wss://runtime.test")!, runtimeJWT: "jwt"))
    try adapter.handleSocketEvent(
      ProtocolEventCodec.encode(HelloOk(sessionSnapshot: SessionSnapshot(messages: [], beforeCursor: nil)))
    )

    let requested = try adapter.requestHistoryBackfill()

    XCTAssertFalse(requested)
    XCTAssertFalse(socket.sentTypes.contains("history_backfill_request"))
  }

  func testRuntimeErrorSetsFailedStatus() throws {
    let socket = FakeRuntimeSocket()
    let adapter = RuntimeAdapter(socket: socket, clientVersion: "test")
    try adapter.connect(routing: RoutingInfo(webSocketURL: URL(string: "wss://runtime.test")!, runtimeJWT: "jwt"))

    try adapter.handleSocketEvent(
      ProtocolEventCodec.encode(RuntimeError(code: .invalidConnect, message: "bad connect"))
    )

    XCTAssertEqual(adapter.status, .failed("bad connect"))
  }

  func testConnectionLossPreservesQueuedUserMessageForReconnect() throws {
    let socket = FakeRuntimeSocket()
    let adapter = RuntimeAdapter(socket: socket, clientVersion: "test")
    try adapter.connect(routing: RoutingInfo(webSocketURL: URL(string: "wss://runtime.test")!, runtimeJWT: "jwt-1"))
    try adapter.handleSocketEvent(
      ProtocolEventCodec.encode(HelloOk(sessionSnapshot: SessionSnapshot(messages: [], beforeCursor: nil)))
    )
    let generationBeforeLoss = adapter.connectionGeneration

    adapter.markConnectionLost(reason: "network dropped")
    let queued = try adapter.sendUserMessage("keep this turn")

    XCTAssertEqual(adapter.status, .failed("network dropped"))
    XCTAssertEqual(adapter.connectionGeneration, generationBeforeLoss + 1)
    XCTAssertEqual(adapter.messageStore.message(id: queued.id)?.status, .pending)
    XCTAssertEqual(socket.sentTypes, ["connect"])
    XCTAssertEqual(socket.closeCount, 1)

    try adapter.connect(routing: RoutingInfo(webSocketURL: URL(string: "wss://runtime.test")!, runtimeJWT: "jwt-2"))
    XCTAssertEqual(socket.sentTypes, ["connect", "connect"])

    try adapter.handleSocketEvent(
      ProtocolEventCodec.encode(HelloOk(sessionSnapshot: SessionSnapshot(messages: [], beforeCursor: nil)))
    )

    XCTAssertEqual(adapter.status, .connected)
    XCTAssertEqual(socket.sentTypes, ["connect", "connect", "user_message"])
    let userMessage = try XCTUnwrap(socket.sentObjects.last)
    XCTAssertEqual(userMessage["body"] as? String, "keep this turn")
  }

  func testExplicitDisconnectClearsQueuedUserMessageAndFailsPendingBubble() throws {
    let socket = FakeRuntimeSocket()
    let adapter = RuntimeAdapter(socket: socket, clientVersion: "test")
    try adapter.connect(routing: RoutingInfo(webSocketURL: URL(string: "wss://runtime.test")!, runtimeJWT: "jwt-1"))

    let queued = try adapter.sendUserMessage("discard on sign out")
    adapter.disconnect()

    XCTAssertEqual(adapter.status, .disconnected)
    XCTAssertEqual(
      adapter.messageStore.message(id: queued.id)?.status,
      .failed("Runtime Bridge disconnected.")
    )

    try adapter.connect(routing: RoutingInfo(webSocketURL: URL(string: "wss://runtime.test")!, runtimeJWT: "jwt-2"))
    try adapter.handleSocketEvent(
      ProtocolEventCodec.encode(HelloOk(sessionSnapshot: SessionSnapshot(messages: [], beforeCursor: nil)))
    )

    XCTAssertEqual(socket.sentTypes, ["connect", "connect"])
  }

  func testSessionEndMarkerMatchesStrictProtocolShape() throws {
    let socket = FakeRuntimeSocket()
    let adapter = RuntimeAdapter(
      socket: socket,
      clientVersion: "test",
      now: { ISO8601DateFormatter.intentiveProtocol.date(from: "2026-07-06T00:00:00.000Z")! }
    )
    try adapter.connect(routing: RoutingInfo(webSocketURL: URL(string: "wss://runtime.test")!, runtimeJWT: "jwt"))
    try adapter.handleSocketEvent(
      ProtocolEventCodec.encode(HelloOk(sessionSnapshot: SessionSnapshot(messages: [], beforeCursor: nil)))
    )

    try adapter.sendSessionEnd(reason: .quit)

    let marker = try XCTUnwrap(socket.sentObjects.last)
    XCTAssertEqual(Set(marker.keys), Set(["type", "ended_at", "reason"]))
    XCTAssertEqual(marker["type"] as? String, "session_end_marker")
    XCTAssertEqual(marker["reason"] as? String, "quit")
  }
}

private final class FakeRuntimeSocket: RuntimeSocket {
  private(set) var connectedURL: URL?
  private(set) var connectedJWT: String?
  private(set) var sent: [Data] = []
  private(set) var closeCount = 0

  var sentTypes: [String] {
    sentObjects.compactMap { $0["type"] as? String }
  }

  var sentObjects: [[String: Any]] {
    sent.compactMap { data in
      try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }
  }

  func connect(url: URL, jwt: String) throws {
    connectedURL = url
    connectedJWT = jwt
  }

  func send(_ data: Data) throws {
    sent.append(data)
  }

  func close() {
    closeCount += 1
  }
}

private final class RecordingFloatingBarRuntimeClient: RuntimeChatClient {
  private let messageStore: MessageStore
  private(set) var userMessages: [String] = []

  init(messageStore: MessageStore) {
    self.messageStore = messageStore
  }

  @discardableResult
  func sendUserMessage(_ body: String) throws -> ChatMessage {
    userMessages.append(body)
    let user = UserMessage(messageId: "floating-\(userMessages.count)", body: body, sentAt: Date().protocolTimestamp)
    let message = messageStore.appendPending(user)
    messageStore.confirmUserMessage(user.messageId)
    return message
  }

  func sendPerceptionEvent(_ event: PerceptionEvent) throws {}
  func sendPerceptionTombstone(_ tombstone: PerceptionTombstone) throws {}
  func acknowledge(messageId: String) throws {}
}
