@testable import IntentiveDesktopCore
import XCTest

/// Native sources call the PCM handler once per CoreAudio IO buffer (~90/s per
/// source at 512 frames), so anything the coordinator does per buffer runs at
/// that rate for the whole life of a Coaching Window. This measures the cost of
/// the source-liveness bookkeeping on that path.
@MainActor
final class PassiveAudioSourceHealthCostTests: XCTestCase {
  /// A live Coaching Window delivers ~90 buffers/second/source. Sample well
  /// past that so the harness's own fixed drain cost cannot dominate the
  /// per-buffer figure.
  private let bufferCount = 50_000

  func testSustainedBufferDeliveryDoesNotRearmTheLivenessDeadlinePerBuffer() async throws {
    let mic = HealthCostSourceSpy()
    let system = HealthCostSourceSpy()
    let coordinator = PassiveAudioCaptureCoordinator(
      microphone: mic,
      systemAudio: system,
      pipeline: HealthCostPipelineSpy(),
      microphonePermission: { true },
      systemAudioPermission: { true },
      // Keep the segment threshold above anything this test emits so the
      // measurement isolates liveness bookkeeping from ingest work.
      segmentBytes: 1_000_000,
      sourceHealthTimeoutNanoseconds: 10_000_000_000
    )

    coordinator.setUserEnabled(true)
    await settle()
    XCTAssertEqual(coordinator.state, .running(microphone: true, systemAudio: false))

    let started = DispatchTime.now().uptimeNanoseconds
    for _ in 0..<bufferCount {
      mic.emit(Data([1]))
    }
    // Drain by yielding rather than sleeping a fixed interval: a fixed sleep
    // would dominate the sample and mask what each buffer actually costs.
    await drain()
    let elapsed = DispatchTime.now().uptimeNanoseconds - started
    let perBuffer = Double(elapsed) / Double(bufferCount)

    print("[PERF] \(bufferCount) buffers in \(elapsed / 1_000_000) ms — \(Int(perBuffer)) ns/buffer")

    // The invariant, asserted instead of a wall-clock threshold so the signal
    // does not depend on how fast the machine is: arming the liveness deadline
    // costs a cancelled Task plus a fresh `@MainActor` task with a 10s sleep,
    // so it must happen once per source start, never once per buffer.
    XCTAssertEqual(
      coordinator.sourceHealthArmCount,
      1,
      "liveness deadline was re-armed per buffer instead of once per source start"
    )
  }

  private func settle(nanoseconds: UInt64 = 50_000_000) async {
    await Task.yield()
    try? await Task.sleep(nanoseconds: nanoseconds)
  }

  private func drain() async {
    for _ in 0..<200 {
      await Task.yield()
    }
  }
}

private final class HealthCostSourceSpy: PassiveAudioStreamingSource {
  private(set) var isRunning = false
  private var handler: (@Sendable (Data) -> Void)?

  func start(onPCM16k: @escaping @Sendable (Data) -> Void) async throws {
    handler = onPCM16k
    isRunning = true
    handler?(Data([0]))
  }

  func stop() {
    isRunning = false
    handler = nil
  }

  func clearPendingBuffers() {}

  func emit(_ data: Data) { handler?(data) }
}

private final class HealthCostPipelineSpy: PassiveAudioIngesting {
  func ingest(
    pcm16k: Data,
    source: PassiveAudioSource,
    at capturedAt: Date?
  ) async -> PassiveAudioIngestOutcome {
    .skipped("cost harness")
  }
}
