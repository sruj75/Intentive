import Foundation
@testable import IntentiveDesktopCore
import XCTest

final class ScreenMemoryCompilerTests: XCTestCase {
  func testDesktopLocalProfileUsesIntentivePerUserDirectoryAndSanitizesUserID() throws {
    let base = try temporaryDirectory()
    let url = try DesktopLocalProfile.screenMemoryDatabaseURL(
      userID: "../local dev user",
      baseApplicationSupportURL: base
    )

    XCTAssertEqual(url.lastPathComponent, "intentive.db")
    XCTAssertEqual(url.deletingLastPathComponent().lastPathComponent, "local-dev-user")
    XCTAssertEqual(url.deletingLastPathComponent().deletingLastPathComponent().lastPathComponent, "users")
    XCTAssertEqual(
      url.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().lastPathComponent,
      "Intentive"
    )
    XCTAssertFalse(url.path.contains("/Omi/"))
    XCTAssertTrue(FileManager.default.fileExists(atPath: url.deletingLastPathComponent().path))
  }

  func testSQLiteScreenMemoryStoreDefaultDatabaseURLUsesLocalProfile() throws {
    let base = try temporaryDirectory()
    let url = try SQLiteScreenMemoryStore.applicationSupportURL(
      userID: "user@example.com",
      baseApplicationSupportURL: base
    )

    XCTAssertEqual(url.path, base.appendingPathComponent("Intentive/users/user-example.com/intentive.db").path)
  }

  func testScreenMemorySearchRanksMatchingRecords() throws {
    let store = InMemoryScreenMemoryStore()
    store.add(
      ScreenMemoryRecord(
        id: "1",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Code",
        windowTitle: "Runtime Bridge",
        summary: "Implementing runtime bridge tests",
        ocrText: "runtime bridge generation queue"
      )
    )
    store.add(
      ScreenMemoryRecord(
        id: "2",
        capturedAt: "2026-07-05T09:00:00.000Z",
        appName: "Mail",
        windowTitle: "Inbox",
        summary: "Reading unrelated mail",
        ocrText: "newsletter"
      )
    )

    let results = store.search("runtime queue", limit: 10)
    XCTAssertEqual(results.first?.record.id, "1")
    XCTAssertEqual(results.first?.rank, 2)
  }

  func testSwitchableScreenMemoryStoreRoutesThroughReplacement() {
    let first = InMemoryScreenMemoryStore()
    let second = InMemoryScreenMemoryStore()
    let store = SwitchableScreenMemoryStore(first)

    store.add(
      ScreenMemoryRecord(
        id: "first",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Code",
        windowTitle: "Anonymous",
        summary: "anonymous profile row",
        ocrText: "anonymous"
      )
    )

    store.replace(with: second)
    store.add(
      ScreenMemoryRecord(
        id: "second",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Code",
        windowTitle: "Signed in",
        summary: "signed in profile row",
        ocrText: "signed"
      )
    )

    XCTAssertEqual(store.search("signed", limit: 10).first?.record.id, "second")
    XCTAssertTrue(store.search("anonymous", limit: 10).isEmpty)
    XCTAssertEqual(first.search("anonymous", limit: 10).first?.record.id, "first")
  }

  func testSwitchableScreenMemoryStoreCarriesPendingPerceptionOutboxAcrossReplacement() throws {
    let first = InMemoryScreenMemoryStore()
    let second = InMemoryScreenMemoryStore()
    let event = PerceptionEvent(
      eventId: "carry-pending",
      capturedAt: "2026-07-05T10:00:00.000Z",
      periodStart: "2026-07-05T10:00:00.000Z",
      periodEnd: "2026-07-05T10:00:00.000Z",
      artifactType: .searchableScreenRecord,
      summary: "pending profile switch",
      sensitivityLabel: .normal,
      retentionClass: "screen_memory_30d",
      confidence: 0.9,
      localRecordRef: "screen-memory://records/carry-pending"
    )
    try first.enqueuePerceptionEvent(event)
    let store = SwitchableScreenMemoryStore(first)

    store.replace(with: second)

    XCTAssertTrue(try first.pendingPerceptionEvents(limit: 10).isEmpty)
    XCTAssertEqual(try store.pendingPerceptionEvents(limit: 10), [event])
    XCTAssertEqual(try second.pendingPerceptionEvents(limit: 10), [event])
  }

  func testSQLiteScreenMemoryPersistsRecordsAcrossReopen() throws {
    let url = try temporaryDatabaseURL()
    let embedding = try LocalEmbeddingService(dim: 8).embed("runtime bridge queue")

    do {
      let store = try SQLiteScreenMemoryStore(databaseURL: url)
      try store.addRecord(
        ScreenMemoryRecord(
          id: "persisted",
          capturedAt: "2026-07-05T10:00:00.000Z",
          appName: "Code",
          windowTitle: "Runtime Bridge",
          summary: "Implementing runtime bridge tests",
          ocrText: "runtime bridge generation queue",
          embedding: embedding
        )
      )
    }

    let reopened = try SQLiteScreenMemoryStore(databaseURL: url)
    let results = try reopened.searchRecords("runtime queue", limit: 10)
    XCTAssertEqual(results.first?.record.id, "persisted")
    XCTAssertEqual(results.first?.rank, 2)
    XCTAssertEqual(results.first?.record.embedding, embedding)
  }

