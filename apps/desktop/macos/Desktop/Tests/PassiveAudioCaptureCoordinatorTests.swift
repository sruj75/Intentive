import Dispatch
import Foundation
@testable import IntentiveDesktopCore
import XCTest

@MainActor
final class PassiveAudioCaptureCoordinatorTests: XCTestCase {
  func testEligibilityRequiresAuthenticationAndAmbientAudioSetting() {
    XCTAssertFalse(
      PassiveAudioCaptureEligibility.isEnabled(
        authenticated: false,
        ambientAudioCaptureEnabled: true
      )
    )
    XCTAssertFalse(
      PassiveAudioCaptureEligibility.isEnabled(
        authenticated: true,
        ambientAudioCaptureEnabled: false
      )
    )
    XCTAssertTrue(
      PassiveAudioCaptureEligibility.isEnabled(
        authenticated: true,
        ambientAudioCaptureEnabled: true
      )
    )
  }

  func testAuthenticationAndAudioToggleControlPhysicalSources() async {
    let mic = StreamingAudioSourceSpy()
    let system = StreamingAudioSourceSpy()
    let coordinator = makeCoordinator(
      mic: mic, system: system, pipeline: PassiveAudioPipelineSpy())

    coordinator.setUserEnabled(
      PassiveAudioCaptureEligibility.isEnabled(
        authenticated: true,
        ambientAudioCaptureEnabled: true
      )
    )
    await settle()
    XCTAssertTrue(mic.isRunning)

    coordinator.setUserEnabled(
      PassiveAudioCaptureEligibility.isEnabled(
        authenticated: true,
        ambientAudioCaptureEnabled: false
      )
    )
    await settle()
    XCTAssertFalse(mic.isRunning)
    XCTAssertFalse(system.isRunning)

    coordinator.setUserEnabled(
      PassiveAudioCaptureEligibility.isEnabled(
        authenticated: true,
        ambientAudioCaptureEnabled: true
      )
    )
    await settle()
    XCTAssertTrue(mic.isRunning)

    coordinator.setUserEnabled(
      PassiveAudioCaptureEligibility.isEnabled(
        authenticated: false,
        ambientAudioCaptureEnabled: true
      )
    )
    await settle()
    XCTAssertFalse(mic.isRunning)
    XCTAssertFalse(system.isRunning)
  }

  func testStartsMicrophoneAndMeetingGatesSystemAudio() async {
    let mic = StreamingAudioSourceSpy()
    let system = StreamingAudioSourceSpy()
    let pipeline = PassiveAudioPipelineSpy()
    let coordinator = makeCoordinator(mic: mic, system: system, pipeline: pipeline)
    coordinator.setUserEnabled(true)
    await settle()
    XCTAssertEqual(coordinator.state, .running(microphone: true, systemAudio: false))

    coordinator.setMeetingActive(true)
    await settle()
    XCTAssertEqual(coordinator.state, .running(microphone: true, systemAudio: true))
  }

  func testSystemAudioFailureStopsEveryAudioSourceAndReportsRequiredSourceUnavailable() async {
    let mic = StreamingAudioSourceSpy()
    let system = StreamingAudioSourceSpy(startError: TestError.failed)
    let coordinator = makeCoordinator(mic: mic, system: system, pipeline: PassiveAudioPipelineSpy())
    var unavailableSources: [PassiveAudioSource] = []
    coordinator.onRequiredSourceUnavailable = { unavailableSources.append($0) }
    coordinator.setMeetingActive(true)
    coordinator.setUserEnabled(true)
    await settle()
    XCTAssertFalse(mic.isRunning)
    XCTAssertFalse(system.isRunning)
    XCTAssertEqual(unavailableSources, [.systemAudio])
    if case .degraded = coordinator.state {} else { XCTFail("expected degraded state") }
  }

