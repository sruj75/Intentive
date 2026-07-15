import Foundation

public struct ScreenMemoryRecordID: Codable, Equatable, Hashable, Sendable {
  public let value: UUID

  public init(_ value: UUID) {
    self.value = value
  }
}

public struct ScreenMemoryOCRBlock: Codable, Equatable, Sendable {
  public let text: String
  public let x: Double
  public let y: Double
  public let width: Double
  public let height: Double
  public let confidence: Double

  public init(
    text: String,
    x: Double,
    y: Double,
    width: Double,
    height: Double,
    confidence: Double
  ) {
    self.text = text
    self.x = x
    self.y = y
    self.width = width
    self.height = height
    self.confidence = confidence
  }
}

public struct ScreenMemoryOCRResult: Codable, Equatable, Sendable {
  public let fullText: String
  public let blocks: [ScreenMemoryOCRBlock]

  public init(fullText: String, blocks: [ScreenMemoryOCRBlock]) {
    self.fullText = fullText
    self.blocks = blocks
  }
}

public struct ScreenMemoryImageAnalysis: Equatable, Sendable {
  public let perceptualHash: UInt64
  public let ocr: ScreenMemoryOCRResult

  public init(perceptualHash: UInt64, ocr: ScreenMemoryOCRResult) {
    self.perceptualHash = perceptualHash
    self.ocr = ocr
  }
}

public protocol ScreenMemoryImageAnalyzing: Sendable {
  func perceptualHash(imageData: Data) throws -> UInt64
  func recognizeText(imageData: Data) async throws -> ScreenMemoryOCRResult
}

public struct ScreenMemoryProfile: Equatable, Sendable {
  public let userID: String
  public let databaseURL: URL

  public init(
    userID: String,
    rootURL: URL,
    fileManager: FileManager = .default
  ) throws {
    let trimmedUserID = userID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedUserID.isEmpty else {
      throw ScreenMemoryArchiveError.signedInProfileRequired
    }
    self.userID = trimmedUserID
    databaseURL = try DesktopLocalProfile.screenMemoryDatabaseURL(
      userID: trimmedUserID,
      fileManager: fileManager,
      baseApplicationSupportURL: rootURL
    )
  }
}

public struct ScreenMemoryCaptureInput: Equatable, Sendable {
  public let userID: String
  public let imageData: Data
  public let capturedAt: String
  public let appBundleID: String
  public let appName: String
  public let windowTitle: String

  public init(
    userID: String,
    imageData: Data,
    capturedAt: String,
    appBundleID: String,
    appName: String,
    windowTitle: String
  ) {
    self.userID = userID
    self.imageData = imageData
    self.capturedAt = capturedAt
    self.appBundleID = appBundleID
    self.appName = appName
    self.windowTitle = windowTitle
  }
}

public enum ScreenMemoryIngestOutcome: Equatable, Sendable {
  case stored(ScreenMemoryRecordID)
  case duplicate(existingRecordID: ScreenMemoryRecordID)
}

public enum ScreenMemoryOutboundContentState: Equatable, Sendable {
  case permitted
  case secretDetected
}

public struct ScreenMemoryOutboundRepresentation: Equatable, Sendable {
  public let recordID: ScreenMemoryRecordID
  public let state: ScreenMemoryOutboundContentState
  public let capturedAt: String
  public let appBundleID: String
  public let appName: String
  public let windowTitle: String?
  public let ocrText: String?
  public let summary: String
  public let embedding: PerceptionEmbeddingRef?

  public init(
    recordID: ScreenMemoryRecordID,
    state: ScreenMemoryOutboundContentState,
    capturedAt: String,
    appBundleID: String,
    appName: String,
    windowTitle: String?,
    ocrText: String?,
    summary: String,
    embedding: PerceptionEmbeddingRef?
  ) {
    self.recordID = recordID
    self.state = state
    self.capturedAt = capturedAt
    self.appBundleID = appBundleID
    self.appName = appName
    self.windowTitle = windowTitle
    self.ocrText = ocrText
    self.summary = summary
    self.embedding = embedding
  }
}

