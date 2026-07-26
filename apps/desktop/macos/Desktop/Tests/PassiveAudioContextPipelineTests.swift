import XCTest

@testable import IntentiveDesktopCore

/// Slice 08 — passive local audio perception. Proves the source-neutral
/// `PassiveAudioContextPipeline`: VAD-gated microphone, meeting/activity-gated
/// system audio, per-source fail-closed permissions, hard-secret filtering,
/// retain-no-raw-audio, and that passive audio never populates the composer or
/// produces a spoken response.
@MainActor
final class PassiveAudioContextPipelineTests: XCTestCase {
  private let pcm = Data([1, 2, 3, 4, 5, 6, 7, 8])

  private struct Harness {
    let pipeline: PassiveAudioContextPipeline
    let runtime: RecordingRuntimeClient
    let store: InMemoryScreenMemoryStore
  }

  private func makeHarness(
    hasSpeech: Bool = true,
    transcript: String = "review the launch checklist before standup",
    settings: CompilerSettings = CompilerSettings(ambientAudioCaptureEnabled: true),
    microphonePermission: Bool = true,
    systemAudioPermission: Bool = true,
    systemAudioMode: SystemAudioCaptureMode = .onlyDuringMeetings,
    meetingActive: Bool = false,
    activeWindow: (() throws -> DesktopWindowContext?)? = nil,
    idFactory: @escaping () -> String = { "passive-audio-fixed" },
    cadence: AmbientAudioCadenceGate = AmbientAudioCadenceGate()
  ) -> Harness {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let coordinator = AmbientAudioCoordinator(
      audioMemory: store,
      publisher: PerceptionPublisher(runtimeClient: runtime, windowIdProvider: desktopTestCoachingWindowIdProvider)
    )
    let pipeline = PassiveAudioContextPipeline(
      coordinator: coordinator,
      voiceGate: StubVoiceActivityGate(hasSpeech: hasSpeech),
      transcription: StubTranscription(text: transcript),
      settingsProvider: { settings },
      microphonePermissionProvider: { microphonePermission },
      systemAudioPermissionProvider: { systemAudioPermission },
      systemAudioModeProvider: { systemAudioMode },
      meetingActiveProvider: { meetingActive },
      activeWindowProvider: activeWindow,
      idFactory: idFactory,
      cadenceGate: cadence
    )
    return Harness(pipeline: pipeline, runtime: runtime, store: store)
  }

  // MARK: - Source-neutral ingestion

  func testMicrophoneSpeechIsStoredLocallyAndSummaryPublished() async throws {
    let h = makeHarness()

    let outcome = await h.pipeline.ingest(pcm16k: pcm, source: .microphone)

    XCTAssertEqual(outcome, .captured(source: .microphone, eventPublished: true))
    XCTAssertEqual(
      h.store.recentAudioMemory(limit: 1).first?.transcript,
      "review the launch checklist before standup")
    let event = try XCTUnwrap(h.runtime.perceptionEvents.first)
    XCTAssertEqual(event.artifactType, .ambientAudioSummary)
    XCTAssertEqual(event.signals["audio_source"], .string("microphone"))
  }

  func testMicrophoneSpeechIsCapturedWhenScreenCaptureIsDisabled() async throws {
    let h = makeHarness(
      settings: CompilerSettings(
        captureEnabled: false,
        ambientAudioCaptureEnabled: true
      )
    )

    let outcome = await h.pipeline.ingest(pcm16k: pcm, source: .microphone)

    XCTAssertEqual(outcome, .captured(source: .microphone, eventPublished: true))
    XCTAssertEqual(
      h.store.recentAudioMemory(limit: 1).first?.transcript,
      "review the launch checklist before standup")
    XCTAssertEqual(
      try XCTUnwrap(h.runtime.perceptionEvents.first).artifactType,
      .ambientAudioSummary)
  }

