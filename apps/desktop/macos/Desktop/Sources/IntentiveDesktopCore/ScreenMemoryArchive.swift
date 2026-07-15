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
  public let videoArchiveURL: URL

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
    videoArchiveURL = try DesktopLocalProfile.userSupportURL(
      userID: trimmedUserID,
      fileManager: fileManager,
      baseApplicationSupportURL: rootURL
    )
    .appendingPathComponent("Videos", isDirectory: true)
    try fileManager.createDirectory(at: videoArchiveURL, withIntermediateDirectories: true)
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

public struct ScreenMemoryVideoChunkID: Codable, Equatable, Hashable, Sendable {
  public let value: UUID

  public init(_ value: UUID) {
    self.value = value
  }
}

public struct ScreenMemoryVideoFrameLocation: Equatable, Hashable, Sendable {
  public let chunkID: ScreenMemoryVideoChunkID
  public let sampleOrdinal: Int

  public init(chunkID: ScreenMemoryVideoChunkID, sampleOrdinal: Int) {
    self.chunkID = chunkID
    self.sampleOrdinal = sampleOrdinal
  }
}

public struct ScreenMemoryVideoChunkFinalization: Equatable, Sendable {
  public let chunkID: ScreenMemoryVideoChunkID
  public let sampleCount: Int

  public init(chunkID: ScreenMemoryVideoChunkID, sampleCount: Int) {
    self.chunkID = chunkID
    self.sampleCount = sampleCount
  }
}

public enum ScreenMemoryVideoWriteOutcome: Equatable, Sendable {
  case rejected
  case accepted(
    location: ScreenMemoryVideoFrameLocation,
    finalizedChunks: [ScreenMemoryVideoChunkFinalization]
  )
}

public enum ScreenMemoryVideoChunkRecoveryState: Equatable, Sendable {
  case staged
  case finalized(sampleCount: Int)
  case missingOrInvalid
}

/// Source-neutral native-video boundary owned by Screen Memory. Implementations
/// keep AVFoundation types and filesystem locations on the native side.
public protocol ScreenMemoryVideoArchiving: Sendable {
  func appendFrame(imageData: Data, capturedAt: Date) async throws -> ScreenMemoryVideoWriteOutcome
  func activeChunkID() async -> ScreenMemoryVideoChunkID?
  func finalizeActiveChunk() async throws -> ScreenMemoryVideoChunkFinalization?
  func loadFrame(at location: ScreenMemoryVideoFrameLocation) async throws -> Data
  func recoveryState(
    for chunkID: ScreenMemoryVideoChunkID,
    expectedSampleCount: Int
  ) async -> ScreenMemoryVideoChunkRecoveryState
  func discardChunk(_ chunkID: ScreenMemoryVideoChunkID) async
}

public struct ScreenMemoryVideoFrame: Equatable, Sendable {
  public let recordID: ScreenMemoryRecordID
  public let capturedAt: String
  public let appBundleID: String
  public let appName: String
  public let windowTitle: String
  public let imageData: Data

  public init(
    recordID: ScreenMemoryRecordID,
    capturedAt: String,
    appBundleID: String,
    appName: String,
    windowTitle: String,
    imageData: Data
  ) {
    self.recordID = recordID
    self.capturedAt = capturedAt
    self.appBundleID = appBundleID
    self.appName = appName
    self.windowTitle = windowTitle
    self.imageData = imageData
  }
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
  case invalidCaptureTimestamp
  case videoFinalizationMismatch

