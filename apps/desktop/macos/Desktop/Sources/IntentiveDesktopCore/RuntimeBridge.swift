import Foundation

public enum RuntimeConnectionStatus: Equatable, Sendable {
  case disconnected
  case routing
  case connecting
  case connected
  case gate(String)
  case reauthRequired
  case failed(String)
}

public struct RoutingInfo: Equatable, Sendable {
  public var webSocketURL: URL
  public var runtimeJWT: String
  public var retryAfterSeconds: Double?

  public init(webSocketURL: URL, runtimeJWT: String, retryAfterSeconds: Double? = nil) {
    self.webSocketURL = webSocketURL
    self.runtimeJWT = runtimeJWT
    self.retryAfterSeconds = retryAfterSeconds
  }
}

public enum MessageStatus: Equatable, Sendable {
  case pending
  case confirmed
  case failed(String)
}

public struct ChatMessage: Equatable, Identifiable, Sendable {
  public var id: String
  public var author: MessageAuthor
  public var body: String
  public var at: String
  public var status: MessageStatus
  public var viaPostMessageBack: Bool

  public init(
    id: String,
    author: MessageAuthor,
    body: String,
    at: String,
    status: MessageStatus,
    viaPostMessageBack: Bool = false
  ) {
    self.id = id
    self.author = author
    self.body = body
    self.at = at
    self.status = status
    self.viaPostMessageBack = viaPostMessageBack
  }
}

public final class MessageStore {
  public private(set) var messages: [ChatMessage]
  public private(set) var beforeCursor: String?

  public init(messages: [ChatMessage] = [], beforeCursor: String? = nil) {
    self.messages = messages
    self.beforeCursor = beforeCursor
  }

  public func replaceServerWindow(_ snapshot: SessionSnapshot) {
    messages = snapshot.messages.map(Self.serverMessage)
    beforeCursor = snapshot.beforeCursor
  }

  public func prependServerPage(_ snapshot: SessionSnapshot) {
    var byId = Dictionary(uniqueKeysWithValues: messages.map { ($0.id, $0) })
    let page = snapshot.messages.map(Self.serverMessage)
    for message in page {
      byId[message.id] = message
    }
    messages = dedupePreservingOrder(page + messages, byId: byId)
    beforeCursor = snapshot.beforeCursor
  }

  @discardableResult
  public func appendPending(_ userMessage: UserMessage) -> ChatMessage {
    let message = ChatMessage(
      id: userMessage.messageId,
      author: .user,
      body: userMessage.body,
      at: userMessage.sentAt,
      status: .pending
    )
    upsert(message)
    return message
  }

  public func confirmUserMessage(_ messageId: String) {
    updateStatus(messageId, status: .confirmed)
  }

  public func markFailed(_ messageId: String, reason: String) {
    updateStatus(messageId, status: .failed(reason))
  }

  public func appendCompanion(_ companion: CompanionMessage) {
    upsert(
      ChatMessage(
        id: companion.messageId,
        author: .companion,
        body: companion.body,
        at: companion.emittedAt,
        status: .confirmed,
        viaPostMessageBack: companion.viaPostMessageBack
      )
    )
  }

  public func message(id: String) -> ChatMessage? {
    messages.first { $0.id == id }
  }

  private func upsert(_ message: ChatMessage) {
    if let index = messages.firstIndex(where: { $0.id == message.id }) {
      messages[index] = message
    } else {
      messages.append(message)
    }
  }

  private func updateStatus(_ messageId: String, status: MessageStatus) {
    guard let index = messages.firstIndex(where: { $0.id == messageId }) else { return }
    messages[index].status = status
  }

  private static func serverMessage(_ message: SessionMessage) -> ChatMessage {
    ChatMessage(
      id: message.messageId,
      author: message.author,
      body: message.body,
      at: message.at,
      status: .confirmed,
      viaPostMessageBack: message.viaPostMessageBack
    )
  }

  private func dedupePreservingOrder(_ source: [ChatMessage], byId: [String: ChatMessage]) -> [ChatMessage] {
    var seen = Set<String>()
    var result: [ChatMessage] = []
    for message in source {
      guard !seen.contains(message.id), let canonical = byId[message.id] else { continue }
      seen.insert(message.id)
      result.append(canonical)
    }
    return result
  }
}

public protocol RuntimeSocket: AnyObject {
  func connect(url: URL, jwt: String) throws
  func send(_ data: Data) throws
  func close()
}