public enum ScreenMemoryArchiveError: Error, Equatable, LocalizedError {
  case signedInProfileRequired
  case profileMismatch

  public var errorDescription: String? {
    switch self {
    case .signedInProfileRequired:
      return "A signed-in user profile is required for Screen Memory."
    case .profileMismatch:
      return "The captured screen does not belong to the active Screen Memory profile."
    }
  }
}

public final class ScreenMemoryArchive: ScreenMemoryStore, AudioMemoryStore, PerceptionEventOutbox {
  public static let perceptualDuplicateThreshold = 5

  private let profile: ScreenMemoryProfile
  private let store: SQLiteScreenMemoryStore
  private let ingestCoordinator: ScreenMemoryIngestCoordinator

  public var userID: String { profile.userID }

  public init(
    profile: ScreenMemoryProfile,
    imageAnalyzer: any ScreenMemoryImageAnalyzing,
    idFactory: @escaping @Sendable () -> UUID = { UUID() },
    secretDetector: HardSecretDetector = HardSecretDetector(),
    embeddingService: LocalEmbeddingService = LocalEmbeddingService()
  ) throws {
    self.profile = profile
    let openedStore = try SQLiteScreenMemoryStore(databaseURL: profile.databaseURL)
    store = openedStore
    let latest = try openedStore.latestPerceptualRecord()
    ingestCoordinator = ScreenMemoryIngestCoordinator(
      profileUserID: profile.userID,
      imageAnalyzer: imageAnalyzer,
      idFactory: idFactory,
      secretDetector: secretDetector,
      embeddingService: embeddingService,
      store: openedStore,
      lastObservedHash: latest?.hash,
      latestStoredRecordID: latest.flatMap { UUID(uuidString: $0.id) }.map(ScreenMemoryRecordID.init)
    )
  }

  public func ingest(_ input: ScreenMemoryCaptureInput) async throws -> ScreenMemoryIngestOutcome {
    try await ingestCoordinator.ingest(input)
  }

  public func record(_ recordID: ScreenMemoryRecordID) -> ScreenMemorySearchResult? {
    guard let record = try? store.record(id: recordID.value.uuidString) else { return nil }
    return ScreenMemorySearchResult(record: record, rank: 0)
  }

  public func outboundRepresentation(
    for recordID: ScreenMemoryRecordID
  ) -> ScreenMemoryOutboundRepresentation? {
    guard let record = try? store.record(id: recordID.value.uuidString) else { return nil }
    let suppressed = record.sensitivityLabel == .secretDetected
    return ScreenMemoryOutboundRepresentation(
      recordID: recordID,
      state: suppressed ? .secretDetected : .permitted,
      capturedAt: record.capturedAt,
      appBundleID: record.appBundleID,
      appName: record.appName,
      windowTitle: suppressed ? nil : record.windowTitle,
      ocrText: suppressed ? nil : record.ocrText,
      summary: record.summary,
      embedding: suppressed ? nil : record.embedding
    )
  }

  public static func hammingDistance(_ lhs: UInt64, _ rhs: UInt64) -> Int {
    (lhs ^ rhs).nonzeroBitCount
  }

  public func add(_ record: ScreenMemoryRecord) {
    store.add(record)
  }

  public func recent(limit: Int) -> [ScreenMemoryRecord] {
    store.recent(limit: limit)
  }

  public func search(_ query: String, limit: Int) -> [ScreenMemorySearchResult] {
    store.search(query, limit: limit)
  }

  public func delete(id: String) {
    store.delete(id: id)
  }

  public func addAudioMemory(_ record: AudioMemoryRecord) {
    store.addAudioMemory(record)
  }

  public func recentAudioMemory(limit: Int) -> [AudioMemoryRecord] {
    store.recentAudioMemory(limit: limit)
  }