  func testMicrophoneThatStartsWithoutDeliveringAudioFailsClosed() async {
    let mic = StreamingAudioSourceSpy(startupPayload: nil)
    let system = StreamingAudioSourceSpy()
    let coordinator = makeCoordinator(
      mic: mic,
      system: system,
      pipeline: PassiveAudioPipelineSpy(),
      sourceHealthTimeoutNanoseconds: 100_000_000
    )
    var observedStates: [PassiveAudioCaptureState] = []
    coordinator.onStateChange = { observedStates.append($0) }
    var unavailableSources: [PassiveAudioSource] = []
    coordinator.onRequiredSourceUnavailable = { unavailableSources.append($0) }

    coordinator.setUserEnabled(true)
    let failedClosed = await waitUntil { !unavailableSources.isEmpty }
    XCTAssertTrue(failedClosed, "microphone health timeout never fired")

    XCTAssertFalse(mic.isRunning)
    XCTAssertFalse(system.isRunning)
    XCTAssertEqual(unavailableSources, [.microphone])
    XCTAssertFalse(
      observedStates.contains { $0.isRecording },
      "a source that never delivered audio must never be published as recording"
    )
    if case .failed = coordinator.state {} else { XCTFail("expected failed state") }
  }

  func testSystemAudioThatStartsWithoutDeliveringAudioFailsClosed() async {
    let mic = StreamingAudioSourceSpy()
    let system = StreamingAudioSourceSpy(startupPayload: nil)
    let coordinator = makeCoordinator(
      mic: mic,
      system: system,
      pipeline: PassiveAudioPipelineSpy(),
      sourceHealthTimeoutNanoseconds: 400_000_000
    )
    var observedStates: [PassiveAudioCaptureState] = []
    coordinator.onStateChange = { observedStates.append($0) }
    var unavailableSources: [PassiveAudioSource] = []
    coordinator.onRequiredSourceUnavailable = { unavailableSources.append($0) }

    coordinator.setMeetingActive(true)
    coordinator.setUserEnabled(true)
    let failedClosed = await waitUntil(heartbeat: { mic.emit(Data([1])) }) {
      !unavailableSources.isEmpty
    }
    XCTAssertTrue(failedClosed, "system audio health timeout never fired")

    XCTAssertFalse(mic.isRunning)
    XCTAssertFalse(system.isRunning)
    XCTAssertFalse(coordinator.state.isRecording)
    XCTAssertEqual(unavailableSources, [.systemAudio])
    XCTAssertFalse(
      observedStates.contains { $0.isRecording },
      "a healthy microphone must not publish recording while system audio is required but silent"
    )
  }

  func testMicrophoneHeartbeatExpiryAfterInitialAudioFailsClosed() async {
    let timeoutNanoseconds: UInt64 = 200_000_000
    let mic = StreamingAudioSourceSpy()
    let system = StreamingAudioSourceSpy()
    let coordinator = makeCoordinator(
      mic: mic,
      system: system,
      pipeline: PassiveAudioPipelineSpy(),
      sourceHealthTimeoutNanoseconds: timeoutNanoseconds
    )
    var observedStates: [PassiveAudioCaptureState] = []
    coordinator.onStateChange = { observedStates.append($0) }
    var unavailableSources: [PassiveAudioSource] = []
    var failedAtNanoseconds: UInt64?
    coordinator.onRequiredSourceUnavailable = {
      unavailableSources.append($0)
      failedAtNanoseconds = failedAtNanoseconds ?? DispatchTime.now().uptimeNanoseconds
    }

    let enabledAtNanoseconds = DispatchTime.now().uptimeNanoseconds
    coordinator.setUserEnabled(true)
    let failedClosed = await waitUntil { !unavailableSources.isEmpty }
    XCTAssertTrue(failedClosed, "microphone health timeout never fired")

    XCTAssertTrue(
      observedStates.contains(.running(microphone: true, systemAudio: false)),
      "the startup buffer must publish a running state before the heartbeat expires"
    )
    XCTAssertFalse(mic.isRunning)
    XCTAssertFalse(system.isRunning)
    XCTAssertEqual(unavailableSources, [.microphone])
    guard let failedAtNanoseconds else { return XCTFail("fail-closed instant was not recorded") }
    XCTAssertGreaterThanOrEqual(
      failedAtNanoseconds &- enabledAtNanoseconds,
      timeoutNanoseconds,
      "fail-closed must wait out the full heartbeat timeout"
    )
  }

