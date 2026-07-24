import Foundation

/// The passive-audio sensing sources Intentive can ingest. Source-neutral so the
/// microphone loop and the system-audio loop feed one ingestion path — adapted
/// from Omi's `AudioSourceManager` routing (mic + system audio), minus Omi's BLE
/// wearable/`ConversationSource`/WAL coupling, which Intentive rejects.
public enum PassiveAudioSource: String, Sendable, CaseIterable {
  case microphone
  case systemAudio
}

/// Outcome of ingesting one source-neutral PCM segment. Observability parity with
/// `AmbientAudioCaptureLoopEvent`; the pipeline exposes no dictation, composer, or
/// playback result — only a perception summary is produced downstream.
public enum PassiveAudioIngestOutcome: Equatable, Sendable {
  case captured(source: PassiveAudioSource, eventPublished: Bool)
  case skipped(String)
  case failed(String)
}

/// Source-neutral passive-audio perception. Takes already-captured 16 kHz mono PCM
/// tagged by source, gates it (microphone by voice activity, system audio by the
/// meeting/activity mode), transcribes it on device, stores the transcript locally
/// under retention, and emits a compact hard-secret-filtered `ambient_audio_summary`
/// perception event. Raw audio is never retained past transcription, and there is no
/// interface to place text in the composer or to speak — see slice 8 of the Omi
/// renovation plan.
///
/// This is the public seam named in the plan (`PassiveAudioContextPipeline`). The mic
/// and system-audio capture loops are thin drivers over it; the real Silero VAD and
/// FluidAudio/Parakeet transcription are injected at the `VoiceActivityGate` /
/// `LocalTranscriptionService` boundaries.
@MainActor
public final class PassiveAudioContextPipeline {
  private let coordinator: AmbientAudioCoordinator
  private let voiceGate: VoiceActivityGate
  private let transcription: LocalTranscriptionService
  private let settingsProvider: () -> CompilerSettings
  private let privacySnapshotProvider: () -> ScreenMemoryPrivacySnapshot
  private let microphonePermissionProvider: () -> Bool
  private let systemAudioPermissionProvider: () -> Bool
  private let systemAudioModeProvider: () -> SystemAudioCaptureMode
  private let meetingActiveProvider: () -> Bool
  private let activeWindowProvider: (() throws -> DesktopWindowContext?)?
  private let now: () -> Date
  private let idFactory: () -> String
  private var cadenceGate: AmbientAudioCadenceGate

  public init(
    coordinator: AmbientAudioCoordinator,
    voiceGate: VoiceActivityGate,
    transcription: LocalTranscriptionService,
    settingsProvider: @escaping () -> CompilerSettings = { CompilerSettings() },
    privacySnapshotProvider: @escaping () -> ScreenMemoryPrivacySnapshot = {
      ScreenMemoryPrivacySnapshot()
    },
    microphonePermissionProvider: @escaping () -> Bool = { true },
    systemAudioPermissionProvider: @escaping () -> Bool = { true },
    systemAudioModeProvider: @escaping () -> SystemAudioCaptureMode = { .onlyDuringMeetings },
    meetingActiveProvider: @escaping () -> Bool = { false },
    activeWindowProvider: (() throws -> DesktopWindowContext?)? = nil,
    now: @escaping () -> Date = { Date() },
    idFactory: @escaping () -> String = { UUID().uuidString },
    cadenceGate: AmbientAudioCadenceGate = AmbientAudioCadenceGate()
  ) {
    self.coordinator = coordinator
    self.voiceGate = voiceGate
    self.transcription = transcription
    self.settingsProvider = settingsProvider
    self.privacySnapshotProvider = privacySnapshotProvider
    self.microphonePermissionProvider = microphonePermissionProvider
    self.systemAudioPermissionProvider = systemAudioPermissionProvider
    self.systemAudioModeProvider = systemAudioModeProvider
    self.meetingActiveProvider = meetingActiveProvider
    self.activeWindowProvider = activeWindowProvider
    self.now = now
    self.idFactory = idFactory
    self.cadenceGate = cadenceGate
  }

  /// Ingest one already-captured PCM segment. `pcm16k` is 16 kHz mono PCM16LE; it is
  /// consumed for transcription and never stored. Returns the ingest outcome.
  @discardableResult
  public func ingest(
    pcm16k: Data,
    source: PassiveAudioSource,
    at capturedAt: Date? = nil
  ) async -> PassiveAudioIngestOutcome {
    let settings = settingsProvider()

    guard settings.captureEnabled else {
      return .skipped("capture disabled")
    }
    guard settings.ambientAudioCaptureEnabled else {
      return .skipped("ambient audio capture disabled")
    }

    // Permissions fail closed, independently per source.
    switch source {
    case .microphone:
      guard microphonePermissionProvider() else {
        return .skipped("microphone permission required")
      }
    case .systemAudio:
      guard systemAudioPermissionProvider() else {
        return .skipped("system audio permission required")
      }
    }

    // Excluded apps never enter the audio archive/outbox path.
    do {
      if let context = try activeWindowProvider?() {
        let privacy = privacySnapshotProvider()
        guard !settings.isExcluded(appName: context.appName),
          privacy.allows(appBundleID: context.appBundleID, appName: context.appName)
        else {
          return .skipped("current app skipped")
        }
      }
    } catch {
      return .failed(error.localizedDescription)
    }

    // Source-specific gate: microphone by voice activity (Silero VAD), system audio
    // by the meeting/activity mode (Omi's `Always` / `Only during meetings` / `Never`).
    let periodStart = now()
    switch source {
    case .microphone:
      guard await voiceGate.containsSpeech(pcm16k) else {
        return .skipped("no speech detected")
      }
    case .systemAudio:
      switch systemAudioModeProvider() {
      case .never:
        return .skipped("system audio capture disabled")
      case .onlyDuringMeetings:
        guard meetingActiveProvider() else {
          return .skipped("system audio gated: no active meeting")
        }
      case .always:
        break
      }
    }

    do {
      let rawTranscript = try await transcription.transcribe(pcm16k)
      let transcriptText = rawTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !transcriptText.isEmpty else {
        return .skipped("empty transcript")
      }
      let capturedAtDate = capturedAt ?? now()
      guard cadenceGate.shouldEmit(transcript: transcriptText, capturedAt: capturedAtDate) else {
        return .skipped("ambient audio cadence throttled")
      }
      let transcript = AmbientAudioTranscript(
        id: idFactory(),
        capturedAt: capturedAtDate.protocolTimestamp,
        periodStart: periodStart.protocolTimestamp,
        periodEnd: capturedAtDate.protocolTimestamp,
        transcript: transcriptText,
        source: source.rawValue
      )
      let event = try coordinator.accept(transcript: transcript)
      return .captured(source: source, eventPublished: event != nil)
    } catch {
      return .failed(error.localizedDescription)
    }
  }
}