  func testSQLiteScreenMemoryDeleteRemovesFTSResult() throws {
    let store = try SQLiteScreenMemoryStore(databaseURL: temporaryDatabaseURL())
    try store.addRecord(
      ScreenMemoryRecord(
        id: "delete-me",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Safari",
        windowTitle: "Intentive plan",
        summary: "Screen Memory search result",
        ocrText: "delete marker"
      )
    )

    XCTAssertEqual(try store.searchRecords("delete marker", limit: 10).count, 1)
    try store.deleteRecord(id: "delete-me")
    XCTAssertTrue(try store.searchRecords("delete marker", limit: 10).isEmpty)
  }

  func testLocalEmbeddingHasPinnedDimension() throws {
    let embedding = try LocalEmbeddingService(dim: 8).embed("Screen Memory local embedding")
    XCTAssertEqual(embedding.modelId, "intentive-local-hash-v1")
    XCTAssertEqual(embedding.vector.count, 8)
  }

  func testCompilerSuppressesSecretLikeContent() throws {
    let compiler = ContextCompiler()
    let artifacts = try compiler.compile(
      frame: CapturedFrame(
        id: "secret",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Terminal",
        windowTitle: "deploy",
        ocrText: "export API_KEY=abc123"
      )
    )

    XCTAssertEqual(artifacts.first?.sensitivityLabel, .secretDetected)
    XCTAssertEqual(artifacts.first?.summary, "Secret-like content was detected and suppressed.")
    XCTAssertNil(artifacts.first?.embedding)
  }

  func testCompilerSkipsExcludedAppsCaseInsensitively() throws {
    let compiler = ContextCompiler(
      settings: CompilerSettings(excludedApps: ["Safari", "1Password"])
    )

    let artifacts = try compiler.compile(
      frame: CapturedFrame(
        id: "excluded",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "safari",
        windowTitle: "Private workspace",
        ocrText: "local-only private content"
      )
    )

    XCTAssertTrue(artifacts.isEmpty)
  }

  func testUserDefaultsScreenMemorySettingsStorePersistsSettings() throws {
    let suiteName = "ScreenMemorySettingsStoreTests-\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
    defer { defaults.removePersistentDomain(forName: suiteName) }

    let store = UserDefaultsScreenMemorySettingsStore(defaults: defaults, key: "settings")
    let settings = CompilerSettings(
      captureEnabled: false,
      excludedApps: ["Safari", "1Password"],
      contextChangeDebounceSeconds: 3,
      sameContextMinimumSeconds: 60,
      messagingFallbackSeconds: 15
    )

    try store.save(settings)

    let loaded = store.load()
    XCTAssertFalse(loaded.captureEnabled)
    XCTAssertEqual(loaded.excludedApps, ["Safari", "1Password"])
    XCTAssertEqual(loaded.contextChangeDebounceSeconds, 3)
    XCTAssertEqual(loaded.sameContextMinimumSeconds, 60)
    XCTAssertEqual(loaded.messagingFallbackSeconds, 15)
  }

  func testCompilerSettingsDecodeSavedSettingsBeforeVoiceToggles() throws {
    let savedSettings = """
      {
        "captureEnabled": false,
        "excludedApps": ["Safari"],
        "contextChangeDebounceSeconds": 4,
        "sameContextMinimumSeconds": 45,
        "messagingFallbackSeconds": 12
      }
      """.data(using: .utf8)!

    let loaded = try JSONDecoder().decode(CompilerSettings.self, from: savedSettings)

    XCTAssertFalse(loaded.captureEnabled)
    XCTAssertEqual(loaded.excludedApps, ["Safari"])
    XCTAssertEqual(loaded.contextChangeDebounceSeconds, 4)
    XCTAssertEqual(loaded.sameContextMinimumSeconds, 45)
    XCTAssertEqual(loaded.messagingFallbackSeconds, 12)
    XCTAssertFalse(loaded.ambientAudioCaptureEnabled)
  }

  func testPerceptionPublisherRejectsRawFrameBytes() throws {
    let runtime = RecordingRuntimeClient()
    let publisher = PerceptionPublisher(runtimeClient: runtime)
    let artifact = CompiledPerceptionArtifact(
      id: "bad",
      artifactType: .searchableScreenRecord,
      capturedAt: "2026-07-05T10:00:00.000Z",
      periodStart: "2026-07-05T10:00:00.000Z",
      periodEnd: "2026-07-05T10:00:00.000Z",
      summary: "raw bytes should not publish",
      signals: [:],
      retentionClass: "screen_memory_30d",
      sensitivityLabel: .normal,
      confidence: 1,
      localRecordRef: "local",
      embedding: nil,
      rawFrameBytes: Data([1, 2, 3])
    )

    XCTAssertThrowsError(try publisher.publish(artifact))
    XCTAssertTrue(runtime.perceptionEvents.isEmpty)
  }

