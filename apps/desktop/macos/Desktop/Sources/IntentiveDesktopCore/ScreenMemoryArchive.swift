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
  func deleteChunk(_ chunkID: ScreenMemoryVideoChunkID) async throws
  func deleteAllMedia() async throws
}

public extension ScreenMemoryVideoArchiving {
  func deleteChunk(_ chunkID: ScreenMemoryVideoChunkID) async throws {
    await discardChunk(chunkID)
  }

  func deleteAllMedia() async throws {}
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
  private let retentionPersistence: any ScreenMemoryRetentionPersisting
  private let semanticEmbedder: any LocalSemanticEmbedding
  private let now: @Sendable () -> Date

  public var userID: String { profile.userID }

  public init(
    profile: ScreenMemoryProfile,
    imageAnalyzer: any ScreenMemoryImageAnalyzing,
    idFactory: @escaping @Sendable () -> UUID = { UUID() },
    secretDetector: HardSecretDetector = HardSecretDetector(),
    embeddingService: LocalEmbeddingService = LocalEmbeddingService(),
    semanticEmbedder: any LocalSemanticEmbedding = AppleNaturalLanguageSemanticEmbedder(),
    videoArchive: (any ScreenMemoryVideoArchiving)? = nil,
    staleVideoChunkDelay: TimeInterval = 70,
    retentionPersistence: (any ScreenMemoryRetentionPersisting)? = nil,
    now: @escaping @Sendable () -> Date = { Date() }
  ) throws {
    self.profile = profile
    self.semanticEmbedder = semanticEmbedder
    self.now = now
    let resolvedRetentionPersistence = retentionPersistence
      ?? UserDefaultsScreenMemoryRetentionPersistence(userID: profile.userID)
    self.retentionPersistence = resolvedRetentionPersistence
    let retentionPeriod = resolvedRetentionPersistence.loadRetentionPeriod() ?? .sevenDays
    try resolvedRetentionPersistence.saveRetentionPeriod(retentionPeriod)
    let openedStore = try SQLiteScreenMemoryStore(databaseURL: profile.databaseURL)
    try openedStore.applyRetentionPeriod(retentionPeriod)
    store = openedStore
    let latest = try openedStore.latestPerceptualRecord()
    let coordinator = ScreenMemoryIngestCoordinator(
      profileUserID: profile.userID,
      imageAnalyzer: imageAnalyzer,
      idFactory: idFactory,
      secretDetector: secretDetector,
      embeddingService: embeddingService,
      semanticEmbedder: semanticEmbedder,
      store: openedStore,
      videoArchive: videoArchive,
      staleVideoChunkDelay: staleVideoChunkDelay,
      fileManager: .default,
      profile: profile,
      now: now,
      retentionPeriod: retentionPeriod,
      lastObservedHash: latest?.hash,
      latestStoredRecordID: latest.flatMap { UUID(uuidString: $0.id) }.map(ScreenMemoryRecordID.init)
    )
    ingestCoordinator = coordinator
  }

  public func ingest(_ input: ScreenMemoryCaptureInput) async throws -> ScreenMemoryIngestOutcome {
    try await ingestCoordinator.ingest(input)
  }

  public func finalizeActiveVideoChunk() async throws {
    try await ingestCoordinator.finalizeActiveVideoChunk()
  }

  @discardableResult
  public func prepare() async throws -> ScreenMemoryDeletionResult {
    try await ingestCoordinator.prepareArchive()
  }

  @discardableResult
  public func applyRetentionPolicy(
    _ period: ScreenMemoryRetentionPeriod
  ) async throws -> ScreenMemoryDeletionResult {
    try retentionPersistence.saveRetentionPeriod(period)
    return try await ingestCoordinator.applyRetentionPolicy(period)
  }

  @discardableResult
  public func runStartupCleanup() async throws -> ScreenMemoryDeletionResult {
    try await ingestCoordinator.prepareArchive()
  }

  @discardableResult
  public func runScheduledCleanup() async throws -> ScreenMemoryDeletionResult {
    try await ingestCoordinator.runScheduledCleanup()
  }

  public func delete(
    recordID: ScreenMemoryRecordID,
    confirmChunkDeletion: Bool
  ) async throws -> ScreenMemoryDeletionResult {
    try await ingestCoordinator.delete(
      recordID: recordID,
      confirmChunkDeletion: confirmChunkDeletion
    )
  }

