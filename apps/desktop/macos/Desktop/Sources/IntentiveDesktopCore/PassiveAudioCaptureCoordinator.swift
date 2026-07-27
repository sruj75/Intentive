import Dispatch
import Foundation

public enum PassiveAudioCaptureEligibility {
  public static func isEnabled(
    authenticated: Bool,
    ambientAudioCaptureEnabled: Bool
  ) -> Bool {
    authenticated && ambientAudioCaptureEnabled
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
  private let sourceHealthTimeoutNanoseconds: UInt64
  private var desiredEnabled = false
  private var meetingActive = false
  private var generation = 0
  private var reconcileTask: Task<Void, Never>?
  private var ingestTasks: [UUID: (source: PassiveAudioSource, task: Task<Void, Never>)] = [:]
  private var buffers: [PassiveAudioSource: Data] = [:]
  private var requiredHealthySources = Set<PassiveAudioSource>()
  private var healthySources = Set<PassiveAudioSource>()
  private var sourceEpochs: [PassiveAudioSource: Int] = [:]
  private var sourceHealthTasks: [PassiveAudioSource: Task<Void, Never>] = [:]
  /// Monotonic arrival instant of the newest accepted buffer, per source. The
  /// native sources call the PCM handler once per CoreAudio IO buffer (~90/s
  /// per source at 512 frames), so liveness is recorded with a dictionary write
  /// and one long-lived deadline task per source reads it — rather than each
  /// buffer cancelling and reallocating a `@MainActor` task.
  private var lastAudioAtNanoseconds: [PassiveAudioSource: UInt64] = [:]
  /// Test seam: arming is expected to be O(source starts), not O(buffers).
  private(set) var sourceHealthArmCount = 0

  public private(set) var state: PassiveAudioCaptureState = .disabled {
    didSet { if oldValue != state { onStateChange?(state) } }
  }
  public var onStateChange: ((PassiveAudioCaptureState) -> Void)?
  public var onRequiredSourceUnavailable: ((PassiveAudioSource) -> Void)?

  public init(
    microphone: any PassiveAudioStreamingSource,
    systemAudio: any PassiveAudioStreamingSource,
    pipeline: any PassiveAudioIngesting,
    microphonePermission: @escaping () -> Bool,
    systemAudioPermission: @escaping () -> Bool,
    systemAudioMode: @escaping () -> SystemAudioCaptureMode = { .onlyDuringMeetings },
    segmentBytes: Int = 16_000 * 2 * 4,
    sourceHealthTimeoutNanoseconds: UInt64 = 10_000_000_000
  ) {
    self.microphone = microphone
    self.systemAudio = systemAudio
    self.pipeline = pipeline
    self.microphonePermission = microphonePermission
    self.systemAudioPermission = systemAudioPermission
    self.systemAudioMode = systemAudioMode
    self.segmentBytes = max(2, segmentBytes)
    self.sourceHealthTimeoutNanoseconds = max(1_000_000, sourceHealthTimeoutNanoseconds)
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
    cancelIngestTasks()
    microphone.clearPendingBuffers()
    systemAudio.clearPendingBuffers()
    buffers.removeAll(keepingCapacity: false)
    cancelAllSourceHealthMonitoring()
    state = .disabled
  }

  private func applyPolicy(generation current: Int) async {
    guard desiredEnabled else { stopSynchronously(); return }
    guard microphonePermission() else {
      stopSynchronously()
      state = .permissionBlocked(.microphone)
      return
    }

    let wantsSystemAudio = systemAudioMode() == .always
      || (systemAudioMode() == .onlyDuringMeetings && meetingActive)
    let shouldStartSystemAudio = wantsSystemAudio && systemAudioPermission()
    configureRequiredHealthySources(
      shouldStartSystemAudio ? [.microphone, .systemAudio] : [.microphone]
    )
    state = .starting
    if !microphone.isRunning {
      let epoch = prepareSourceForStart(.microphone)
      do {
        try await microphone.start { [weak self] data in
          Task { @MainActor in
            self?.receive(data, from: .microphone, sourceEpoch: epoch)
          }
        }
      } catch {
        guard current == generation else { return }
        stopSynchronously()
        state = .failed(error.localizedDescription)
        onRequiredSourceUnavailable?(.microphone)
        return
      }
      armSourceHealthTimeout(for: .microphone, sourceEpoch: epoch)
    }
    guard current == generation else {
      discardStaleStart(microphone, source: .microphone)
      return
    }

    if shouldStartSystemAudio {
      if !systemAudio.isRunning {
        let epoch = prepareSourceForStart(.systemAudio)
        do {
          try await systemAudio.start { [weak self] data in
            Task { @MainActor in
              self?.receive(data, from: .systemAudio, sourceEpoch: epoch)
            }
          }
        } catch {
          guard current == generation else { return }
          stopSynchronously()
          state = .degraded("System audio unavailable: \(error.localizedDescription)")
          onRequiredSourceUnavailable?(.systemAudio)
          return
        }
        armSourceHealthTimeout(for: .systemAudio, sourceEpoch: epoch)
      }
    } else {
      stopHealthMonitoring(for: .systemAudio)
      systemAudio.stop()
      cancelIngestTasks(for: .systemAudio)
      systemAudio.clearPendingBuffers()
      buffers[.systemAudio] = nil
    }
    guard current == generation else {
      discardStaleStart(systemAudio, source: .systemAudio)
      return
    }
    publishRunningStateIfHealthy()
  }

  /// A cancelled CoreAudio start is allowed to finish after a newer policy has
  /// already stopped the source. Tear that late start down and reconcile the
  /// newest policy again so a disable cannot leak a live IOProc.
  private func discardStaleStart(
    _ source: any PassiveAudioStreamingSource,
    source kind: PassiveAudioSource
  ) {
    stopHealthMonitoring(for: kind)
    source.stop()
    cancelIngestTasks(for: kind)
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

  private func receive(
    _ data: Data,
    from source: PassiveAudioSource,
    sourceEpoch: Int
  ) {
    guard
      !data.isEmpty,
      desiredEnabled,
      requiredHealthySources.contains(source),
      sourceEpochs[source] == sourceEpoch
    else { return }
    healthySources.insert(source)
    lastAudioAtNanoseconds[source] = DispatchTime.now().uptimeNanoseconds
    publishRunningStateIfHealthy()
    var buffer = buffers[source] ?? Data()
    buffer.append(data)
    guard buffer.count >= segmentBytes else { buffers[source] = buffer; return }
    let segment = buffer.prefix(segmentBytes)
    buffers[source] = Data(buffer.dropFirst(segmentBytes))
    let current = generation
    let taskID = UUID()
    let task = Task { [weak self] in
      guard let self else { return }
      defer { ingestTasks[taskID] = nil }
      let outcome = await pipeline.ingest(pcm16k: Data(segment), source: source, at: nil)
      guard !Task.isCancelled, current == generation else { return }
      if case .failed(let reason) = outcome { state = .degraded(reason) }
    }
    ingestTasks[taskID] = (source, task)
  }

  private func cancelIngestTasks(for source: PassiveAudioSource? = nil) {
    let matchingIDs = ingestTasks.compactMap { id, entry in
      source == nil || entry.source == source ? id : nil
    }
    for id in matchingIDs {
      ingestTasks[id]?.task.cancel()
      ingestTasks[id] = nil
    }
  }

  private func configureRequiredHealthySources(_ required: Set<PassiveAudioSource>) {
    for source in requiredHealthySources.subtracting(required) {
      stopHealthMonitoring(for: source)
    }
    requiredHealthySources = required
  }

  private func prepareSourceForStart(_ source: PassiveAudioSource) -> Int {
    sourceHealthTasks[source]?.cancel()
    sourceHealthTasks[source] = nil
    lastAudioAtNanoseconds[source] = nil
    healthySources.remove(source)
    let epoch = (sourceEpochs[source] ?? 0) + 1
    sourceEpochs[source] = epoch
    return epoch
  }

  /// Start the single liveness deadline for a source.
  ///
  /// The task sleeps to the deadline implied by the newest buffer seen so far.
  /// If audio arrived while it slept it sleeps out the remainder instead of
  /// being cancelled and replaced, so the fail-closed instant still tracks the
  /// last buffer without paying a task allocation per buffer.
  private func armSourceHealthTimeout(
    for source: PassiveAudioSource,
    sourceEpoch: Int
  ) {
    sourceHealthTasks[source]?.cancel()
    sourceHealthArmCount += 1
    lastAudioAtNanoseconds[source] = DispatchTime.now().uptimeNanoseconds
    let timeout = sourceHealthTimeoutNanoseconds
    sourceHealthTasks[source] = Task { @MainActor [weak self] in
      var sleepFor = timeout
      while true {
        do {
          try await Task.sleep(nanoseconds: sleepFor)
        } catch {
          return
        }
        guard !Task.isCancelled, let self else { return }
        guard let lastAudioAt = self.lastAudioAtNanoseconds[source] else { return }
        let elapsed = DispatchTime.now().uptimeNanoseconds &- lastAudioAt
        guard elapsed < timeout else {
          self.handleSourceHealthTimeout(source, sourceEpoch: sourceEpoch)
          return
        }
        sleepFor = timeout - elapsed
      }
    }
  }

  private func handleSourceHealthTimeout(
    _ source: PassiveAudioSource,
    sourceEpoch: Int
  ) {
    guard
      desiredEnabled,
      requiredHealthySources.contains(source),
      sourceEpochs[source] == sourceEpoch
    else { return }
    stopSynchronously()
    let message = "\(source.rawValue) stopped delivering audio"
    state = .failed(message)
    onRequiredSourceUnavailable?(source)
  }

  private func publishRunningStateIfHealthy() {
    guard requiredHealthySources.isSubset(of: healthySources) else {
      state = .starting
      return
    }
    state = .running(
      microphone: microphone.isRunning,
      systemAudio: systemAudio.isRunning
    )
  }

  private func stopHealthMonitoring(for source: PassiveAudioSource) {
    sourceHealthTasks[source]?.cancel()
    sourceHealthTasks[source] = nil
    lastAudioAtNanoseconds[source] = nil
    healthySources.remove(source)
    sourceEpochs[source] = (sourceEpochs[source] ?? 0) + 1
  }

  private func cancelAllSourceHealthMonitoring() {
    for source in [PassiveAudioSource.microphone, .systemAudio] {
      stopHealthMonitoring(for: source)
    }
    requiredHealthySources.removeAll(keepingCapacity: false)
  }
}