  func testPerceptionPublisherQueuesDisconnectedEventsAndFlushesOnReconnect() throws {
    let runtime = RecordingRuntimeClient()
    let outbox = InMemoryScreenMemoryStore()
    var connected = false
    let publisher = PerceptionPublisher(
      runtimeClient: runtime,
      outbox: outbox,
      isRuntimeConnected: { connected }
    )
    let artifact = screenArtifact(id: "queued")

    let event = try publisher.publish(artifact)

    XCTAssertEqual(event.eventId, "queued")
    XCTAssertTrue(runtime.perceptionEvents.isEmpty)
    XCTAssertEqual(try outbox.pendingPerceptionEvents(limit: 10).map(\.eventId), ["queued"])

    connected = true
    XCTAssertEqual(try publisher.flushPendingPerceptionEvents(), 1)
    XCTAssertEqual(runtime.perceptionEvents.map(\.eventId), ["queued"])
    XCTAssertTrue(try outbox.pendingPerceptionEvents(limit: 10).isEmpty)
  }

  func testSQLitePerceptionOutboxPersistsAcrossReopen() throws {
    let url = try temporaryDatabaseURL()
    let event = PerceptionEvent(
      eventId: "durable-outbox",
      capturedAt: "2026-07-05T10:00:00.000Z",
      periodStart: "2026-07-05T10:00:00.000Z",
      periodEnd: "2026-07-05T10:00:00.000Z",
      artifactType: .searchableScreenRecord,
      summary: "durable local perception event",
      sensitivityLabel: .normal,
      retentionClass: "screen_memory_30d",
      confidence: 0.9,
      localRecordRef: "screen-memory://records/durable-outbox"
    )

    do {
      let store = try SQLiteScreenMemoryStore(databaseURL: url)
      try store.enqueuePerceptionEvent(event)
    }

    let reopened = try SQLiteScreenMemoryStore(databaseURL: url)
    XCTAssertEqual(try reopened.pendingPerceptionEvents(limit: 10), [event])

    try reopened.removePerceptionEvent(eventId: event.eventId)
    XCTAssertTrue(try reopened.pendingPerceptionEvents(limit: 10).isEmpty)
  }

  func testAmbientAudioAnalyzerCreatesSummaryArtifactWithoutRawAudio() throws {
    let transcript = AmbientAudioTranscript(
      id: "segment-1",
      capturedAt: "2026-07-05T10:00:10.000Z",
      periodStart: "2026-07-05T10:00:00.000Z",
      periodEnd: "2026-07-05T10:00:10.000Z",
      transcript: "the launch checklist needs owner names before the Friday review"
    )

    let artifact = try XCTUnwrap(AmbientAudioAnalyzer().analyze(transcript))

    XCTAssertEqual(artifact.id, "ambient-audio-segment-1")
    XCTAssertEqual(artifact.artifactType, .ambientAudioSummary)
    XCTAssertEqual(artifact.localRecordRef, "screen-memory://ambient-audio/segment-1")
    XCTAssertEqual(artifact.signals["audio_source"], .string("microphone"))
    XCTAssertEqual(artifact.sensitivityLabel, .normal)
    XCTAssertNil(artifact.rawFrameBytes)
    XCTAssertNotNil(artifact.embedding)
  }

  func testAmbientAudioAnalyzerSuppressesSecretTranscriptAndEmbedding() throws {
    let transcript = AmbientAudioTranscript(
      id: "secret-segment",
      capturedAt: "2026-07-05T10:00:10.000Z",
      periodStart: "2026-07-05T10:00:00.000Z",
      periodEnd: "2026-07-05T10:00:10.000Z",
      transcript: "the deploy password is hunter2"
    )

    let artifact = try XCTUnwrap(AmbientAudioAnalyzer().analyze(transcript))

    XCTAssertEqual(artifact.summary, "Secret-like ambient audio content was detected and suppressed.")
    XCTAssertEqual(artifact.sensitivityLabel, .secretDetected)
    XCTAssertNil(artifact.embedding)
  }

  func testAmbientAudioCoordinatorStoresTranscriptLocallyAndPublishesSummary() throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let coordinator = AmbientAudioCoordinator(
      audioMemory: store,
      publisher: PerceptionPublisher(runtimeClient: runtime)
    )

    let event = try coordinator.accept(
      transcript: AmbientAudioTranscript(
        id: "ambient-local",
        capturedAt: "2026-07-05T10:00:10.000Z",
        periodStart: "2026-07-05T10:00:00.000Z",
        periodEnd: "2026-07-05T10:00:10.000Z",
        transcript: "ship the desktop voice plan after the tests pass"
      )
    )