  @discardableResult
  public func clearAll() async throws -> ScreenMemoryDeletionResult {
    try await ingestCoordinator.clearAll()
  }

  public func storageReport() throws -> ScreenMemoryStorageReport {
    try Self.storageReport(profile: profile)
  }

  public func videoFrame(for recordID: ScreenMemoryRecordID) async throws -> ScreenMemoryVideoFrame? {
    try await ingestCoordinator.videoFrame(for: recordID)
  }

  public func videoFrames(from start: Date, through end: Date) async throws -> [ScreenMemoryVideoFrame] {
    try await ingestCoordinator.videoFrames(from: start, through: end)
  }

  /// Evenly-sampled records for a calendar day, oldest first — the timeline's
  /// day view. Renovated from Omi's `getScreenshotsSampled`.
  public func records(
    on day: Date,
    targetCount: Int = 500,
    calendar: Calendar = .current
  ) -> [ScreenMemoryRecord] {
    let startOfDay = calendar.startOfDay(for: day)
    guard let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay) else { return [] }
    return (try? store.sampledRecords(
      from: startOfDay.protocolTimestamp,
      through: endOfDay.protocolTimestamp,
      targetCount: targetCount
    )) ?? []
  }

  /// Distinct app names for the timeline's app filter — Omi's `getUniqueAppNames`.
  public func appNames() -> [String] {
    (try? store.uniqueAppNames()) ?? []
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

  /// Hybrid local search renovated from Omi's `RewindViewModel.performSearch`:
  /// full-text results lead, then on-device vector matches above the recall
  /// threshold are appended for anything FTS missed. When the embedding model is
  /// unavailable, vector recall is skipped and search falls back to FTS alone.
  public func semanticSearch(_ query: String, limit: Int) -> [ScreenMemoryRankedResult] {
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, limit > 0 else { return [] }

    let lexical = store.search(trimmed, limit: max(limit, 100))
    var results = lexical.map {
      ScreenMemoryRankedResult(record: $0.record, matchedLexically: true, semanticSimilarity: nil)
    }

    guard semanticEmbedder.isAvailable, let queryVector = semanticEmbedder.embed(trimmed) else {
      return Array(results.prefix(limit))
    }

    let lexicalIDs = Set(lexical.map { $0.record.id })
    let candidates = (try? store.semanticSearchCandidates(limit: 5000)) ?? []
    let recalled = candidates
      .map { (record: $0.record, similarity: cosineSimilarity(queryVector, $0.vector)) }
      .filter { $0.similarity > screenMemorySemanticRecallThreshold && !lexicalIDs.contains($0.record.id) }
      .sorted { $0.similarity > $1.similarity }
    for match in recalled {
      results.append(
        ScreenMemoryRankedResult(
          record: match.record,
          matchedLexically: false,
          semanticSimilarity: match.similarity
        )
      )
    }
    return Array(results.prefix(limit))
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

  public func enqueuePerceptionTombstone(_ tombstone: PerceptionTombstone) throws {
    try store.enqueuePerceptionTombstone(tombstone)
  }

  public func enqueueSessionEndMarker(_ marker: SessionEndMarker) throws {
    try store.enqueueSessionEndMarker(marker)
  }

  public func pendingIngress(limit: Int) throws -> [RuntimeIngressOutboxItem] {
    try store.pendingIngress(limit: limit)
  }

  public func removeIngress(kind: RuntimeIngressKind, ingressId: String) throws {
    try store.removeIngress(kind: kind, ingressId: ingressId)
  }

  @discardableResult
  public func dropExpiredPerceptionEvents(now: Date) throws -> Int {
    try store.dropExpiredPerceptionEvents(now: now)
  }

  private static func storageReport(profile: ScreenMemoryProfile) throws -> ScreenMemoryStorageReport {
    let fileManager = FileManager.default
    let userDirectory = profile.databaseURL.deletingLastPathComponent()
    let normalizedVideoPath = profile.videoArchiveURL.standardizedFileURL.path
    let databaseNames = Set([
      profile.databaseURL.lastPathComponent,
      profile.databaseURL.lastPathComponent + "-wal",
      profile.databaseURL.lastPathComponent + "-shm",
    ])
    var databaseBytes: Int64 = 0
    var videoBytes: Int64 = 0
    var otherBytes: Int64 = 0
    guard let enumerator = fileManager.enumerator(
      at: userDirectory,
      includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey],
      options: [.skipsHiddenFiles]
    ) else {
      return ScreenMemoryStorageReport(databaseBytes: 0, videoBytes: 0, otherArchiveBytes: 0)
    }
    for case let url as URL in enumerator {
      let values = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
      guard values.isRegularFile == true else { continue }
      let size = Int64(values.fileSize ?? 0)
      let normalizedPath = url.standardizedFileURL.path
      if databaseNames.contains(url.lastPathComponent) {
        databaseBytes += size
      } else if normalizedPath.hasPrefix(normalizedVideoPath + "/") {
        videoBytes += size
      } else {
        otherBytes += size
      }
    }
    return ScreenMemoryStorageReport(
      databaseBytes: databaseBytes,
      videoBytes: videoBytes,
      otherArchiveBytes: otherBytes
    )
  }

}

