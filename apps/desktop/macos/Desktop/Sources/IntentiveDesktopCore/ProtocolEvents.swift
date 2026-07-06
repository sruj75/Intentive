import Foundation

public enum ClientKind: String, Codable, Equatable, Sendable {
  case mobile
  case desktop
}

public enum ProtocolEventError: Error, Equatable, LocalizedError {
  case invalidTopLevel
  case missingType
  case unsupportedType(String)
  case unknownKeys(type: String, keys: [String])
  case invalidEmbeddingDimension(expected: Int, actual: Int)
  case payloadContainsRawFrameBytes

  public var errorDescription: String? {
    switch self {
    case .invalidTopLevel:
      return "Protocol event must be a JSON object."
    case .missingType:
      return "Protocol event is missing a type field."
    case .unsupportedType(let type):
      return "Unsupported protocol event type: \(type)."
    case .unknownKeys(let type, let keys):
      return "Protocol event \(type) contains unknown keys: \(keys.joined(separator: ", "))."
    case .invalidEmbeddingDimension(let expected, let actual):
      return "Embedding vector length \(actual) does not match dim \(expected)."
    case .payloadContainsRawFrameBytes:
      return "Perception events must not contain raw frame bytes."
    }
  }
}

public enum JSONValue: Codable, Equatable, Sendable {
  case string(String)
  case number(Double)
  case bool(Bool)
  case object([String: JSONValue])
  case array([JSONValue])
  case null

  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .null
    } else if let value = try? container.decode(Bool.self) {
      self = .bool(value)
    } else if let value = try? container.decode(Double.self) {
      self = .number(value)
    } else if let value = try? container.decode(String.self) {
      self = .string(value)
    } else if let value = try? container.decode([JSONValue].self) {
      self = .array(value)
    } else {
      self = .object(try container.decode([String: JSONValue].self))
    }
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .string(let value):
      try container.encode(value)
    case .number(let value):
      try container.encode(value)
    case .bool(let value):
      try container.encode(value)
    case .object(let value):
      try container.encode(value)
    case .array(let value):
      try container.encode(value)
    case .null:
      try container.encodeNil()
    }
  }
}

public enum ArtifactType: String, Codable, Equatable, CaseIterable, Sendable {
  case searchableScreenRecord = "searchable_screen_record"
  case focusSignal = "focus_signal"
  case activitySummary = "activity_summary"
}

public enum SensitivityLabel: String, Codable, Equatable, Sendable {
  case normal
  case sensitive
  case secretDetected = "secret_detected"
}

public struct PerceptionEmbeddingRef: Codable, Equatable, Sendable {
  public var modelId: String
  public var dim: Int
  public var vector: [Double]

  public init(modelId: String, dim: Int, vector: [Double]) throws {
    guard dim == vector.count else {
      throw ProtocolEventError.invalidEmbeddingDimension(expected: dim, actual: vector.count)
    }
    self.modelId = modelId
    self.dim = dim
    self.vector = vector
  }

  enum CodingKeys: String, CodingKey {
    case modelId = "model_id"
    case dim
    case vector
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let modelId = try container.decode(String.self, forKey: .modelId)
    let dim = try container.decode(Int.self, forKey: .dim)
    let vector = try container.decode([Double].self, forKey: .vector)
    try self.init(modelId: modelId, dim: dim, vector: vector)
  }
}

public struct PerceptionEvent: Codable, Equatable, Sendable {
  public let type: String
  public var eventId: String
  public var sourceClient: ClientKind
  public var capturedAt: String
  public var periodStart: String
  public var periodEnd: String
  public var artifactType: ArtifactType
  public var summary: String
  public var signals: [String: JSONValue]
  public var embeddingRef: PerceptionEmbeddingRef?
  public var sensitivityLabel: SensitivityLabel
  public var retentionClass: String
  public var confidence: Double
  public var localRecordRef: String