    XCTAssertEqual(event?.artifactType, .ambientAudioSummary)
    XCTAssertEqual(runtime.perceptionEvents.first?.artifactType, .ambientAudioSummary)
    XCTAssertEqual(store.recentAudioMemory(limit: 1).first?.transcript, "ship the desktop voice plan after the tests pass")
  }

  func testAmbientAudioCoordinatorKeepsSecretTranscriptLocalOnly() throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let coordinator = AmbientAudioCoordinator(
      audioMemory: store,
      publisher: PerceptionPublisher(runtimeClient: runtime)
    )

    let event = try coordinator.accept(
      transcript: AmbientAudioTranscript(
        id: "ambient-secret",
        capturedAt: "2026-07-05T10:00:10.000Z",
        periodStart: "2026-07-05T10:00:00.000Z",
        periodEnd: "2026-07-05T10:00:10.000Z",
        transcript: "the deploy password is hunter2"
      )
    )

    XCTAssertEqual(event?.summary, "Secret-like ambient audio content was detected and suppressed.")
    XCTAssertEqual(event?.sensitivityLabel, .secretDetected)
    XCTAssertEqual(store.recentAudioMemory(limit: 1).first?.transcript, "the deploy password is hunter2")
    XCTAssertEqual(runtime.perceptionEvents.first?.summary, "Secret-like ambient audio content was detected and suppressed.")
  }

  func testSQLiteAudioMemoryPersistsLocalTranscripts() throws {
    let url = try temporaryDatabaseURL()
    do {
      let store = try SQLiteScreenMemoryStore(databaseURL: url)
      store.addAudioMemory(
        AudioMemoryRecord(
          id: "audio-1",
          capturedAt: "2026-07-05T10:00:10.000Z",
          periodStart: "2026-07-05T10:00:00.000Z",
          periodEnd: "2026-07-05T10:00:10.000Z",
          transcript: "local only transcript",
          summary: "Recent ambient audio: local only transcript"
        )
      )
      XCTAssertNil(store.lastError)
    }

    let reopened = try SQLiteScreenMemoryStore(databaseURL: url)
    XCTAssertEqual(try reopened.recentAudioMemoryRecords(limit: 1).first?.transcript, "local only transcript")
  }

  func testAmbientAudioCadenceGateThrottlesRepeatedTranscript() {
    var gate = AmbientAudioCadenceGate(minimumIntervalSeconds: 60)
    let first = Date(timeIntervalSince1970: 100)

    XCTAssertTrue(gate.shouldEmit(transcript: "launch checklist", capturedAt: first))
    XCTAssertFalse(gate.shouldEmit(transcript: "launch checklist", capturedAt: first.addingTimeInterval(5)))
    XCTAssertTrue(gate.shouldEmit(transcript: "different launch note", capturedAt: first.addingTimeInterval(6)))
  }

  @MainActor
  func testAmbientAudioCaptureLoopPublishesVADGatedTranscript() async throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let coordinator = AmbientAudioCoordinator(
      audioMemory: store,
      publisher: PerceptionPublisher(runtimeClient: runtime)
    )
    var nowCallCount = 0
    let loop = AmbientAudioCaptureLoop(
      coordinator: coordinator,
      audioCapture: FixedAmbientAudioCaptureService(pcm16k: Data([1, 2, 3, 4])),
      voiceGate: FixedVoiceActivityGate(hasSpeech: true),
      transcription: FixedAmbientTranscription(text: "ambient launch checklist"),
      settingsProvider: { CompilerSettings(ambientAudioCaptureEnabled: true) },
      permissionProvider: { true },
      now: {
        defer { nowCallCount += 1 }
        return Date(timeIntervalSince1970: nowCallCount == 0 ? 100 : 108)
      },
      intervalSeconds: 1
    )

    let result = await loop.captureTick()

    XCTAssertEqual(result, .captured(eventPublished: true))
    XCTAssertEqual(runtime.perceptionEvents.first?.artifactType, .ambientAudioSummary)
    XCTAssertEqual(store.recentAudioMemory(limit: 1).first?.transcript, "ambient launch checklist")
  }

  func testCaptureCoordinatorStoresAndPublishesPerception() throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let coordinator = CaptureCoordinator(
      compiler: ContextCompiler(),
      screenMemory: store,
      publisher: PerceptionPublisher(runtimeClient: runtime)
    )

    let events = try coordinator.accept(
      frame: CapturedFrame(
        id: "frame-1",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Code",
        windowTitle: "Intentive",
        ocrText: "perception event compiler"
      )
    )

    XCTAssertEqual(events.count, 1)
    XCTAssertEqual(runtime.perceptionEvents.count, 1)
    XCTAssertEqual(store.search("compiler", limit: 10).count, 1)
  }

  func testCaptureCoordinatorStoresLocalRecordAndQueuesPerceptionWhenRuntimeDisconnected() throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let publisher = PerceptionPublisher(
      runtimeClient: runtime,
      outbox: store,
      isRuntimeConnected: { false }
    )
    let coordinator = CaptureCoordinator(
      compiler: ContextCompiler(),
      screenMemory: store,
      publisher: publisher
    )

    let events = try coordinator.accept(
      frame: CapturedFrame(
        id: "offline-frame",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Code",
        windowTitle: "Intentive",
        ocrText: "offline perception outbox"
      )
    )

    XCTAssertEqual(events.map(\.eventId), ["screen-offline-frame"])
    XCTAssertTrue(runtime.perceptionEvents.isEmpty)
    XCTAssertEqual(store.search("offline outbox", limit: 10).first?.record.id, "screen-offline-frame")
    XCTAssertEqual(try store.pendingPerceptionEvents(limit: 10).map(\.eventId), ["screen-offline-frame"])
  }

  func testCaptureCoordinatorStoresPerceptionInSQLiteScreenMemory() throws {
    let runtime = RecordingRuntimeClient()
    let store = try SQLiteScreenMemoryStore(databaseURL: temporaryDatabaseURL())
    let coordinator = CaptureCoordinator(
      compiler: ContextCompiler(),
      screenMemory: store,
      publisher: PerceptionPublisher(runtimeClient: runtime)
    )

    _ = try coordinator.accept(
      frame: CapturedFrame(
        id: "frame-sqlite",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Code",
        windowTitle: "Intentive",
        ocrText: "durable perception event compiler"
      )
    )

    XCTAssertNil(store.lastError)
    XCTAssertEqual(runtime.perceptionEvents.count, 1)
    XCTAssertEqual(try store.searchRecords("durable compiler", limit: 10).first?.record.id, "screen-frame-sqlite")
  }

  func testCaptureCoordinatorKeepsFullOCRLocalWhilePublishingCompactSummary() throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let coordinator = CaptureCoordinator(
      compiler: ContextCompiler(),
      screenMemory: store,
      publisher: PerceptionPublisher(runtimeClient: runtime)
    )
    let fullOCR = ((0..<35).map { "word\($0)" } + ["tail-local-only-token"]).joined(separator: " ")

    _ = try coordinator.accept(
      frame: CapturedFrame(
        id: "full-ocr",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Code",
        windowTitle: "Intentive spec",
        ocrText: fullOCR
      )
    )

    let localRecord = try XCTUnwrap(store.search("tail-local-only-token", limit: 10).first?.record)
    XCTAssertEqual(localRecord.id, "screen-full-ocr")
    XCTAssertEqual(localRecord.windowTitle, "Intentive spec")
    XCTAssertEqual(localRecord.ocrText, fullOCR)
    let published = try XCTUnwrap(runtime.perceptionEvents.first)
    XCTAssertFalse(published.summary.contains("tail-local-only-token"))
  }

  func testCaptureCoordinatorCapturesFromSourceAndStripsRawFrameBytes() async throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let coordinator = CaptureCoordinator(
      compiler: ContextCompiler(),
      screenMemory: store,
      publisher: PerceptionPublisher(runtimeClient: runtime)
    )
    let source = FixedDesktopCaptureSource(
      frame: CapturedFrame(
        id: "native-frame",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Safari",
        windowTitle: "Intentive plan",
        ocrText: "Screen Memory capture source",
        rawFrameBytes: Data([1, 2, 3])
      )
    )

    let events = try await coordinator.captureOnce(from: source)

    XCTAssertEqual(events.count, 1)
    XCTAssertEqual(runtime.perceptionEvents.first?.eventId, "screen-native-frame")
    XCTAssertEqual(store.search("capture source", limit: 10).first?.record.id, "screen-native-frame")
    XCTAssertFalse(try ProtocolEventCodec.encode(events[0]).contains("raw_frame".data(using: .utf8)!))
  }

  func testCaptureCoordinatorSkipsExcludedContextBeforeReadingFrame() async throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let coordinator = CaptureCoordinator(
      compiler: ContextCompiler(settings: CompilerSettings(excludedApps: ["1Password"])),
      screenMemory: store,
      publisher: PerceptionPublisher(runtimeClient: runtime)
    )
    let source = ContextAwareCountingDesktopCaptureSource(
      context: DesktopWindowContext(appName: "1Password", windowTitle: "Vault"),
      frame: CapturedFrame(
        id: "excluded-before-capture",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "1Password",
        windowTitle: "Vault",
        ocrText: "this text should not be read"
      )
    )

    let events = try await coordinator.captureOnce(from: source)

    XCTAssertTrue(events.isEmpty)
    XCTAssertEqual(source.contextReadCount, 1)
    XCTAssertEqual(source.captureCount, 0)
    XCTAssertTrue(runtime.perceptionEvents.isEmpty)
    XCTAssertTrue(store.search("should not be read", limit: 10).isEmpty)
  }

  private func temporaryDatabaseURL() throws -> URL {
    try temporaryDirectory().appendingPathComponent("intentive.db")
  }

  private func screenArtifact(id: String) -> CompiledPerceptionArtifact {
    CompiledPerceptionArtifact(
      id: id,
      artifactType: .searchableScreenRecord,
      capturedAt: "2026-07-05T10:00:00.000Z",
      periodStart: "2026-07-05T10:00:00.000Z",
      periodEnd: "2026-07-05T10:00:00.000Z",
      summary: "queued perception event",
      signals: [:],
      retentionClass: "screen_memory_30d",
      sensitivityLabel: .normal,
      confidence: 0.9,
      localRecordRef: "screen-memory://records/\(id)",
      embedding: nil
    )
  }

  private func temporaryDirectory() throws -> URL {
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("ScreenMemoryCompilerTests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }

}

@MainActor
final class ScreenMemoryCaptureLoopTests: XCTestCase {
  func testCaptureTickStoresAndPublishesSourceFrame() async throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let loop = ScreenMemoryCaptureLoop(
      coordinator: CaptureCoordinator(
        compiler: ContextCompiler(),
        screenMemory: store,
        publisher: PerceptionPublisher(runtimeClient: runtime)
      ),
      source: FixedDesktopCaptureSource(
        frame: CapturedFrame(
          id: "loop-frame",
          capturedAt: "2026-07-05T10:00:00.000Z",
          appName: "Code",
          windowTitle: "Intentive",
          ocrText: "Screen Memory running capture loop"
        )
      )
    )

    let event = await loop.captureTick()

    XCTAssertEqual(event, .captured(eventCount: 1))
    XCTAssertEqual(loop.state.capturedFrameCount, 1)
    XCTAssertEqual(loop.state.publishedEventCount, 1)
    XCTAssertEqual(loop.state.failedCaptureCount, 0)
    XCTAssertEqual(runtime.perceptionEvents.count, 1)
    XCTAssertEqual(store.search("running loop", limit: 10).first?.record.id, "screen-loop-frame")
  }

  func testCaptureLoopRecordsFailureAndContinuesOnNextTick() async throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let source = FailsOnceDesktopCaptureSource(
      frame: CapturedFrame(
        id: "recovered-frame",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Safari",
        windowTitle: "Intentive plan",
        ocrText: "capture recovered"
      )
    )
    let loop = ScreenMemoryCaptureLoop(
      coordinator: CaptureCoordinator(
        compiler: ContextCompiler(),
        screenMemory: store,
        publisher: PerceptionPublisher(runtimeClient: runtime)
      ),
      source: source
    )

    let first = await loop.captureTick()
    let second = await loop.captureTick()

    XCTAssertEqual(first, .failed("transient capture failure"))
    XCTAssertEqual(second, .captured(eventCount: 1))
    XCTAssertEqual(loop.state.failedCaptureCount, 1)
    XCTAssertEqual(loop.state.capturedFrameCount, 1)
    XCTAssertNil(loop.state.lastError)
    XCTAssertEqual(runtime.perceptionEvents.first?.eventId, "screen-recovered-frame")
  }

  func testStartStopAreIdempotent() {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let loop = ScreenMemoryCaptureLoop(
      coordinator: CaptureCoordinator(
        compiler: ContextCompiler(),
        screenMemory: store,
        publisher: PerceptionPublisher(runtimeClient: runtime)
      ),
      source: FixedDesktopCaptureSource(
        frame: CapturedFrame(
          id: "loop-start",
          capturedAt: "2026-07-05T10:00:00.000Z",
          appName: "Code",
          windowTitle: "Intentive",
          ocrText: "loop start"
        )
      ),
      intervalSeconds: 30
    )

    XCTAssertTrue(loop.start())
    XCTAssertFalse(loop.start())
    XCTAssertTrue(loop.state.isRunning)

    loop.stop()

    XCTAssertFalse(loop.state.isRunning)
  }

  func testCaptureLoopSkipsWithoutReadingSourceWhenDisabled() async throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let source = CountingDesktopCaptureSource(
      frame: CapturedFrame(
        id: "disabled-frame",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Code",
        windowTitle: "Intentive",
        ocrText: "disabled capture"
      )
    )
    let loop = ScreenMemoryCaptureLoop(
      coordinator: CaptureCoordinator(
        compiler: ContextCompiler(settings: CompilerSettings(captureEnabled: false)),
        screenMemory: store,
        publisher: PerceptionPublisher(runtimeClient: runtime)
      ),
      source: source,
      settingsProvider: { CompilerSettings(captureEnabled: false) }
    )

    let event = await loop.captureTick()

    XCTAssertEqual(event, .skipped("capture disabled"))
    XCTAssertEqual(loop.state.skippedCaptureCount, 1)
    XCTAssertEqual(loop.state.capturedFrameCount, 0)
    XCTAssertEqual(source.captureCount, 0)
    XCTAssertTrue(runtime.perceptionEvents.isEmpty)
    XCTAssertTrue(store.search("disabled capture", limit: 10).isEmpty)
  }

  func testCaptureLoopSkipsWithoutReadingSourceWhenPermissionIsMissing() async throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let source = CountingDesktopCaptureSource(
      frame: CapturedFrame(
        id: "permission-frame",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Code",
        windowTitle: "Intentive",
        ocrText: "permission capture"
      )
    )
    let loop = ScreenMemoryCaptureLoop(
      coordinator: CaptureCoordinator(
        compiler: ContextCompiler(),
        screenMemory: store,
        publisher: PerceptionPublisher(runtimeClient: runtime)
      ),
      source: source,
      permissionProvider: { false }
    )

    let event = await loop.captureTick()

    XCTAssertEqual(event, .skipped("screen recording permission required"))
    XCTAssertEqual(loop.state.skippedCaptureCount, 1)
    XCTAssertEqual(loop.state.capturedFrameCount, 0)
    XCTAssertEqual(source.captureCount, 0)
    XCTAssertTrue(runtime.perceptionEvents.isEmpty)
    XCTAssertTrue(store.search("permission capture", limit: 10).isEmpty)
  }

  func testCaptureLoopCountsExcludedContextAsSkipWithoutReadingFrame() async throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let settings = CompilerSettings(excludedApps: ["1Password"])
    let source = ContextAwareCountingDesktopCaptureSource(
      context: DesktopWindowContext(appName: "1Password", windowTitle: "Vault"),
      frame: CapturedFrame(
        id: "excluded-loop-frame",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "1Password",
        windowTitle: "Vault",
        ocrText: "excluded loop capture"
      )
    )
    let loop = ScreenMemoryCaptureLoop(
      coordinator: CaptureCoordinator(
        compiler: ContextCompiler(settings: settings),
        screenMemory: store,
        publisher: PerceptionPublisher(runtimeClient: runtime)
      ),
      source: source,
      settingsProvider: { settings }
    )

    let event = await loop.captureTick()

    XCTAssertEqual(event, .skipped("current app skipped"))
    XCTAssertEqual(loop.state.skippedCaptureCount, 1)
    XCTAssertEqual(loop.state.capturedFrameCount, 0)
    XCTAssertEqual(source.contextReadCount, 1)
    XCTAssertEqual(source.captureCount, 0)
    XCTAssertTrue(runtime.perceptionEvents.isEmpty)
    XCTAssertTrue(store.search("excluded loop", limit: 10).isEmpty)
  }

  func testCaptureLoopThrottlesSameContextUntilFallbackWindow() async throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    var now = Date(timeIntervalSince1970: 0)
    let source = ContextAwareCountingDesktopCaptureSource(
      context: DesktopWindowContext(appName: "Code", windowTitle: "Intentive"),
      frame: CapturedFrame(
        id: "cadence-frame",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Code",
        windowTitle: "Intentive",
        ocrText: "cadence capture"
      )
    )
    let loop = ScreenMemoryCaptureLoop(
      coordinator: CaptureCoordinator(
        compiler: ContextCompiler(),
        screenMemory: store,
        publisher: PerceptionPublisher(runtimeClient: runtime)
      ),
      source: source,
      now: { now }
    )

    let first = await loop.captureTick()
    now = Date(timeIntervalSince1970: 3)
    let second = await loop.captureTick()
    now = Date(timeIntervalSince1970: 61)
    let third = await loop.captureTick()

    XCTAssertEqual(first, .captured(eventCount: 1))
    XCTAssertEqual(second, .skipped("same context throttled"))
    XCTAssertEqual(third, .captured(eventCount: 1))
    XCTAssertEqual(loop.state.capturedFrameCount, 2)
    XCTAssertEqual(loop.state.skippedCaptureCount, 1)
    XCTAssertEqual(source.captureCount, 2)
    XCTAssertEqual(runtime.perceptionEvents.count, 2)
  }

  func testCaptureLoopUsesShorterFallbackForMessagingApps() async throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    var now = Date(timeIntervalSince1970: 0)
    let source = ContextAwareCountingDesktopCaptureSource(
      context: DesktopWindowContext(appName: "Slack", windowTitle: "Intentive"),
      frame: CapturedFrame(
        id: "slack-cadence-frame",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Slack",
        windowTitle: "Intentive",
        ocrText: "messaging cadence capture"
      )
    )
    let loop = ScreenMemoryCaptureLoop(
      coordinator: CaptureCoordinator(
        compiler: ContextCompiler(),
        screenMemory: store,
        publisher: PerceptionPublisher(runtimeClient: runtime)
      ),
      source: source,
      now: { now }
    )

    let first = await loop.captureTick()
    now = Date(timeIntervalSince1970: 14)
    let second = await loop.captureTick()
    now = Date(timeIntervalSince1970: 16)
    let third = await loop.captureTick()

    XCTAssertEqual(first, .captured(eventCount: 1))
    XCTAssertEqual(second, .skipped("same context throttled"))
    XCTAssertEqual(third, .captured(eventCount: 1))
    XCTAssertEqual(loop.state.capturedFrameCount, 2)
    XCTAssertEqual(loop.state.skippedCaptureCount, 1)
    XCTAssertEqual(source.captureCount, 2)
  }

  func testCaptureLoopDebouncesContextChangesBeforeCapture() async throws {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    var now = Date(timeIntervalSince1970: 0)
    let source = ContextAwareCountingDesktopCaptureSource(
      context: DesktopWindowContext(appName: "Code", windowTitle: "Intentive"),
      frame: CapturedFrame(
        id: "debounce-code",
        capturedAt: "2026-07-05T10:00:00.000Z",
        appName: "Code",
        windowTitle: "Intentive",
        ocrText: "initial context"
      )
    )
    let loop = ScreenMemoryCaptureLoop(
      coordinator: CaptureCoordinator(
        compiler: ContextCompiler(),
        screenMemory: store,
        publisher: PerceptionPublisher(runtimeClient: runtime)
      ),
      source: source,
      now: { now }
    )

    let first = await loop.captureTick()
    source.context = DesktopWindowContext(appName: "Safari", windowTitle: "Plan")
    source.frame = CapturedFrame(
      id: "debounce-safari",
      capturedAt: "2026-07-05T10:00:05.000Z",
      appName: "Safari",
      windowTitle: "Plan",
      ocrText: "stable context after debounce"
    )
    now = Date(timeIntervalSince1970: 1)
    let second = await loop.captureTick()
    now = Date(timeIntervalSince1970: 5)
    let third = await loop.captureTick()

    XCTAssertEqual(first, .captured(eventCount: 1))
    XCTAssertEqual(second, .skipped("context change debounce"))
    XCTAssertEqual(third, .captured(eventCount: 2))
    XCTAssertEqual(loop.state.capturedFrameCount, 2)
    XCTAssertEqual(loop.state.skippedCaptureCount, 1)
    XCTAssertEqual(source.captureCount, 2)
    XCTAssertEqual(runtime.perceptionEvents.map(\.eventId), ["screen-debounce-code", "screen-debounce-safari", "focus-debounce-safari"])
  }
}