  func testMicrophoneHealthDeadlineTracksTheLatestAudioBuffer() async {
    let timeoutNanoseconds: UInt64 = 300_000_000
    let mic = StreamingAudioSourceSpy()
    let system = StreamingAudioSourceSpy()
    let coordinator = makeCoordinator(
      mic: mic,
      system: system,
      pipeline: PassiveAudioPipelineSpy(),
      sourceHealthTimeoutNanoseconds: timeoutNanoseconds
    )
    var unavailableSources: [PassiveAudioSource] = []
    var failedAtNanoseconds: UInt64?
    coordinator.onRequiredSourceUnavailable = {
      unavailableSources.append($0)
      failedAtNanoseconds = failedAtNanoseconds ?? DispatchTime.now().uptimeNanoseconds
    }

    let armedAtNanoseconds = DispatchTime.now().uptimeNanoseconds
    coordinator.setUserEnabled(true)
    // Keep audio arriving past the halfway point of the deadline armed at
    // start, so a deadline still anchored to the first buffer would fire
    // meaningfully sooner than one timeout after the last buffer below.
    let heldHealthy = await waitUntil(heartbeat: { mic.emit(Data([1])) }) {
      coordinator.state == .running(microphone: true, systemAudio: false)
        && DispatchTime.now().uptimeNanoseconds &- armedAtNanoseconds >= timeoutNanoseconds / 2
    }
    XCTAssertTrue(heldHealthy, "microphone never reported healthy")
    XCTAssertTrue(unavailableSources.isEmpty, "a source delivering audio must stay healthy")

    let lastAudioAtNanoseconds = DispatchTime.now().uptimeNanoseconds
    mic.emit(Data([1]))
    let failedClosed = await waitUntil { !unavailableSources.isEmpty }
    XCTAssertTrue(failedClosed, "microphone health timeout never fired after audio stopped")

    XCTAssertFalse(mic.isRunning)
    XCTAssertFalse(system.isRunning)
    XCTAssertEqual(unavailableSources, [.microphone])
    guard let failedAtNanoseconds else { return XCTFail("fail-closed instant was not recorded") }
    XCTAssertGreaterThanOrEqual(
      failedAtNanoseconds &- lastAudioAtNanoseconds,
      timeoutNanoseconds,
      "audio arriving near the original deadline must extend health from the latest buffer"
    )
  }

  func testSystemAudioHeartbeatExpiryAfterInitialAudioFailsClosed() async {
    let mic = StreamingAudioSourceSpy()
    let system = StreamingAudioSourceSpy()
    let coordinator = makeCoordinator(
      mic: mic,
      system: system,
      pipeline: PassiveAudioPipelineSpy(),
      sourceHealthTimeoutNanoseconds: 400_000_000
    )
    var observedStates: [PassiveAudioCaptureState] = []
    coordinator.onStateChange = { observedStates.append($0) }
    var unavailableSources: [PassiveAudioSource] = []
    coordinator.onRequiredSourceUnavailable = { unavailableSources.append($0) }

    coordinator.setMeetingActive(true)
    coordinator.setUserEnabled(true)
    let failedClosed = await waitUntil(heartbeat: { mic.emit(Data([1])) }) {
      !unavailableSources.isEmpty
    }
    XCTAssertTrue(failedClosed, "system audio health timeout never fired")

    XCTAssertTrue(
      observedStates.contains(.running(microphone: true, systemAudio: true)),
      "both startup buffers must publish a running state before system audio expires"
    )
    XCTAssertFalse(mic.isRunning)
    XCTAssertFalse(system.isRunning)
    XCTAssertFalse(coordinator.state.isRecording)
    XCTAssertEqual(unavailableSources, [.systemAudio])
  }