  public init(
    eventId: String,
    sourceClient: ClientKind = .desktop,
    capturedAt: String,
    periodStart: String,
    periodEnd: String,
    artifactType: ArtifactType,
    summary: String,
    signals: [String: JSONValue] = [:],
    embeddingRef: PerceptionEmbeddingRef? = nil,
    sensitivityLabel: SensitivityLabel,
    retentionClass: String,
    confidence: Double,
    localRecordRef: String
  ) {
    self.type = "perception_event"
    self.eventId = eventId
    self.sourceClient = sourceClient
    self.capturedAt = capturedAt
    self.periodStart = periodStart
    self.periodEnd = periodEnd
    self.artifactType = artifactType
    self.summary = summary
    self.signals = signals
    self.embeddingRef = embeddingRef
    self.sensitivityLabel = sensitivityLabel
    self.retentionClass = retentionClass
    self.confidence = confidence
    self.localRecordRef = localRecordRef
  }

  enum CodingKeys: String, CodingKey, CaseIterable {
    case type
    case eventId = "event_id"
    case sourceClient = "source_client"
    case capturedAt = "captured_at"
    case periodStart = "period_start"
    case periodEnd = "period_end"
    case artifactType = "artifact_type"
    case summary
    case signals
    case embeddingRef = "embedding_ref"
    case sensitivityLabel = "sensitivity_label"
    case retentionClass = "retention_class"
    case confidence
    case localRecordRef = "local_record_ref"
  }
}

public enum MessageAuthor: String, Codable, Equatable, Sendable {
  case user
  case companion
}

public struct SessionMessage: Codable, Equatable, Identifiable, Sendable {
  public var id: String { messageId }
  public var messageId: String
  public var author: MessageAuthor
  public var body: String
  public var at: String
  public var viaPostMessageBack: Bool

  public init(
    messageId: String,
    author: MessageAuthor,
    body: String,
    at: String,
    viaPostMessageBack: Bool = false
  ) {
    self.messageId = messageId
    self.author = author
    self.body = body
    self.at = at
    self.viaPostMessageBack = viaPostMessageBack
  }

  enum CodingKeys: String, CodingKey {
    case messageId = "message_id"
    case author
    case body
    case at
    case viaPostMessageBack = "via_post_message_back"
  }
}

public struct SessionSnapshot: Codable, Equatable, Sendable {
  public var messages: [SessionMessage]
  public var beforeCursor: String?

  public init(messages: [SessionMessage], beforeCursor: String?) {
    self.messages = messages
    self.beforeCursor = beforeCursor
  }

  enum CodingKeys: String, CodingKey {
    case messages
    case beforeCursor = "before_cursor"
  }
}

public struct HelloOk: Codable, Equatable, Sendable {
  public let type: String
  public var sessionSnapshot: SessionSnapshot

  public init(sessionSnapshot: SessionSnapshot) {
    self.type = "hello_ok"
    self.sessionSnapshot = sessionSnapshot
  }

  enum CodingKeys: String, CodingKey, CaseIterable {
    case type
    case sessionSnapshot = "session_snapshot"
  }
}

public struct CompanionMessage: Codable, Equatable, Sendable {
  public let type: String
  public var messageId: String
  public var body: String
  public var emittedAt: String
  public var viaPostMessageBack: Bool

  public init(messageId: String, body: String, emittedAt: String, viaPostMessageBack: Bool = false) {
    self.type = "companion_message"
    self.messageId = messageId
    self.body = body
    self.emittedAt = emittedAt
    self.viaPostMessageBack = viaPostMessageBack
  }

  enum CodingKeys: String, CodingKey, CaseIterable {
    case type
    case messageId = "message_id"
    case body
    case emittedAt = "emitted_at"
    case viaPostMessageBack = "via_post_message_back"
  }
}

public struct UserMessage: Codable, Equatable, Sendable {
  public let type: String
  public var messageId: String
  public var body: String
  public var sentAt: String

  public init(messageId: String, body: String, sentAt: String) {
    self.type = "user_message"
    self.messageId = messageId
    self.body = body
    self.sentAt = sentAt
  }

