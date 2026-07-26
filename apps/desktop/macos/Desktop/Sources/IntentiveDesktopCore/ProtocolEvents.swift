import Foundation

public enum ClientKind: String, Codable, Equatable, Sendable {
  case mobile
  case desktop
}

public enum ClientCapability: String, Codable, Equatable, Sendable {
  case desktopCoachingV1 = "desktop_coaching_v1"
}

public enum ProtocolEventError: Error, Equatable, LocalizedError {
  case invalidTopLevel
  case missingType
  case unsupportedType(String)
  case unknownKeys(type: String, keys: [String])
  case invalidEmbeddingDimension(expected: Int, actual: Int)
  case payloadContainsRawFrameBytes
  case coachingWindowRequired
  case invalidUUID(field: String)
  case invalidTimestamp(field: String)
  case invalidLiteral(field: String, expected: String)

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
    case .coachingWindowRequired:
      return "New Desktop perception requires an active Coaching Window."
    case .invalidUUID(let field):
      return "Protocol field \(field) must be a UUID."
    case .invalidTimestamp(let field):
      return "Protocol field \(field) must be an ISO-8601 timestamp."
    case .invalidLiteral(let field, let expected):
      return "Protocol field \(field) must equal \(expected)."
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
  case ambientAudioSummary = "ambient_audio_summary"
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
  public var windowId: String?
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
  /// Authoritative retention expiry. Desktop drops already-expired records
  /// before they are ever sent; the Runtime never returns an expired row.
  public var expiresAt: String
  public var localRecordRef: String

  public init(
    eventId: String,
    windowId: String? = nil,
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
    expiresAt: String,
    localRecordRef: String
  ) {
    self.type = "perception_event"
    self.eventId = eventId
    self.windowId = windowId
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
    self.expiresAt = expiresAt
    self.localRecordRef = localRecordRef
  }

  enum CodingKeys: String, CodingKey, CaseIterable {
    case type
    case eventId = "event_id"
    case windowId = "window_id"
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
    case expiresAt = "expires_at"
    case localRecordRef = "local_record_ref"
  }
}

public enum PerceptionTombstoneReason: String, Codable, Equatable, Sendable {
  case manualDelete = "manual_delete"
  case retentionExpiry = "retention_expiry"
  case clearAll = "clear_all"
}

/// A tenant-scoped deletion request the Runtime honours by dropping only the
/// authenticated user's matching rows. `clearAll` wipes everything; the other
/// reasons name specific `event_id`s in `eventRefs`. See the renovation plan.
public struct PerceptionTombstone: Codable, Equatable, Sendable {
  public let type: String
  public var tombstoneId: String
  public var reason: PerceptionTombstoneReason
  public var eventRefs: [String]
  public var emittedAt: String

  public init(
    tombstoneId: String,
    reason: PerceptionTombstoneReason,
    eventRefs: [String],
    emittedAt: String
  ) {
    self.type = "perception_tombstone"
    self.tombstoneId = tombstoneId
    self.reason = reason
    self.eventRefs = eventRefs
    self.emittedAt = emittedAt
  }

  enum CodingKeys: String, CodingKey, CaseIterable {
    case type
    case tombstoneId = "tombstone_id"
    case reason
    case eventRefs = "event_refs"
    case emittedAt = "emitted_at"
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
  public var windowId: String?
  public var body: String
  public var emittedAt: String
  public var viaPostMessageBack: Bool

  public init(
    messageId: String,
    windowId: String? = nil,
    body: String,
    emittedAt: String,
    viaPostMessageBack: Bool = false
  ) {
    self.type = "companion_message"
    self.messageId = messageId
    self.windowId = windowId
    self.body = body
    self.emittedAt = emittedAt
    self.viaPostMessageBack = viaPostMessageBack
  }

  enum CodingKeys: String, CodingKey, CaseIterable {
    case type
    case messageId = "message_id"
    case windowId = "window_id"
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
  public var windowId: String?

  public init(messageId: String, body: String, sentAt: String, windowId: String? = nil) {
    self.type = "user_message"
    self.messageId = messageId
    self.body = body
    self.sentAt = sentAt
    self.windowId = windowId
  }

