import Foundation
@testable import IntentiveDesktopCore
import XCTest

final class RuntimeBridgeTests: XCTestCase {
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
  }
}

private final class FakeRuntimeSocket: RuntimeSocket {
  private(set) var connectedURL: URL?
  private(set) var sent: [Data] = []

  var sentTypes: [String] {
    sent.compactMap { data in
      guard
        let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let type = object["type"] as? String
      else {
        return nil
      }
      return type
    }
  }

  func connect(url: URL, jwt: String) throws {
    connectedURL = url
  }

  func send(_ data: Data) throws {
    sent.append(data)
  }

  func close() {}
}