  enum CodingKeys: String, CodingKey {
    case type
    case messageId = "message_id"
    case body
    case sentAt = "sent_at"
  }
}

public struct ConnectEvent: Codable, Equatable, Sendable {
  public let type: String
  public var clientKind: ClientKind
  public var clientVersion: String
  public var clientTz: String?

  public init(clientVersion: String, clientTz: String?) {
    self.type = "connect"
    self.clientKind = .desktop
    self.clientVersion = clientVersion
    self.clientTz = clientTz
  }

  enum CodingKeys: String, CodingKey {
    case type
    case clientKind = "client_kind"
    case clientVersion = "client_version"
    case clientTz = "client_tz"
  }
}

public struct PresenceUpdate: Codable, Equatable, Sendable {
  public let type: String
  public var foreground: Bool
  public var sentAt: String

  public init(foreground: Bool, sentAt: String) {
    self.type = "presence_update"
    self.foreground = foreground
    self.sentAt = sentAt
  }

  enum CodingKeys: String, CodingKey {
    case type
    case foreground
    case sentAt = "sent_at"
  }
}

public struct DeliveryAck: Codable, Equatable, Sendable {
  public let type: String
  public var messageId: String
  public var receivedAt: String

  public init(messageId: String, receivedAt: String) {
    self.type = "delivery_ack"
    self.messageId = messageId
    self.receivedAt = receivedAt
  }

  enum CodingKeys: String, CodingKey {
    case type
    case messageId = "message_id"
    case receivedAt = "received_at"
  }
}

public enum RuntimeToClientEvent: Equatable, Sendable {
  case helloOk(HelloOk)
  case companionMessage(CompanionMessage)
}

public struct ProtocolEventCodec {
  public static let encoder: JSONEncoder = {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    return encoder
  }()

  public static let decoder = JSONDecoder()

  public static func decodePerceptionEvent(_ data: Data) throws -> PerceptionEvent {
    try validateAllowedKeys(
      data: data,
      type: "perception_event",
      allowed: Set(PerceptionEvent.CodingKeys.allCases.map(\.stringValue))
    )
    return try decoder.decode(PerceptionEvent.self, from: data)
  }

  public static func decodeRuntimeToClientEvent(_ data: Data) throws -> RuntimeToClientEvent {
    let type = try topLevelType(data)
    switch type {
    case "hello_ok":
      try validateAllowedKeys(
        data: data,
        type: type,
        allowed: Set(HelloOk.CodingKeys.allCases.map(\.stringValue))
      )
      return .helloOk(try decoder.decode(HelloOk.self, from: data))
    case "companion_message":
      try validateAllowedKeys(
        data: data,
        type: type,
        allowed: Set(CompanionMessage.CodingKeys.allCases.map(\.stringValue))
      )
      return .companionMessage(try decoder.decode(CompanionMessage.self, from: data))
    default:
      throw ProtocolEventError.unsupportedType(type)
    }
  }

  public static func encode<T: Encodable>(_ value: T) throws -> Data {
    try encoder.encode(value)
  }

  private static func topLevelType(_ data: Data) throws -> String {
    guard
      let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      throw ProtocolEventError.invalidTopLevel
    }
    guard let type = object["type"] as? String else {
      throw ProtocolEventError.missingType
    }
    return type
  }

  private static func validateAllowedKeys(data: Data, type: String, allowed: Set<String>) throws {
    guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw ProtocolEventError.invalidTopLevel
    }
    let unknown = Set(object.keys).subtracting(allowed)
    if !unknown.isEmpty {
      throw ProtocolEventError.unknownKeys(type: type, keys: unknown.sorted())
    }
  }
}

public extension Date {
  var protocolTimestamp: String {
    ISO8601DateFormatter.intentiveProtocol.string(from: self)
  }
}

public extension ISO8601DateFormatter {
  static let intentiveProtocol: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()
}