// MARK: - ScreenMemoryArchive launch reconciliation

extension ScreenMemoryArchive: ScreenMemoryLaunchReconciliation {
  /// Launch-time reconciliation: finalize orphaned/finalizing video chunks and
  /// run scheduled expiry. Idempotent per process (guarded by the ingest
  /// coordinator's `didRecoverVideoArchive` / `didPrepareArchive` flags).
  public func reconcileOnLaunch() async throws {
    _ = try await ingestCoordinator.prepareArchive()
  }
}

private actor ScreenMemoryIngestCoordinator {
  private let profileUserID: String
  private let imageAnalyzer: any ScreenMemoryImageAnalyzing
  private let idFactory: @Sendable () -> UUID
  private let secretDetector: HardSecretDetector
  private let embeddingService: LocalEmbeddingService
  private let semanticEmbedder: any LocalSemanticEmbedding
  private let store: SQLiteScreenMemoryStore
  private let videoArchive: (any ScreenMemoryVideoArchiving)?
  private let staleVideoChunkDelay: TimeInterval
  private let fileManager: FileManager
  private let profile: ScreenMemoryProfile
  private let now: @Sendable () -> Date
  private var retentionPeriod: ScreenMemoryRetentionPeriod
  private var lastObservedHash: UInt64?
  private var latestStoredRecordID: ScreenMemoryRecordID?
  private var didRecoverVideoArchive = false
  private var staleFinalizationTask: Task<Void, Never>?
  private var activeVideoFinalizationTask: Task<Void, Error>?
  private var didPrepareArchive = false
  private var lastRetentionCleanupAt: Date = .distantPast
  private var isRetentionCleanupRunning = false

  init(
    profileUserID: String,
    imageAnalyzer: any ScreenMemoryImageAnalyzing,
    idFactory: @escaping @Sendable () -> UUID,
    secretDetector: HardSecretDetector,
    embeddingService: LocalEmbeddingService,
    semanticEmbedder: any LocalSemanticEmbedding,
    store: SQLiteScreenMemoryStore,
    videoArchive: (any ScreenMemoryVideoArchiving)?,
    staleVideoChunkDelay: TimeInterval,
    fileManager: FileManager,
    profile: ScreenMemoryProfile,
    now: @escaping @Sendable () -> Date,
    retentionPeriod: ScreenMemoryRetentionPeriod,
    lastObservedHash: UInt64?,
    latestStoredRecordID: ScreenMemoryRecordID?
  ) {
    self.profileUserID = profileUserID
    self.imageAnalyzer = imageAnalyzer
    self.idFactory = idFactory
    self.secretDetector = secretDetector
    self.embeddingService = embeddingService
    self.semanticEmbedder = semanticEmbedder
    self.store = store
    self.videoArchive = videoArchive
    self.staleVideoChunkDelay = max(0, staleVideoChunkDelay)
    self.fileManager = fileManager
    self.profile = profile
    self.now = now
    self.retentionPeriod = retentionPeriod
    self.lastObservedHash = lastObservedHash
    self.latestStoredRecordID = latestStoredRecordID
  }

  func ingest(_ input: ScreenMemoryCaptureInput) async throws -> ScreenMemoryIngestOutcome {
    _ = try await prepareArchive()
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
    // Local semantic index: Omi embedded "[app] title\nocr" for retrieval. We keep
    // that text but run it through the on-device embedder so nothing leaves the Mac,
    // and never index suppressed secret content.
    let semanticVector: [Float]? = hasSecret
      ? nil
      : semanticEmbedder.embed(
        semanticEmbedder.formatForEmbedding(
          ocrText: ocr.fullText,
          appName: input.appName,
          windowTitle: input.windowTitle
        )
      )
    guard let capturedDate = Self.captureDate(input.capturedAt) else {
      throw ScreenMemoryArchiveError.invalidCaptureTimestamp
    }
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
        retentionClass: retentionPeriod.retentionClass,
        expiresAt: retentionPeriod.expiryDate(for: capturedDate).protocolTimestamp,
        sensitivityLabel: hasSecret ? .secretDetected : .normal,
        embedding: embedding
      )
    let videoWrite = try await appendVideoFrameIfConfigured(input)
    try store.addRecord(record, videoWrite: videoWrite, semanticVector: semanticVector)
    await scheduleStaleFinalizationIfNeeded()
    latestStoredRecordID = recordID
    return .stored(recordID)
  }

  func prepareVideoArchive() async throws {
    try await recoverVideoArchiveIfNeeded()
  }

  func prepareArchive() async throws -> ScreenMemoryDeletionResult {
    if didPrepareArchive {
      return ScreenMemoryDeletionResult(recordIDs: [], reason: .expired)
    }
    try await recoverVideoArchiveIfNeeded()
    var deletedIDs: [String] = []
    for plan in try store.pendingDeletionPlans() {
      let result = try await executeDeletionPlan(plan, persistIntent: false)
      deletedIDs.append(contentsOf: result.recordIDs)
    }
    let expired = try await runCleanup(force: true)
    deletedIDs.append(contentsOf: expired.recordIDs)
    didPrepareArchive = true
    return ScreenMemoryDeletionResult(
      recordIDs: Array(Set(deletedIDs)).sorted(),
      reason: .expired
    )
  }

  func applyRetentionPolicy(
    _ period: ScreenMemoryRetentionPeriod
  ) async throws -> ScreenMemoryDeletionResult {
    retentionPeriod = period
    try store.applyRetentionPeriod(period)
    return try await runCleanup(force: true)
  }

  func runScheduledCleanup() async throws -> ScreenMemoryDeletionResult {
    try await runCleanup(force: false)
  }

  func delete(
    recordID: ScreenMemoryRecordID,
    confirmChunkDeletion: Bool
  ) async throws -> ScreenMemoryDeletionResult {
    try await recoverVideoArchiveIfNeeded()
    guard let plan = try store.manualDeletionPlan(recordID: recordID.value.uuidString) else {
      return ScreenMemoryDeletionResult(recordIDs: [], reason: .manual)
    }
    if !plan.chunkIDs.isEmpty, !confirmChunkDeletion {
      return ScreenMemoryDeletionResult(
        recordIDs: [],
        reason: .manual,
        requiredChunkConfirmation: true
      )
    }
    if !plan.chunkIDs.isEmpty {
      try await finalizeActiveVideoChunk()
    }
    return try await executeDeletionPlan(plan)
  }

  func clearAll() async throws -> ScreenMemoryDeletionResult {
    try await finalizeActiveVideoChunk()
    let plan = try store.clearAllDeletionPlan()
    let result = try await executeDeletionPlan(plan)
    lastObservedHash = nil
    latestStoredRecordID = nil
    return result
  }

  private func runCleanup(force: Bool) async throws -> ScreenMemoryDeletionResult {
    let cleanupTime = now()
    if !force,
       cleanupTime.timeIntervalSince(lastRetentionCleanupAt) < 6 * 60 * 60 {
      return ScreenMemoryDeletionResult(recordIDs: [], reason: .expired)
    }
    guard !isRetentionCleanupRunning else {
      return ScreenMemoryDeletionResult(recordIDs: [], reason: .expired)
    }
    isRetentionCleanupRunning = true
    defer { isRetentionCleanupRunning = false }
    try await finalizeActiveVideoChunk()
    guard let plan = try store.expiryDeletionPlan(at: cleanupTime.protocolTimestamp) else {
      lastRetentionCleanupAt = cleanupTime
      return ScreenMemoryDeletionResult(recordIDs: [], reason: .expired)
    }
    let result = try await executeDeletionPlan(plan)
    lastRetentionCleanupAt = cleanupTime
    return result
  }

  private func executeDeletionPlan(
    _ plan: ScreenMemoryDeletionPlan,
    persistIntent: Bool = true
  ) async throws -> ScreenMemoryDeletionResult {
    if persistIntent {
      try store.saveDeletionPlan(plan)
    }

    do {
      if plan.clearsAll {
        if let videoArchive {
          try await videoArchive.deleteAllMedia()
        }
        try removeAllArchiveOwnedFiles()
      } else {
        for rawChunkID in plan.chunkIDs {
          guard let uuid = UUID(uuidString: rawChunkID) else { continue }
          let chunkID = ScreenMemoryVideoChunkID(uuid)
          if let videoArchive {
            try await videoArchive.deleteChunk(chunkID)
          } else {
            try removeConventionalChunkFiles(chunkID)
          }
        }
        try removeEmptyDirectories(in: profile.videoArchiveURL)
      }

      let tombstone = deletionTombstone(for: plan)
      try store.commitDeletionPlan(plan, tombstone: tombstone)
      return ScreenMemoryDeletionResult(
        recordIDs: Array(Set(plan.recordIDs + plan.audioRecordIDs)).sorted(),
        reason: plan.reason
      )
    } catch {
      // A saved journal is a durable recovery request. Re-arm preparation so
      // callers can retry it immediately instead of waiting for relaunch.
      if persistIntent {
        didPrepareArchive = false
      }
      throw error
    }
  }

  /// Build the Runtime deletion corresponding to this local plan. The store
  /// commits it atomically with the local row deletion and journal removal.
  private func deletionTombstone(for plan: ScreenMemoryDeletionPlan) -> PerceptionTombstone? {
    if plan.clearsAll {
      return PerceptionTombstone(
        tombstoneId: UUID().uuidString,
        reason: .clearAll,
        eventRefs: [],
        emittedAt: now().protocolTimestamp
      )
    }
    let refs = plan.recordIDs
    guard !refs.isEmpty else { return nil }
    return PerceptionTombstone(
      tombstoneId: UUID().uuidString,
      reason: plan.reason == .manual ? .manualDelete : .retentionExpiry,
      eventRefs: refs,
      emittedAt: now().protocolTimestamp
    )
  }

  private func removeConventionalChunkFiles(_ chunkID: ScreenMemoryVideoChunkID) throws {
    let stem = chunkID.value.uuidString.lowercased()
    for suffix in [".mp4", ".partial.mp4"] {
      let url = profile.videoArchiveURL.appendingPathComponent(stem + suffix)
      if fileManager.fileExists(atPath: url.path) {
        try fileManager.removeItem(at: url)
      }
    }
  }

  private func removeAllArchiveOwnedFiles() throws {
    let userDirectory = profile.databaseURL.deletingLastPathComponent()
    let protectedNames = Set([
      profile.databaseURL.lastPathComponent,
      profile.databaseURL.lastPathComponent + "-wal",
      profile.databaseURL.lastPathComponent + "-shm",
    ])
    let contents = try fileManager.contentsOfDirectory(
      at: userDirectory,
      includingPropertiesForKeys: nil,
      options: [.skipsHiddenFiles]
    )
    for url in contents where !protectedNames.contains(url.lastPathComponent) {
      try fileManager.removeItem(at: url)
    }
    try fileManager.createDirectory(at: profile.videoArchiveURL, withIntermediateDirectories: true)
  }

  private func removeEmptyDirectories(in root: URL) throws {
    guard fileManager.fileExists(atPath: root.path),
          let enumerator = fileManager.enumerator(
            at: root,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
          )
    else { return }
    let directories = enumerator.compactMap { $0 as? URL }.reversed()
    for directory in directories where directory != root {
      let values = try directory.resourceValues(forKeys: [.isDirectoryKey])
      guard values.isDirectory == true else { continue }
      if try fileManager.contentsOfDirectory(atPath: directory.path).isEmpty {
        try fileManager.removeItem(at: directory)
      }
    }
  }

  func finalizeActiveVideoChunk() async throws {
    if let activeVideoFinalizationTask {
      try await activeVideoFinalizationTask.value
      return
    }
    let task = Task { try await self.performActiveVideoFinalization() }
    activeVideoFinalizationTask = task
    do {
      try await task.value
      activeVideoFinalizationTask = nil
    } catch {
      activeVideoFinalizationTask = nil
      throw error
    }
  }

  private func performActiveVideoFinalization() async throws {
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
