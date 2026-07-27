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
    let serverMessages = snapshot.messages.map(Self.serverMessage)
    let serverIds = Set(serverMessages.map(\.id))
    let pendingLocalMessages = messages.filter { message in
      guard message.author == .user, case .pending = message.status else { return false }
      return !serverIds.contains(message.id)
    }
    messages = serverMessages + pendingLocalMessages
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

  @discardableResult
  public func appendCompanion(_ companion: CompanionMessage) -> Bool {
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

  @discardableResult
  private func upsert(_ message: ChatMessage) -> Bool {
    if let index = messages.firstIndex(where: { $0.id == message.id }) {
      messages[index] = message
      return false
    } else {
      messages.append(message)
      return true
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
  func sendPerceptionTombstone(_ tombstone: PerceptionTombstone) throws
  func sendSessionEndMarker(_ marker: SessionEndMarker) throws
  func sendCoachingWindowStarted(_ event: CoachingWindowStarted) throws
  func sendCoachingWindowEnded(_ event: CoachingWindowEnded) throws
  func sendCoachingWindowPresence(_ event: CoachingWindowPresence) throws
  func acknowledge(messageId: String) throws
}

public extension RuntimeChatClient {
  func sendCoachingWindowStarted(_ event: CoachingWindowStarted) throws {}
  func sendCoachingWindowEnded(_ event: CoachingWindowEnded) throws {}
  func sendCoachingWindowPresence(_ event: CoachingWindowPresence) throws {}
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
  public func sendPerceptionTombstone(_ tombstone: PerceptionTombstone) throws {}
  public func sendSessionEndMarker(_ marker: SessionEndMarker) throws {}
  public func sendCoachingWindowStarted(_ event: CoachingWindowStarted) throws {}
  public func sendCoachingWindowEnded(_ event: CoachingWindowEnded) throws {}
  public func sendCoachingWindowPresence(_ event: CoachingWindowPresence) throws {}
  public func acknowledge(messageId: String) throws {}
}

public final class RuntimeAdapter: RuntimeChatClient {
  public static let backoffScheduleMilliseconds = [250, 500, 1_000, 2_000, 5_000]

  public private(set) var status: RuntimeConnectionStatus = .disconnected
  public private(set) var connectionGeneration: Int = 0
  public let messageStore: MessageStore
  public var onCompanionMessage: ((CompanionMessage) -> Void)?
  /// Sink for durable-ingress acknowledgements. The durable outbox observes this
  /// to delete an item only once the Runtime confirms its ledger/projection
  /// transaction committed — not merely because the socket accepted the send.
  public var onIngressAck: ((RuntimeIngressAck) -> Void)?

  private let socket: RuntimeSocket
  private let clientVersion: String
  private let clientCapabilities: [ClientCapability]?
  private let now: () -> Date
  private let activeCoachingWindowId: () -> String?
  private var outboundQueue: [Data] = []
  private var pendingUserMessages: [String: UserMessage] = [:]

  public init(
    socket: RuntimeSocket,
    messageStore: MessageStore = MessageStore(),
    clientVersion: String,
    clientCapabilities: [ClientCapability]? = nil,
    activeCoachingWindowId: @escaping () -> String? = { nil },
    now: @escaping () -> Date = Date.init
  ) {
    self.socket = socket
    self.messageStore = messageStore
    self.clientVersion = clientVersion
    self.clientCapabilities = clientCapabilities
    self.activeCoachingWindowId = activeCoachingWindowId
    self.now = now
  }

  public func connect(routing: RoutingInfo, timeZone: TimeZone = .current) throws {
    connectionGeneration += 1
    status = .connecting
    try socket.connect(url: routing.webSocketURL, jwt: routing.runtimeJWT)
    let connect = ConnectEvent(
      authToken: routing.runtimeJWT,
      clientVersion: clientVersion,
      clientTz: timeZone.identifier,
      capabilities: clientCapabilities
    )
    try socket.send(ProtocolEventCodec.encode(connect))
  }

  public func disconnect() {
    connectionGeneration += 1
    status = .disconnected
    outboundQueue.removeAll()
    failPendingUserMessages(reason: "Runtime Bridge disconnected.")
    socket.close()
  }

  public func markConnectionLost(reason: String? = nil) {
    connectionGeneration += 1
    status = reason.map(RuntimeConnectionStatus.failed) ?? .disconnected
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
    case .historyBackfillResponse(let response):
      messageStore.prependServerPage(response.sessionSnapshot)
    case .companionMessage(let companion):
      if companion.viaPostMessageBack, companion.windowId != nil {
        // Coaching delivery is not acknowledged at socket receipt. The
        // MainActor effect runner performs the final matching-window check,
        // projects it into the transcript, presents (or dedupes) the effect,
        // and only then acknowledges it.
        // Every retry must reach that guard because an earlier queued effect
        // may have been suppressed by Pause, lock, or window replacement.
        onCompanionMessage?(companion)
      } else {
        let isNewMessage = messageStore.appendCompanion(companion)
        if isNewMessage {
          onCompanionMessage?(companion)
        }
        try acknowledge(messageId: companion.messageId)
      }
    case .runtimeIngressAck(let ack):
      onIngressAck?(ack)
    case .runtimeError(let error):
      status = .failed(error.message)
    }
  }

  @discardableResult
  public func sendUserMessage(_ body: String) throws -> ChatMessage {
    let message = UserMessage(
      messageId: "desktop_\(UUID().uuidString)",
      body: body,
      sentAt: now().protocolTimestamp,
      windowId: activeCoachingWindowId()
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
    try sendDurableIngress(ProtocolEventCodec.encode(event))
  }

  public func sendPerceptionTombstone(_ tombstone: PerceptionTombstone) throws {
    try sendDurableIngress(ProtocolEventCodec.encode(tombstone))
  }

  public func sendSessionEndMarker(_ marker: SessionEndMarker) throws {
    try sendDurableIngress(ProtocolEventCodec.encode(marker))
  }

  public func sendCoachingWindowStarted(_ event: CoachingWindowStarted) throws {
    try sendDurableIngress(ProtocolEventCodec.encode(event))
  }

  public func sendCoachingWindowEnded(_ event: CoachingWindowEnded) throws {
    try sendDurableIngress(ProtocolEventCodec.encode(event))
  }

  public func sendCoachingWindowPresence(_ event: CoachingWindowPresence) throws {
    try sendOrQueue(ProtocolEventCodec.encode(event))
  }

  public func sendPresence(foreground: Bool) throws {
    try sendOrQueue(
      ProtocolEventCodec.encode(
        PresenceUpdate(foreground: foreground)
      )
    )
  }

  public func acknowledge(messageId: String) throws {
    try sendOrQueue(
      ProtocolEventCodec.encode(
        DeliveryAck(messageId: messageId)
      )
    )
  }

  @discardableResult
  public func requestHistoryBackfill(limit: Int? = nil) throws -> Bool {
    guard let beforeCursor = messageStore.beforeCursor else { return false }
    try sendOrQueue(
      ProtocolEventCodec.encode(
        HistoryBackfillRequest(beforeCursor: beforeCursor, limit: limit)
      )
    )
    return true
  }

  private func sendOrQueue(_ data: Data) throws {
    guard status == .connected else {
      outboundQueue.append(data)
      return
    }
    try socket.send(data)
  }

  /// Durable ingress (`perception_event`, `perception_tombstone`,
  /// `session_end_marker`) bypasses `outboundQueue`. The SQLite outbox (via
  /// `PerceptionPublisher`) owns redelivery keyed by `(ingress_kind, ingress_id)`
  /// and keeps every item until a `runtime_ingress_ack` deletes it, so a send
  /// while disconnected is a no-op here rather than an ephemeral enqueue that
  /// could reorder an event behind its later tombstone. `outboundQueue` remains
  /// only for ephemeral connection traffic (connect, delivery acks, presence,
  /// history backfill).
  private func sendDurableIngress(_ data: Data) throws {
    guard status == .connected else { return }
    try socket.send(data)
  }

  private func flushOutboundQueue() throws {
    let pending = outboundQueue
    outboundQueue.removeAll()
    for data in pending {
      try socket.send(data)
    }
  }

  private func failPendingUserMessages(reason: String) {
    for messageId in pendingUserMessages.keys {
      messageStore.markFailed(messageId, reason: reason)
    }
    pendingUserMessages.removeAll()
  }
}