private struct FixedDesktopCaptureSource: DesktopCaptureSource {
  var frame: CapturedFrame

  func captureFrame() async throws -> CapturedFrame {
    frame
  }
}

private enum DesktopCaptureTestError: Error, LocalizedError {
  case transient

  var errorDescription: String? {
    "transient capture failure"
  }
}

private final class FailsOnceDesktopCaptureSource: DesktopCaptureSource {
  private var hasFailed = false
  var frame: CapturedFrame

  init(frame: CapturedFrame) {
    self.frame = frame
  }

  func captureFrame() async throws -> CapturedFrame {
    if !hasFailed {
      hasFailed = true
      throw DesktopCaptureTestError.transient
    }
    return frame
  }
}

private final class CountingDesktopCaptureSource: DesktopCaptureSource {
  private(set) var captureCount = 0
  var frame: CapturedFrame

  init(frame: CapturedFrame) {
    self.frame = frame
  }

  func captureFrame() async throws -> CapturedFrame {
    captureCount += 1
    return frame
  }
}

private final class ContextAwareCountingDesktopCaptureSource: DesktopWindowContextSource {
  private(set) var contextReadCount = 0
  private(set) var captureCount = 0
  var context: DesktopWindowContext
  var frame: CapturedFrame

  init(context: DesktopWindowContext, frame: CapturedFrame) {
    self.context = context
    self.frame = frame
  }