  func testSystemAudioInAlwaysModeIsStoredAndPublished() async throws {
    let h = makeHarness(systemAudioMode: .always)

    let outcome = await h.pipeline.ingest(pcm16k: pcm, source: .systemAudio)

    XCTAssertEqual(outcome, .captured(source: .systemAudio, eventPublished: true))
    let event = try XCTUnwrap(h.runtime.perceptionEvents.first)
    XCTAssertEqual(event.signals["audio_source"], .string("systemAudio"))
  }

  // MARK: - Microphone VAD gate

  func testMicrophoneSilenceIsGatedByVoiceActivity() async {
    let h = makeHarness(hasSpeech: false)

    let outcome = await h.pipeline.ingest(pcm16k: pcm, source: .microphone)

    XCTAssertEqual(outcome, .skipped("no speech detected"))
    XCTAssertTrue(h.store.recentAudioMemory(limit: 1).isEmpty)
    XCTAssertTrue(h.runtime.perceptionEvents.isEmpty)
  }

  // MARK: - System-audio meeting gate

  func testSystemAudioSuppressedOutsideMeetingByDefault() async {
    let h = makeHarness(systemAudioMode: .onlyDuringMeetings, meetingActive: false)

    let outcome = await h.pipeline.ingest(pcm16k: pcm, source: .systemAudio)

    XCTAssertEqual(outcome, .skipped("system audio gated: no active meeting"))
    XCTAssertTrue(h.runtime.perceptionEvents.isEmpty)
  }

  func testSystemAudioCapturedDuringActiveMeeting() async {
    let h = makeHarness(systemAudioMode: .onlyDuringMeetings, meetingActive: true)

    let outcome = await h.pipeline.ingest(pcm16k: pcm, source: .systemAudio)

    XCTAssertEqual(outcome, .captured(source: .systemAudio, eventPublished: true))
  }

  func testMicrophoneIsNotGovernedByMeetingState() async {
    // The plan splits the two sources: microphone is VAD-gated continuously and does
    // not wait for a meeting, even while system audio is meeting-only.
    let h = makeHarness(systemAudioMode: .onlyDuringMeetings, meetingActive: false)

    let outcome = await h.pipeline.ingest(pcm16k: pcm, source: .microphone)

    XCTAssertEqual(outcome, .captured(source: .microphone, eventPublished: true))
  }

  func testSystemAudioNeverModeIsAlwaysSuppressed() async {
    let h = makeHarness(systemAudioMode: .never, meetingActive: true)

    let outcome = await h.pipeline.ingest(pcm16k: pcm, source: .systemAudio)

    XCTAssertEqual(outcome, .skipped("system audio capture disabled"))
  }

  // MARK: - Permissions fail closed, per source

  func testMicrophonePermissionDeniedSkipsMicButNotSystemAudio() async {
    let h = makeHarness(
      microphonePermission: false,
      systemAudioPermission: true,
      systemAudioMode: .always)

    let micOutcome = await h.pipeline.ingest(pcm16k: pcm, source: .microphone)
    let systemOutcome = await h.pipeline.ingest(pcm16k: pcm, source: .systemAudio)

    XCTAssertEqual(micOutcome, .skipped("microphone permission required"))
    XCTAssertEqual(systemOutcome, .captured(source: .systemAudio, eventPublished: true))
  }

  func testSystemAudioPermissionDeniedSkipsSystemAudioButNotMic() async {
    let h = makeHarness(
      microphonePermission: true,
      systemAudioPermission: false,
      systemAudioMode: .always)

    let systemOutcome = await h.pipeline.ingest(pcm16k: pcm, source: .systemAudio)
    let micOutcome = await h.pipeline.ingest(pcm16k: pcm, source: .microphone)

    XCTAssertEqual(systemOutcome, .skipped("system audio permission required"))
    XCTAssertEqual(micOutcome, .captured(source: .microphone, eventPublished: true))
  }

  // MARK: - Hard-secret filtering

