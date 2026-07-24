import Foundation
@testable import IntentiveDesktopCore
import XCTest

@MainActor
final class PassiveAudioCaptureCoordinatorTests: XCTestCase {
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

  func testSystemAudioFailureDegradesButMicrophoneContinues() async {
    let mic = StreamingAudioSourceSpy()
    let system = StreamingAudioSourceSpy(startError: TestError.failed)
    let coordinator = makeCoordinator(mic: mic, system: system, pipeline: PassiveAudioPipelineSpy())
    coordinator.setMeetingActive(true)
    coordinator.setUserEnabled(true)
    await settle()
    XCTAssertTrue(mic.isRunning)
    if case .degraded = coordinator.state {} else { XCTFail("expected degraded state") }
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

  func testPCMIsSourceTaggedAndNeverCrossesThePipelineAsConversationInput() async {
    let mic = StreamingAudioSourceSpy()
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
    segmentBytes: Int = 8
  ) -> PassiveAudioCaptureCoordinator {
    PassiveAudioCaptureCoordinator(
      microphone: mic,
      systemAudio: system,
      pipeline: pipeline,
      microphonePermission: { true },
      systemAudioPermission: { true },
      segmentBytes: segmentBytes
    )
  }

  private func settle() async { await Task.yield(); try? await Task.sleep(nanoseconds: 20_000_000) }
}

private final class StreamingAudioSourceSpy: PassiveAudioStreamingSource {
  private(set) var isRunning = false
  private(set) var clearCount = 0
  private var handler: (@Sendable (Data) -> Void)?
  private var startContinuations: [CheckedContinuation<Void, Never>] = []
  let startError: Error?
  let startSuspended: Bool
  init(startError: Error? = nil, startSuspended: Bool = false) {
    self.startError = startError
    self.startSuspended = startSuspended
  }
  func start(onPCM16k: @escaping @Sendable (Data) -> Void) async throws {
    if let startError { throw startError }
    if startSuspended {
      await withCheckedContinuation { startContinuations.append($0) }
    }
    handler = onPCM16k; isRunning = true
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

private enum TestError: Error { case failed }