  public func enqueuePerceptionEvent(_ event: PerceptionEvent) throws {
    try store.enqueuePerceptionEvent(event)
  }

  public func pendingPerceptionEvents(limit: Int) throws -> [PerceptionEvent] {
    try store.pendingPerceptionEvents(limit: limit)
  }

  public func removePerceptionEvent(eventId: String) throws {
    try store.removePerceptionEvent(eventId: eventId)
  }

}

private actor ScreenMemoryIngestCoordinator {
  private let profileUserID: String
  private let imageAnalyzer: any ScreenMemoryImageAnalyzing
  private let idFactory: @Sendable () -> UUID
  private let secretDetector: HardSecretDetector
  private let embeddingService: LocalEmbeddingService
  private let store: SQLiteScreenMemoryStore
  private var lastObservedHash: UInt64?
  private var latestStoredRecordID: ScreenMemoryRecordID?

  init(
    profileUserID: String,
    imageAnalyzer: any ScreenMemoryImageAnalyzing,
    idFactory: @escaping @Sendable () -> UUID,
    secretDetector: HardSecretDetector,
    embeddingService: LocalEmbeddingService,
    store: SQLiteScreenMemoryStore,
    lastObservedHash: UInt64?,
    latestStoredRecordID: ScreenMemoryRecordID?
  ) {
    self.profileUserID = profileUserID
    self.imageAnalyzer = imageAnalyzer
    self.idFactory = idFactory
    self.secretDetector = secretDetector
    self.embeddingService = embeddingService
    self.store = store
    self.lastObservedHash = lastObservedHash
    self.latestStoredRecordID = latestStoredRecordID
  }

  func ingest(_ input: ScreenMemoryCaptureInput) async throws -> ScreenMemoryIngestOutcome {
    guard input.userID == profileUserID else {
      throw ScreenMemoryArchiveError.profileMismatch
    }

    let perceptualHash = try imageAnalyzer.perceptualHash(imageData: input.imageData)
    let isDuplicate = lastObservedHash.map {
      ScreenMemoryArchive.hammingDistance($0, perceptualHash)
        <= ScreenMemoryArchive.perceptualDuplicateThreshold
    } ?? false
    lastObservedHash = perceptualHash
    if isDuplicate, let latestStoredRecordID {
      return .duplicate(existingRecordID: latestStoredRecordID)
    }

    let ocr = try await imageAnalyzer.recognizeText(imageData: input.imageData)
    let recordID = ScreenMemoryRecordID(idFactory())
    let hasSecret = secretDetector.containsSecret(ocr.fullText)
      || secretDetector.containsSecret(input.windowTitle)
    let summary = hasSecret
      ? "Secret-like content was detected and suppressed."
      : compactSummary(
        appName: input.appName,
        windowTitle: input.windowTitle,
        text: ocr.fullText
      )
    let embedding = hasSecret ? nil : try embeddingService.embed(summary)
    try store.addRecord(
      ScreenMemoryRecord(
        id: recordID.value.uuidString,
        capturedAt: input.capturedAt,
        appBundleID: input.appBundleID,
        appName: input.appName,
        windowTitle: input.windowTitle,
        summary: summary,
        ocrText: ocr.fullText,
        ocrBlocks: ocr.blocks,
        perceptualHash: perceptualHash,
        sensitivityLabel: hasSecret ? .secretDetected : .normal,
        embedding: embedding
      )
    )
    latestStoredRecordID = recordID
    return .stored(recordID)
  }

  private func compactSummary(appName: String, windowTitle: String, text: String) -> String {
    let trimmed = text
      .split(whereSeparator: \.isWhitespace)
      .prefix(24)
      .joined(separator: " ")
    let title = windowTitle.isEmpty ? "untitled window" : windowTitle
    if trimmed.isEmpty {
      return "User is active in \(appName), \(title)."
    }
    return "User is active in \(appName), \(title): \(trimmed)"
  }
}