  func testSecretTranscriptStaysLocalButSummaryIsSuppressed() async throws {
    let h = makeHarness(transcript: "the deploy password is hunter2")

    let outcome = await h.pipeline.ingest(pcm16k: pcm, source: .microphone)

    XCTAssertEqual(outcome, .captured(source: .microphone, eventPublished: true))
    // Local truth preserved.
    XCTAssertEqual(
      h.store.recentAudioMemory(limit: 1).first?.transcript, "the deploy password is hunter2")
    // Outbound content suppressed: placeholder summary, no embedding, redacted flag.
    let event = try XCTUnwrap(h.runtime.perceptionEvents.first)
    XCTAssertEqual(event.summary, "Secret-like ambient audio content was detected and suppressed.")
    XCTAssertEqual(event.sensitivityLabel, .secretDetected)
    XCTAssertNil(event.embeddingRef)
    XCTAssertEqual(event.signals["transcript_redacted"], .bool(true))
  }

  // MARK: - Retain no raw audio

  func testRawAudioIsNeverRetainedOrSynced() async throws {
    let h = makeHarness()

    _ = await h.pipeline.ingest(pcm16k: pcm, source: .microphone)

    // Local store holds a text transcript only — there is no audio-bytes field.
    let record = try XCTUnwrap(h.store.recentAudioMemory(limit: 1).first)
    XCTAssertFalse(record.transcript.isEmpty)
    // The synced event references an opaque local record by UUID, never a media
    // payload or path.
    let event = try XCTUnwrap(h.runtime.perceptionEvents.first)
    XCTAssertNotNil(UUID(uuidString: event.localRecordRef))
    XCTAssertFalse(event.localRecordRef.hasPrefix("/"))
  }

  // MARK: - No composer / no spoken output

  func testPassiveAudioNeverPopulatesComposerOrSpeaks() async {
    // Passive audio flows only down the perception path — it must never send a
    // user_message (composer) and there is no playback/TTS interface on the pipeline.
    let h = makeHarness()

    _ = await h.pipeline.ingest(pcm16k: pcm, source: .microphone)

    XCTAssertTrue(h.runtime.userMessages.isEmpty)
    XCTAssertFalse(h.runtime.perceptionEvents.isEmpty)
  }

  // MARK: - Cadence + empty transcript

  func testRepeatedTranscriptIsThrottledByCadence() async {
    let h = makeHarness(cadence: AmbientAudioCadenceGate(minimumIntervalSeconds: 3600))

    let first = await h.pipeline.ingest(pcm16k: pcm, source: .microphone)
    let second = await h.pipeline.ingest(pcm16k: pcm, source: .microphone)

    XCTAssertEqual(first, .captured(source: .microphone, eventPublished: true))
    XCTAssertEqual(second, .skipped("ambient audio cadence throttled"))
    XCTAssertEqual(h.runtime.perceptionEvents.count, 1)
  }

  func testEmptyTranscriptIsSkipped() async {
    let h = makeHarness(transcript: "   ")

    let outcome = await h.pipeline.ingest(pcm16k: pcm, source: .microphone)

    XCTAssertEqual(outcome, .skipped("empty transcript"))
  }

  func testExcludedActiveAppIsSkipped() async {
    let h = makeHarness(
      settings: CompilerSettings(excludedApps: ["1Password"], ambientAudioCaptureEnabled: true),
      activeWindow: { DesktopWindowContext(appName: "1Password") })

    let outcome = await h.pipeline.ingest(pcm16k: pcm, source: .microphone)

    XCTAssertEqual(outcome, .skipped("current app skipped"))
  }
}

// MARK: - Fakes

private struct StubVoiceActivityGate: VoiceActivityGate {
  var hasSpeech: Bool
  func containsSpeech(_ pcm16k: Data) async -> Bool { hasSpeech }
}

private struct StubTranscription: LocalTranscriptionService {
  var text: String
  func transcribe(_ pcm16k: Data) async throws -> String { text }
}