  enum CodingKeys: String, CodingKey {
    case type
    case messageId = "message_id"
    case body
    case sentAt = "sent_at"
    case windowId = "window_id"
  }
}

public struct ConnectEvent: Codable, Equatable, Sendable {
  public let type: String
  public var authToken: String
  public var clientKind: ClientKind
  public var clientVersion: String
  public var clientTz: String?
  public var capabilities: [ClientCapability]?

  public init(
    authToken: String,
    clientVersion: String,
    clientTz: String?,
    capabilities: [ClientCapability]? = nil
  ) {
    self.type = "connect"
    self.authToken = authToken
    self.clientKind = .desktop
    self.clientVersion = clientVersion
    self.clientTz = clientTz
    self.capabilities = capabilities
  }

  enum CodingKeys: String, CodingKey {
    case type
    case authToken = "auth_token"
    case clientKind = "client_kind"
    case clientVersion = "client_version"
    case clientTz = "client_tz"
    case capabilities
  }
}

public enum CoachingWindowStartReason: String, Codable, Equatable, Sendable {
  case appLaunch = "app_launch"
  case loginLaunch = "login_launch"
  case signIn = "sign_in"
  case onboardingCompleted = "onboarding_completed"
  case systemWake = "system_wake"
  case userResume = "user_resume"
  case permissionRestored = "permission_restored"
  case crashRecovery = "crash_recovery"
}

public struct CoachingWindowStarted: Codable, Equatable, Sendable {
  public let type: String
  public var windowId: String
  public var startedAt: String
  public var reason: CoachingWindowStartReason

  public init(windowId: String, startedAt: String, reason: CoachingWindowStartReason) {
    self.type = "coaching_window_started"
    self.windowId = windowId
    self.startedAt = startedAt
    self.reason = reason
  }

  enum CodingKeys: String, CodingKey, CaseIterable {
    case type
    case windowId = "window_id"
    case startedAt = "started_at"
    case reason
  }
}

public enum CoachingWindowEndReason: String, Codable, Equatable, Sendable {
  case pause
  case systemSleep = "system_sleep"
  case signOut = "sign_out"
  case quit
  case crash
  case permissionLost = "permission_lost"
}

public struct CoachingWindowEnded: Codable, Equatable, Sendable {
  public let type: String
  public var windowId: String
  public var endedAt: String
  public var reason: CoachingWindowEndReason

  public init(windowId: String, endedAt: String, reason: CoachingWindowEndReason) {
    self.type = "coaching_window_ended"
    self.windowId = windowId
    self.endedAt = endedAt
    self.reason = reason
  }

  enum CodingKeys: String, CodingKey, CaseIterable {
    case type
    case windowId = "window_id"
    case endedAt = "ended_at"
    case reason
  }
}

public enum CoachingWindowPresenceState: String, Codable, Equatable, Sendable {
  case active
  case locked
}

public struct CoachingWindowPresence: Codable, Equatable, Sendable {
  public let type: String
  public var windowId: String
  public var state: CoachingWindowPresenceState
  public var changedAt: String

  public init(windowId: String, state: CoachingWindowPresenceState, changedAt: String) {
    self.type = "coaching_window_presence"
    self.windowId = windowId
    self.state = state
    self.changedAt = changedAt
  }

  enum CodingKeys: String, CodingKey, CaseIterable {
    case type
    case windowId = "window_id"
    case state
    case changedAt = "changed_at"
  }
}

public struct PresenceUpdate: Codable, Equatable, Sendable {
  public let type: String
  public var foreground: Bool

  public init(foreground: Bool) {
    self.type = "presence_update"
    self.foreground = foreground
  }

  enum CodingKeys: String, CodingKey, CaseIterable {
    case type
    case foreground
  }
}

public struct DeliveryAck: Codable, Equatable, Sendable {
  public let type: String
  public var messageId: String

  public init(messageId: String) {
    self.type = "delivery_ack"
    self.messageId = messageId
  }

  enum CodingKeys: String, CodingKey, CaseIterable {
    case type
    case messageId = "message_id"
  }
}

public enum SessionEndReason: String, Codable, Equatable, Sendable {
  case userToggle = "user_toggle"
  case quit
  case crash
}

public struct SessionEndMarker: Codable, Equatable, Sendable {
  public let type: String
  /// Stable UUID for this marker: the Runtime's dedup key and the value echoed
  /// back in `runtime_ingress_ack.ingress_id`. For a `crash` marker it is
  /// preallocated in the session lock so an unclean prior session finalizes to
  /// exactly one idempotent marker on next launch.
  public var markerId: String
  /// The capture session this marker closes. A fresh capture allocates a new
  /// `sessionId`; markers never span sessions.
  public var sessionId: String
  public var endedAt: String
  public var reason: SessionEndReason