public protocol RuntimeChatClient: AnyObject {
  @discardableResult
  func sendUserMessage(_ body: String) throws -> ChatMessage
  func sendPerceptionEvent(_ event: PerceptionEvent) throws
  func acknowledge(messageId: String) throws
}

public final class DisconnectedRuntimeChatClient: RuntimeChatClient {
  public private(set) var attemptedMessages: [String] = []

  public init() {}

  @discardableResult
  public func sendUserMessage(_ body: String) throws -> ChatMessage {
    attemptedMessages.append(body)
    return ChatMessage(
      id: "disconnected-\(attemptedMessages.count)",
      author: .user,
      body: body,
      at: Date().protocolTimestamp,
      status: .failed("Runtime Bridge is not connected.")
    )
  }

  public func sendPerceptionEvent(_ event: PerceptionEvent) throws {}
  public func acknowledge(messageId: String) throws {}
}

public final class RuntimeAdapter: RuntimeChatClient {
  public static let backoffScheduleMilliseconds = [250, 500, 1_000, 2_000, 5_000]

  public private(set) var status: RuntimeConnectionStatus = .disconnected
  public private(set) var connectionGeneration: Int = 0
  public let messageStore: MessageStore

  private let socket: RuntimeSocket
  private let clientVersion: String
  private let now: () -> Date
  private var outboundQueue: [Data] = []
  private var pendingUserMessages: [String: UserMessage] = [:]

  public init(
    socket: RuntimeSocket,
    messageStore: MessageStore = MessageStore(),
    clientVersion: String,
    now: @escaping () -> Date = Date.init
  ) {
    self.socket = socket
    self.messageStore = messageStore
    self.clientVersion = clientVersion
    self.now = now
  }

  public func connect(routing: RoutingInfo, timeZone: TimeZone = .current) throws {
    connectionGeneration += 1
    status = .connecting
    try socket.connect(url: routing.webSocketURL, jwt: routing.runtimeJWT)
    let connect = ConnectEvent(clientVersion: clientVersion, clientTz: timeZone.identifier)
    try socket.send(ProtocolEventCodec.encode(connect))
  }

  public func disconnect() {
    connectionGeneration += 1
    status = .disconnected
    outboundQueue.removeAll()
    socket.close()
  }

  public func handleSocketEvent(_ data: Data, generation: Int? = nil) throws {
    if let generation, generation != connectionGeneration {
      return
    }
    let event = try ProtocolEventCodec.decodeRuntimeToClientEvent(data)
    switch event {
    case .helloOk(let hello):
      status = .connected
      messageStore.replaceServerWindow(hello.sessionSnapshot)
      try flushOutboundQueue()
    case .companionMessage(let companion):
      messageStore.appendCompanion(companion)
      try acknowledge(messageId: companion.messageId)
    }
  }

  @discardableResult
  public func sendUserMessage(_ body: String) throws -> ChatMessage {
    let message = UserMessage(
      messageId: "desktop_\(UUID().uuidString)",
      body: body,
      sentAt: now().protocolTimestamp
    )
    pendingUserMessages[message.messageId] = message
    let rendered = messageStore.appendPending(message)
    try sendOrQueue(ProtocolEventCodec.encode(message))
    return rendered
  }

  public func retryUserMessage(_ messageId: String) throws {
    guard let message = pendingUserMessages[messageId] else { return }
    try sendOrQueue(ProtocolEventCodec.encode(message))
  }

  public func sendPerceptionEvent(_ event: PerceptionEvent) throws {
    try sendOrQueue(ProtocolEventCodec.encode(event))
  }

  public func sendPresence(foreground: Bool) throws {
    try sendOrQueue(
      ProtocolEventCodec.encode(
        PresenceUpdate(foreground: foreground, sentAt: now().protocolTimestamp)
      )
    )
  }

  public func acknowledge(messageId: String) throws {
    try sendOrQueue(
      ProtocolEventCodec.encode(
        DeliveryAck(messageId: messageId, receivedAt: now().protocolTimestamp)
      )
    )
  }

  private func sendOrQueue(_ data: Data) throws {
    guard status == .connected else {
      outboundQueue.append(data)
      return
    }
    try socket.send(data)
  }

  private func flushOutboundQueue() throws {
    let pending = outboundQueue
    outboundQueue.removeAll()
    for data in pending {
      try socket.send(data)
    }
  }
}