  func activeWindowContext() throws -> DesktopWindowContext {
    contextReadCount += 1
    return context
  }

  func captureFrame() async throws -> CapturedFrame {
    captureCount += 1
    return frame
  }
}

final class RecordingRuntimeClient: RuntimeChatClient {
  private(set) var userMessages: [String] = []
  private(set) var perceptionEvents: [PerceptionEvent] = []
  private(set) var acknowledgements: [String] = []

  @discardableResult
  func sendUserMessage(_ body: String) throws -> ChatMessage {
    userMessages.append(body)
    return ChatMessage(
      id: "user-\(userMessages.count)",
      author: .user,
      body: body,
      at: Date().protocolTimestamp,
      status: .confirmed
    )
  }

  func sendPerceptionEvent(_ event: PerceptionEvent) throws {
    perceptionEvents.append(event)
  }

  func acknowledge(messageId: String) throws {
    acknowledgements.append(messageId)
  }
}

private struct FixedAmbientAudioCaptureService: AudioCaptureService {
  var pcm16k: Data

  func capturePushToTalkAudio() async throws -> Data {
    pcm16k
  }
}

private struct FixedVoiceActivityGate: VoiceActivityGate {
  var hasSpeech: Bool

  func containsSpeech(_ pcm16k: Data) async -> Bool {
    hasSpeech
  }
}

private struct FixedAmbientTranscription: LocalTranscriptionService {
  var text: String

  func transcribe(_ pcm16k: Data) async throws -> String {
    text
  }
}