  public init(markerId: String, sessionId: String, endedAt: String, reason: SessionEndReason) {
    self.type = "session_end_marker"
    self.markerId = markerId
    self.sessionId = sessionId
    self.endedAt = endedAt
    self.reason = reason
  }

  enum CodingKeys: String, CodingKey, CaseIterable {
    case type
    case markerId = "marker_id"
    case sessionId = "session_id"
    case endedAt = "ended_at"
    case reason
  }
}

public struct HistoryBackfillRequest: Codable, Equatable, Sendable {
  public let type: String
  public var beforeCursor: String
  public var limit: Int?

  public init(beforeCursor: String, limit: Int? = nil) {
    self.type = "history_backfill_request"
    self.beforeCursor = beforeCursor
    self.limit = limit
  }

  enum CodingKeys: String, CodingKey, CaseIterable {
    case type
    case beforeCursor = "before_cursor"
    case limit
  }
}

public struct HistoryBackfillResponse: Codable, Equatable, Sendable {
  public let type: String
  public var sessionSnapshot: SessionSnapshot

  public init(sessionSnapshot: SessionSnapshot) {
    self.type = "history_backfill_response"
    self.sessionSnapshot = sessionSnapshot
  }

  enum CodingKeys: String, CodingKey, CaseIterable {
    case type
    case sessionSnapshot = "session_snapshot"
  }
}

public enum RuntimeErrorCode: String, Codable, Equatable, Sendable {
  case protocolUnsupported = "protocol_unsupported"
  case authFailed = "auth_failed"
  case invalidConnect = "invalid_connect"
  case serviceUnavailable = "service_unavailable"
}

public struct RuntimeError: Codable, Equatable, Sendable {
  public let type: String
  public var code: RuntimeErrorCode
  public var message: String
  public var details: JSONValue?

  public init(code: RuntimeErrorCode, message: String, details: JSONValue? = nil) {
    self.type = "runtime_error"
    self.code = code
    self.message = message
    self.details = details
  }

  enum CodingKeys: String, CodingKey, CaseIterable {
    case type
    case code
    case message
    case details
  }
}

/// The kind of durable ingress a `runtime_ingress_ack` acknowledges. Mirrors the
/// Protocol enum: only the three durable, outbox-backed ingress kinds appear —
/// `user_message` is never acknowledged this way.
public enum RuntimeIngressKind: String, Codable, Equatable, Sendable {
  case perceptionEvent = "perception_event"
  case perceptionTombstone = "perception_tombstone"
  case sessionEndMarker = "session_end_marker"
  case coachingWindowStarted = "coaching_window_started"
  case coachingWindowEnded = "coaching_window_ended"
}

/// A durable-ingress acknowledgement the Runtime sends only after the event
/// ledger and projection transaction commits (a redelivered, deduped item is
/// acknowledged the same way). Desktop keeps the matching outbox row until this
/// arrives. `ingressId` is the item's own stable UUID — `event_id`,
/// `tombstone_id`, or the session marker's `marker_id`. See the renovation plan.
public struct RuntimeIngressAck: Codable, Equatable, Sendable {
  public let type: String
  public var ingressKind: RuntimeIngressKind
  public var ingressId: String

  public init(ingressKind: RuntimeIngressKind, ingressId: String) {
    self.type = "runtime_ingress_ack"
    self.ingressKind = ingressKind
    self.ingressId = ingressId
  }

  enum CodingKeys: String, CodingKey, CaseIterable {
    case type
    case ingressKind = "ingress_kind"
    case ingressId = "ingress_id"
  }
}

public enum RuntimeToClientEvent: Equatable, Sendable {
  case helloOk(HelloOk)
  case historyBackfillResponse(HistoryBackfillResponse)
  case companionMessage(CompanionMessage)
  case runtimeIngressAck(RuntimeIngressAck)
  case runtimeError(RuntimeError)
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
    let event = try decoder.decode(PerceptionEvent.self, from: data)
    if let windowId = event.windowId {
      try validateUUID(windowId, field: "window_id")
    }
    return event
  }