  func testDisableStopsAndClearsBothSources() async {
    let mic = StreamingAudioSourceSpy()
    let system = StreamingAudioSourceSpy()
    let coordinator = makeCoordinator(
      mic: mic, system: system, pipeline: PassiveAudioPipelineSpy())
    coordinator.setMeetingActive(true)
    coordinator.setUserEnabled(true)
    await settle()
    coordinator.setUserEnabled(false)
    await settle()
    XCTAssertEqual(coordinator.state, .disabled)
    XCTAssertFalse(mic.isRunning)
    XCTAssertFalse(system.isRunning)
    XCTAssertGreaterThanOrEqual(mic.clearCount, 1)
    XCTAssertGreaterThanOrEqual(system.clearCount, 1)
  }

  func testStopCancelsDetachedIngestBeforeLateOutcomeCanMutateState() async {
    let mic = StreamingAudioSourceSpy(startupPayload: nil)
    let pipeline = SuspendedPassiveAudioPipelineSpy()
    let coordinator = PassiveAudioCaptureCoordinator(
      microphone: mic,
      systemAudio: StreamingAudioSourceSpy(),
      pipeline: pipeline,
      microphonePermission: { true },
      systemAudioPermission: { true },
      segmentBytes: 4
    )
    coordinator.setUserEnabled(true)
    await settle()
    mic.emit(Data([1, 2, 3, 4]))
    await pipeline.waitUntilStarted()

    coordinator.stopSynchronously()
    pipeline.complete(with: .failed("late ingest must not escape stop"))
    await settle()

    XCTAssertTrue(pipeline.observedCancellation)
    XCTAssertEqual(coordinator.state, .disabled)
    XCTAssertFalse(mic.isRunning)
  }

  func testPCMIsSourceTaggedAndNeverCrossesThePipelineAsConversationInput() async {
    let mic = StreamingAudioSourceSpy(startupPayload: nil)
    let pipeline = PassiveAudioPipelineSpy()
    let coordinator = makeCoordinator(
      mic: mic, system: StreamingAudioSourceSpy(), pipeline: pipeline, segmentBytes: 4)
    coordinator.setUserEnabled(true)
    await settle()
    mic.emit(Data([1, 2, 3, 4]))
    await settle()
    XCTAssertEqual(pipeline.sources, [.microphone])
    XCTAssertEqual(pipeline.payloads, [Data([1, 2, 3, 4])])
  }

  func testDisableTearsDownMicrophoneStartThatCompletesAfterStop() async {
    let mic = StreamingAudioSourceSpy(startSuspended: true)
    let coordinator = makeCoordinator(
      mic: mic, system: StreamingAudioSourceSpy(), pipeline: PassiveAudioPipelineSpy())
    coordinator.setUserEnabled(true)
    await settle()

    coordinator.setUserEnabled(false)
    mic.completeStart()
    await settle()

    XCTAssertFalse(mic.isRunning)
    XCTAssertEqual(coordinator.state, .disabled)
  }

  func testDisableTearsDownSystemAudioStartThatCompletesAfterStop() async {
    let system = StreamingAudioSourceSpy(startSuspended: true)
    let coordinator = makeCoordinator(
      mic: StreamingAudioSourceSpy(), system: system, pipeline: PassiveAudioPipelineSpy())
    coordinator.setMeetingActive(true)
    coordinator.setUserEnabled(true)
    await settle()

    coordinator.setUserEnabled(false)
    system.completeStart()
    await settle()

    XCTAssertFalse(system.isRunning)
    XCTAssertEqual(coordinator.state, .disabled)
  }