  public var errorDescription: String? {
    switch self {
    case .signedInProfileRequired:
      return "A signed-in user profile is required for Screen Memory."
    case .profileMismatch:
      return "The captured screen does not belong to the active Screen Memory profile."
    case .invalidCaptureTimestamp:
      return "Screen Memory received an invalid capture timestamp."
    case .videoFinalizationMismatch:
      return "Screen Memory video finalization did not match the active chunk."
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
    embeddingService: LocalEmbeddingService = LocalEmbeddingService(),
    videoArchive: (any ScreenMemoryVideoArchiving)? = nil,
    staleVideoChunkDelay: TimeInterval = 70
  ) throws {
    self.profile = profile
    let openedStore = try SQLiteScreenMemoryStore(databaseURL: profile.databaseURL)
    store = openedStore
    let latest = try openedStore.latestPerceptualRecord()
    let coordinator = ScreenMemoryIngestCoordinator(
      profileUserID: profile.userID,
      imageAnalyzer: imageAnalyzer,
      idFactory: idFactory,
      secretDetector: secretDetector,
      embeddingService: embeddingService,
      store: openedStore,
      videoArchive: videoArchive,
      staleVideoChunkDelay: staleVideoChunkDelay,
      lastObservedHash: latest?.hash,
      latestStoredRecordID: latest.flatMap { UUID(uuidString: $0.id) }.map(ScreenMemoryRecordID.init)
    )
    ingestCoordinator = coordinator
    if videoArchive != nil {
      Task { try? await coordinator.prepareVideoArchive() }
    }
  }

  public func ingest(_ input: ScreenMemoryCaptureInput) async throws -> ScreenMemoryIngestOutcome {
    try await ingestCoordinator.ingest(input)
  }

  public func finalizeActiveVideoChunk() async throws {
    try await ingestCoordinator.finalizeActiveVideoChunk()
  }

  public func videoFrame(for recordID: ScreenMemoryRecordID) async throws -> ScreenMemoryVideoFrame? {
    try await ingestCoordinator.videoFrame(for: recordID)
  }

  public func videoFrames(from start: Date, through end: Date) async throws -> [ScreenMemoryVideoFrame] {
    try await ingestCoordinator.videoFrames(from: start, through: end)
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
  private let videoArchive: (any ScreenMemoryVideoArchiving)?
  private let staleVideoChunkDelay: TimeInterval
  private var lastObservedHash: UInt64?
  private var latestStoredRecordID: ScreenMemoryRecordID?
  private var didRecoverVideoArchive = false
  private var staleFinalizationTask: Task<Void, Never>?

  init(
    profileUserID: String,
    imageAnalyzer: any ScreenMemoryImageAnalyzing,
    idFactory: @escaping @Sendable () -> UUID,
    secretDetector: HardSecretDetector,
    embeddingService: LocalEmbeddingService,
    store: SQLiteScreenMemoryStore,
    videoArchive: (any ScreenMemoryVideoArchiving)?,
    staleVideoChunkDelay: TimeInterval,
    lastObservedHash: UInt64?,
    latestStoredRecordID: ScreenMemoryRecordID?
  ) {
    self.profileUserID = profileUserID
    self.imageAnalyzer = imageAnalyzer
    self.idFactory = idFactory
    self.secretDetector = secretDetector
    self.embeddingService = embeddingService
    self.store = store
    self.videoArchive = videoArchive
    self.staleVideoChunkDelay = max(0, staleVideoChunkDelay)
    self.lastObservedHash = lastObservedHash
    self.latestStoredRecordID = latestStoredRecordID
  }

  func ingest(_ input: ScreenMemoryCaptureInput) async throws -> ScreenMemoryIngestOutcome {
    try await recoverVideoArchiveIfNeeded()
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
    let record = ScreenMemoryRecord(
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
    let videoWrite = try await appendVideoFrameIfConfigured(input)
    try store.addRecord(record, videoWrite: videoWrite)
    await scheduleStaleFinalizationIfNeeded()
    latestStoredRecordID = recordID
    return .stored(recordID)
  }

  func prepareVideoArchive() async throws {
    try await recoverVideoArchiveIfNeeded()
  }

  func finalizeActiveVideoChunk() async throws {
    try await recoverVideoArchiveIfNeeded()
    staleFinalizationTask?.cancel()
    staleFinalizationTask = nil
    guard let videoArchive, let chunkID = await videoArchive.activeChunkID() else { return }
    try store.markVideoChunkFinalizing(chunkID)
    guard let finalized = try await videoArchive.finalizeActiveChunk(), finalized.chunkID == chunkID else {
      throw ScreenMemoryArchiveError.videoFinalizationMismatch
    }
    guard try store.markVideoChunkFinalized(finalized) else {
      throw ScreenMemoryArchiveError.videoFinalizationMismatch
    }
  }

  func videoFrame(for recordID: ScreenMemoryRecordID) async throws -> ScreenMemoryVideoFrame? {
    try await recoverVideoArchiveIfNeeded()
    guard let videoArchive, let persisted = try store.videoFrame(recordID: recordID) else { return nil }
    let imageData = try await videoArchive.loadFrame(at: persisted.location)
    return persisted.publicFrame(imageData: imageData)
  }

  func videoFrames(from start: Date, through end: Date) async throws -> [ScreenMemoryVideoFrame] {
    try await recoverVideoArchiveIfNeeded()
    guard start <= end, let videoArchive else { return [] }
    let persisted = try store.videoFrames(from: start.protocolTimestamp, through: end.protocolTimestamp)
    var frames: [ScreenMemoryVideoFrame] = []
    frames.reserveCapacity(persisted.count)
    for frame in persisted {
      let imageData = try await videoArchive.loadFrame(at: frame.location)
      frames.append(frame.publicFrame(imageData: imageData))
    }
    return frames
  }

  private func appendVideoFrameIfConfigured(
    _ input: ScreenMemoryCaptureInput
  ) async throws -> ScreenMemoryVideoWriteOutcome? {
    guard let videoArchive else { return nil }
    guard let capturedAt = Self.captureDate(input.capturedAt) else {
      throw ScreenMemoryArchiveError.invalidCaptureTimestamp
    }
    return try await videoArchive.appendFrame(imageData: input.imageData, capturedAt: capturedAt)
  }

  private func scheduleStaleFinalizationIfNeeded() async {
    staleFinalizationTask?.cancel()
    staleFinalizationTask = nil
    guard let videoArchive, await videoArchive.activeChunkID() != nil else { return }
    let delay = staleVideoChunkDelay
    staleFinalizationTask = Task { [weak self] in
      if delay > 0 {
        try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
      }
      guard !Task.isCancelled else { return }
      try? await self?.finalizeActiveVideoChunk()
    }
  }

  private func recoverVideoArchiveIfNeeded() async throws {
    guard !didRecoverVideoArchive else { return }
    guard let videoArchive else {
      didRecoverVideoArchive = true
      return
    }

    for candidate in try store.videoRecoveryCandidates() {
      switch candidate.state {
      case .active:
        await videoArchive.discardChunk(candidate.chunkID)
        try store.clearVideoMappings(chunkID: candidate.chunkID)
      case .finalizing:
        let state = await videoArchive.recoveryState(
          for: candidate.chunkID,
          expectedSampleCount: candidate.expectedSampleCount
        )
        if case .finalized(let sampleCount) = state,
           sampleCount >= candidate.expectedSampleCount {
          try store.markVideoChunkFinalized(
            ScreenMemoryVideoChunkFinalization(
              chunkID: candidate.chunkID,
              sampleCount: sampleCount
            )
          )
        } else {
          await videoArchive.discardChunk(candidate.chunkID)
          try store.clearVideoMappings(chunkID: candidate.chunkID)
        }
      case .finalized:
        break
      }
    }
    didRecoverVideoArchive = true
  }

  private static func captureDate(_ value: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
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