  public static func decodePerceptionTombstone(_ data: Data) throws -> PerceptionTombstone {
    try validateAllowedKeys(
      data: data,
      type: "perception_tombstone",
      allowed: Set(PerceptionTombstone.CodingKeys.allCases.map(\.stringValue))
    )
    return try decoder.decode(PerceptionTombstone.self, from: data)
  }

  public static func decodeSessionEndMarker(_ data: Data) throws -> SessionEndMarker {
    try validateAllowedKeys(
      data: data,
      type: "session_end_marker",
      allowed: Set(SessionEndMarker.CodingKeys.allCases.map(\.stringValue))
    )
    return try decoder.decode(SessionEndMarker.self, from: data)
  }

  public static func decodeCoachingWindowStarted(_ data: Data) throws -> CoachingWindowStarted {
    try validateAllowedKeys(
      data: data,
      type: "coaching_window_started",
      allowed: Set(CoachingWindowStarted.CodingKeys.allCases.map(\.stringValue))
    )
    let event = try decoder.decode(CoachingWindowStarted.self, from: data)
    try validateLiteral(event.type, expected: "coaching_window_started", field: "type")
    try validateUUID(event.windowId, field: "window_id")
    try validateTimestamp(event.startedAt, field: "started_at")
    return event
  }

  public static func decodeCoachingWindowEnded(_ data: Data) throws -> CoachingWindowEnded {
    try validateAllowedKeys(
      data: data,
      type: "coaching_window_ended",
      allowed: Set(CoachingWindowEnded.CodingKeys.allCases.map(\.stringValue))
    )
    let event = try decoder.decode(CoachingWindowEnded.self, from: data)
    try validateLiteral(event.type, expected: "coaching_window_ended", field: "type")
    try validateUUID(event.windowId, field: "window_id")
    try validateTimestamp(event.endedAt, field: "ended_at")
    return event
  }

  public static func decodeCoachingWindowPresence(_ data: Data) throws -> CoachingWindowPresence {
    try validateAllowedKeys(
      data: data,
      type: "coaching_window_presence",
      allowed: Set(CoachingWindowPresence.CodingKeys.allCases.map(\.stringValue))
    )
    let event = try decoder.decode(CoachingWindowPresence.self, from: data)
    try validateLiteral(event.type, expected: "coaching_window_presence", field: "type")
    try validateUUID(event.windowId, field: "window_id")
    try validateTimestamp(event.changedAt, field: "changed_at")
    return event
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
    case "history_backfill_response":
      try validateAllowedKeys(
        data: data,
        type: type,
        allowed: Set(HistoryBackfillResponse.CodingKeys.allCases.map(\.stringValue))
      )
      return .historyBackfillResponse(try decoder.decode(HistoryBackfillResponse.self, from: data))
    case "companion_message":
      try validateAllowedKeys(
        data: data,
        type: type,
        allowed: Set(CompanionMessage.CodingKeys.allCases.map(\.stringValue))
      )
      let message = try decoder.decode(CompanionMessage.self, from: data)
      if let windowId = message.windowId {
        try validateUUID(windowId, field: "window_id")
      }
      return .companionMessage(message)
    case "runtime_ingress_ack":
      try validateAllowedKeys(
        data: data,
        type: type,
        allowed: Set(RuntimeIngressAck.CodingKeys.allCases.map(\.stringValue))
      )
      return .runtimeIngressAck(try decoder.decode(RuntimeIngressAck.self, from: data))
    case "runtime_error":
      try validateAllowedKeys(
        data: data,
        type: type,
        allowed: Set(RuntimeError.CodingKeys.allCases.map(\.stringValue))
      )
      return .runtimeError(try decoder.decode(RuntimeError.self, from: data))
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

  private static func validateUUID(_ value: String, field: String) throws {
    guard UUID(uuidString: value) != nil else {
      throw ProtocolEventError.invalidUUID(field: field)
    }
  }

  private static func validateTimestamp(_ value: String, field: String) throws {
    guard ISO8601DateFormatter.intentiveProtocol.date(from: value) != nil
      || ISO8601DateFormatter().date(from: value) != nil
    else {
      throw ProtocolEventError.invalidTimestamp(field: field)
    }
  }

  private static func validateLiteral(
    _ value: String,
    expected: String,
    field: String
  ) throws {
    guard value == expected else {
      throw ProtocolEventError.invalidLiteral(field: field, expected: expected)
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
