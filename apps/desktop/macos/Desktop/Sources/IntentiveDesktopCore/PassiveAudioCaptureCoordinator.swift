import Foundation

public enum PassiveAudioCaptureEligibility {
  public static func isEnabled(
    authenticated: Bool,
    screenCaptureEnabled: Bool,
    ambientAudioCaptureEnabled: Bool
  ) -> Bool {
    authenticated && screenCaptureEnabled && ambientAudioCaptureEnabled
  }
}

public protocol PassiveAudioStreamingSource: AnyObject {
  var isRunning: Bool { get }
  func start(onPCM16k: @escaping @Sendable (Data) -> Void) async throws
  func stop()
  func clearPendingBuffers()
}

public protocol PassiveAudioIngesting: AnyObject {
  func ingest(pcm16k: Data, source: PassiveAudioSource, at capturedAt: Date?) async
    -> PassiveAudioIngestOutcome
}

extension PassiveAudioContextPipeline: PassiveAudioIngesting {}

public enum PassiveAudioCaptureState: Equatable, Sendable {
  case disabled
  case permissionBlocked(PassiveAudioSource)
  case starting
  case running(microphone: Bool, systemAudio: Bool)
  case degraded(String)
  case failed(String)

  public var isRecording: Bool {
    if case .running(let microphone, let systemAudio) = self { return microphone || systemAudio }
    if case .degraded = self { return true }
    return false
  }
}

/// Renovated from Omi's `AppState+Transcription` reconciliation. It owns both
/// physical sources, coalesces policy changes, and feeds only source-tagged PCM
/// into the local passive-audio pipeline.
@MainActor
public final class PassiveAudioCaptureCoordinator {
  private let microphone: any PassiveAudioStreamingSource
  private let systemAudio: any PassiveAudioStreamingSource
  private let pipeline: any PassiveAudioIngesting
  private let microphonePermission: () -> Bool
  private let systemAudioPermission: () -> Bool
  private let systemAudioMode: () -> SystemAudioCaptureMode
  private let segmentBytes: Int
  private var desiredEnabled = false
  private var meetingActive = false
  private var generation = 0
  private var reconcileTask: Task<Void, Never>?
  private var buffers: [PassiveAudioSource: Data] = [:]

  public private(set) var state: PassiveAudioCaptureState = .disabled {
    didSet { if oldValue != state { onStateChange?(state) } }
  }
  public var onStateChange: ((PassiveAudioCaptureState) -> Void)?

  public init(
    microphone: any PassiveAudioStreamingSource,
    systemAudio: any PassiveAudioStreamingSource,
    pipeline: any PassiveAudioIngesting,
    microphonePermission: @escaping () -> Bool,
    systemAudioPermission: @escaping () -> Bool,
    systemAudioMode: @escaping () -> SystemAudioCaptureMode = { .onlyDuringMeetings },
    segmentBytes: Int = 16_000 * 2 * 4
  ) {
    self.microphone = microphone
    self.systemAudio = systemAudio
    self.pipeline = pipeline
    self.microphonePermission = microphonePermission
    self.systemAudioPermission = systemAudioPermission
    self.systemAudioMode = systemAudioMode
    self.segmentBytes = max(2, segmentBytes)
  }

  public func setUserEnabled(_ enabled: Bool) {
    desiredEnabled = enabled
    reconcile()
  }

  public func setMeetingActive(_ active: Bool) {
    meetingActive = active
    reconcile()
  }

  public func reconcile() {
    generation += 1
    let current = generation
    reconcileTask?.cancel()
    reconcileTask = Task { [weak self] in
      guard let self else { return }
      await self.applyPolicy(generation: current)
    }
  }

  public func stopSynchronously() {
    generation += 1
    reconcileTask?.cancel()
    microphone.stop()
    systemAudio.stop()
    microphone.clearPendingBuffers()
    systemAudio.clearPendingBuffers()
    buffers.removeAll(keepingCapacity: false)
    state = .disabled
  }

  private func applyPolicy(generation current: Int) async {
    guard desiredEnabled else { stopSynchronously(); return }
    guard microphonePermission() else {
      stopSynchronously()
      state = .permissionBlocked(.microphone)
      return
    }

    state = .starting
    if !microphone.isRunning {
      do {
        try await microphone.start { [weak self] data in
          Task { @MainActor in self?.receive(data, from: .microphone) }
        }
      } catch {
        guard current == generation else { return }
        stopSynchronously()
        state = .failed(error.localizedDescription)
        return
      }
    }
    guard current == generation else {
      discardStaleStart(microphone, source: .microphone)
      return
    }

    let wantsSystemAudio = systemAudioMode() == .always
      || (systemAudioMode() == .onlyDuringMeetings && meetingActive)
    if wantsSystemAudio && systemAudioPermission() {
      if !systemAudio.isRunning {
        do {
          try await systemAudio.start { [weak self] data in
            Task { @MainActor in self?.receive(data, from: .systemAudio) }
          }
        } catch {
          guard current == generation else { return }
          state = .degraded("System audio unavailable: \(error.localizedDescription)")
          return
        }
      }
    } else {
      systemAudio.stop()
      systemAudio.clearPendingBuffers()
      buffers[.systemAudio] = nil
    }
    guard current == generation else {
      discardStaleStart(systemAudio, source: .systemAudio)
      return
    }
    state = .running(microphone: microphone.isRunning, systemAudio: systemAudio.isRunning)
  }

  /// A cancelled CoreAudio start is allowed to finish after a newer policy has
  /// already stopped the source. Tear that late start down and reconcile the
  /// newest policy again so a disable cannot leak a live IOProc.
  private func discardStaleStart(
    _ source: any PassiveAudioStreamingSource,
    source kind: PassiveAudioSource
  ) {
    source.stop()
    source.clearPendingBuffers()
    buffers[kind] = nil
    if desiredEnabled {
      let latest = generation
      Task { @MainActor [weak self] in
        await Task.yield()
        guard let self, self.generation == latest, self.desiredEnabled
        else { return }
        self.reconcile()
      }
    }
  }

  private func receive(_ data: Data, from source: PassiveAudioSource) {
    guard !data.isEmpty, desiredEnabled else { return }
    var buffer = buffers[source] ?? Data()
    buffer.append(data)
    guard buffer.count >= segmentBytes else { buffers[source] = buffer; return }
    let segment = buffer.prefix(segmentBytes)
    buffers[source] = Data(buffer.dropFirst(segmentBytes))
    let current = generation
    Task { [weak self] in
      guard let self else { return }
      let outcome = await pipeline.ingest(pcm16k: Data(segment), source: source, at: nil)
      guard current == generation else { return }
      if case .failed(let reason) = outcome { state = .degraded(reason) }
    }
  }
}