  private func makeCoordinator(
    mic: StreamingAudioSourceSpy,
    system: StreamingAudioSourceSpy,
    pipeline: PassiveAudioPipelineSpy,
    segmentBytes: Int = 8,
    sourceHealthTimeoutNanoseconds: UInt64 = 10_000_000_000
  ) -> PassiveAudioCaptureCoordinator {
    PassiveAudioCaptureCoordinator(
      microphone: mic,
      systemAudio: system,
      pipeline: pipeline,
      microphonePermission: { true },
      systemAudioPermission: { true },
      segmentBytes: segmentBytes,
      sourceHealthTimeoutNanoseconds: sourceHealthTimeoutNanoseconds
    )
  }

  private func settle(nanoseconds: UInt64 = 20_000_000) async {
    await Task.yield()
    try? await Task.sleep(nanoseconds: nanoseconds)
  }

  /// Polls until `condition` holds, optionally delivering `heartbeat` audio on
  /// every poll to hold a source healthy while a different one runs its
  /// deadline down.
  ///
  /// Source health is wall-clock driven, so these tests wait for the observable
  /// outcome and assert lower bounds on elapsed time rather than sampling state
  /// at a fixed instant: a loaded CI runner stretches every sleep, which would
  /// otherwise fail a correct coordinator.
  private func waitUntil(
    ceilingNanoseconds: UInt64 = 10_000_000_000,
    heartbeat: (() -> Void)? = nil,
    _ condition: () -> Bool
  ) async -> Bool {
    let deadline = DispatchTime.now().uptimeNanoseconds &+ ceilingNanoseconds
    while true {
      heartbeat?()
      if condition() { return true }
      guard DispatchTime.now().uptimeNanoseconds < deadline else { return false }
      await settle(nanoseconds: 5_000_000)
    }
  }
}

private final class StreamingAudioSourceSpy: PassiveAudioStreamingSource {
  private(set) var isRunning = false
  private(set) var clearCount = 0
  private var handler: (@Sendable (Data) -> Void)?
  private var startContinuations: [CheckedContinuation<Void, Never>] = []
  let startError: Error?
  let startSuspended: Bool
  let startupPayload: Data?
  init(
    startError: Error? = nil,
    startSuspended: Bool = false,
    startupPayload: Data? = Data([0])
  ) {
    self.startError = startError
    self.startSuspended = startSuspended
    self.startupPayload = startupPayload
  }
  func start(onPCM16k: @escaping @Sendable (Data) -> Void) async throws {
    if let startError { throw startError }
    if startSuspended {
      await withCheckedContinuation { startContinuations.append($0) }
    }
    handler = onPCM16k; isRunning = true
    if let startupPayload { handler?(startupPayload) }
  }
  func stop() { isRunning = false; handler = nil }
  func clearPendingBuffers() { clearCount += 1 }
  func emit(_ data: Data) { handler?(data) }
  func completeStart() {
    let pending = startContinuations
    startContinuations.removeAll()
    pending.forEach { $0.resume() }
  }
}

private final class PassiveAudioPipelineSpy: PassiveAudioIngesting {
  private(set) var sources: [PassiveAudioSource] = []
  private(set) var payloads: [Data] = []
  func ingest(pcm16k: Data, source: PassiveAudioSource, at capturedAt: Date?) async
    -> PassiveAudioIngestOutcome {
    sources.append(source); payloads.append(pcm16k)
    return .captured(source: source, eventPublished: true)
  }
}

@MainActor
private final class SuspendedPassiveAudioPipelineSpy: PassiveAudioIngesting {
  private var continuation: CheckedContinuation<PassiveAudioIngestOutcome, Never>?
  private(set) var started = false
  private(set) var observedCancellation = false

  func ingest(pcm16k: Data, source: PassiveAudioSource, at capturedAt: Date?) async
    -> PassiveAudioIngestOutcome
  {
    started = true
    let outcome = await withCheckedContinuation {
      continuation = $0
    }
    observedCancellation = Task.isCancelled
    return outcome
  }

  func waitUntilStarted() async {
    while !started {
      await Task.yield()
    }
  }

  func complete(with outcome: PassiveAudioIngestOutcome) {
    continuation?.resume(returning: outcome)
    continuation = nil
  }
}

private enum TestError: Error { case failed }
