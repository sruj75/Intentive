import Foundation
@testable import IntentiveDesktopCore
import XCTest

@MainActor
final class ScreenMemoryCaptureResilienceTests: XCTestCase {

  // MARK: - 1. Dynamic cadence on battery

  func testCaptureIntervalReflectsBatteryState() {
    let power = FakePowerSource(isOnBattery: false)
    let ctrl = makeController(powerSource: power)
    XCTAssertEqual(ctrl.captureInterval(at: Date()), 3)

    power.isOnBattery = true
    XCTAssertEqual(ctrl.captureInterval(at: Date()), 9)

    power.isOnBattery = false
    XCTAssertEqual(ctrl.captureInterval(at: Date()), 3)
  }

  func testCadenceDefaultsMatchPlan() {
    let cadence = DesktopCaptureCadence()
    XCTAssertEqual(cadence.interval(isOnBattery: false), 3)
    XCTAssertEqual(cadence.interval(isOnBattery: true), 9)
  }

  // MARK: - 2. Sleep pauses; wake resumes

  func testSystemSleepPausesAndWakeResumes() async throws {
    let observer = RecordingCaptureSystemEventObserver()
    let loop = makeLoop()
    let ctrl = makeController(loop: loop, systemEventObserver: observer)
    XCTAssertTrue(loop.start())
    XCTAssertTrue(loop.state.isRunning)

    ctrl.installSystemEventObservers()
    observer.fire(.systemSleep)
    await Task.yield()
    XCTAssertFalse(loop.state.isRunning)
    XCTAssertEqual(ctrl.pausedReason, .systemSleep)
    XCTAssertTrue(ctrl.wasAutoPaused)

    // Wake resumes after the settle delay — flush the scheduled task.
    observer.fire(.systemWake)
    await flushPendingTasks()
    XCTAssertTrue(loop.state.isRunning)
    XCTAssertNil(ctrl.pausedReason)
    XCTAssertFalse(ctrl.wasAutoPaused)
  }

  func testWakeDoesNotCreateSecondLoopTask() async throws {
    let observer = RecordingCaptureSystemEventObserver()
    let loop = makeLoop(intervalSeconds: 30)
    let ctrl = makeController(loop: loop, systemEventObserver: observer)
    XCTAssertTrue(loop.start())
    ctrl.installSystemEventObservers()
    observer.fire(.systemSleep)
    await Task.yield()
    XCTAssertFalse(loop.state.isRunning)
    observer.fire(.systemWake)
    await flushPendingTasks()
    // After resume the loop task already exists — start() returns false.
    XCTAssertFalse(loop.start())
    XCTAssertTrue(loop.state.isRunning)
  }

  // MARK: - 3. Lock pauses; unlock resumes

  func testScreenLockPausesAndUnlockResumes() async throws {
    let observer = RecordingCaptureSystemEventObserver()
    let loop = makeLoop()
    let ctrl = makeController(loop: loop, systemEventObserver: observer)
    XCTAssertTrue(loop.start())
    ctrl.installSystemEventObservers()
    observer.fire(.screenLock)
    await Task.yield()
    XCTAssertFalse(loop.state.isRunning)
    XCTAssertEqual(ctrl.pausedReason, .screenLock)
    XCTAssertTrue(ctrl.wasAutoPaused)
    observer.fire(.screenUnlock)
    await flushPendingTasks()
    XCTAssertTrue(loop.state.isRunning)
    XCTAssertNil(ctrl.pausedReason)
  }

  // MARK: - 4. Competing recorder yield

  func testCompetingRecorderFrontmostSkipsWithoutReadingFrame() async throws {
    let detector = FakeCompetingRecorderDetector(isFrontmost: true)
    let source = CountingDesktopCaptureSource(
      frame: makeFrame(id: "yield", appName: "Code")
    )
    let loop = makeLoop(source: source, intervalSeconds: 30)
    let ctrl = makeController(
      loop: loop,
      recorderDetector: detector,
      now: { Date(timeIntervalSince1970: 0) }
    )
    loop.competingRecorderSkipProvider = { ctrl.competingRecorderSkipReason(at: Date(timeIntervalSince1970: 0)) }
    let event = await loop.captureTick()
    XCTAssertEqual(event, .skipped("competing screen recorder"))
    XCTAssertEqual(source.captureCount, 0)
  }

  func testCompetingRecorderBackoffThenResume() async throws {
    let detector = FakeCompetingRecorderDetector(isFrontmost: true)
    let source = CountingDesktopCaptureSource(
      frame: makeFrame(id: "backoff", appName: "Code")
    )
    let loop = makeLoop(source: source, intervalSeconds: 30)
    var now = Date(timeIntervalSince1970: 0)
    let ctrl = makeController(
      loop: loop,
      recorderDetector: detector,
      now: { now }
    )
    loop.competingRecorderSkipProvider = { ctrl.competingRecorderSkipReason(at: now) }

    // frontmost → pause (sets backoff 10s)
    let first = await loop.captureTick()
    XCTAssertEqual(first, .skipped("competing screen recorder"))

    // resigns → resumeIntoBackoff still within 10s
    detector.isFrontmost = false
    now = Date(timeIntervalSince1970: 5)
    let second = await loop.captureTick()
    XCTAssertEqual(second, .skipped("competing screen recorder backoff"))

    // beyond backoff → resumeAndCapture
    now = Date(timeIntervalSince1970: 11)
    let third = await loop.captureTick()
    XCTAssertEqual(third, .captured(eventCount: 1))
    XCTAssertEqual(source.captureCount, 1)
  }

  // MARK: - 5. User stop emits marker + finalizes

  func testUserStopEmitsSessionEndMarkerOnceAndFinalizes() async throws {
    let sink = RecordingSessionEndSink()
    let archive = FinalizingArchiveSpy()
    let loop = makeLoop()
    let ctrl = makeController(
      loop: loop,
      sessionEndSink: sink,
      archiveReconciler: archive
    )
    XCTAssertTrue(loop.start())
    ctrl.stop(reason: .userToggle)
    XCTAssertFalse(loop.state.isRunning)
    XCTAssertEqual(sink.emittedReasons, [.userToggle])
    XCTAssertEqual(archive.finalizeCalls, 1)
    XCTAssertTrue(ctrl.didEmitSessionEnd)

    // second stop is idempotent — no duplicate marker
    ctrl.stop(reason: .userToggle)
    XCTAssertEqual(sink.emittedReasons.count, 1)
    XCTAssertEqual(archive.finalizeCalls, 1)
  }

  // MARK: - 6. Quit path

  func testQuitStopEmitsQuitReasonMarker() async throws {
    let sink = RecordingSessionEndSink()
    let archive = FinalizingArchiveSpy()
    let loop = makeLoop()
    let ctrl = makeController(
      loop: loop,
      sessionEndSink: sink,
      archiveReconciler: archive
    )
    XCTAssertTrue(loop.start())
    ctrl.stop(reason: .quit)
    XCTAssertEqual(sink.emittedReasons, [.quit])
    XCTAssertEqual(archive.finalizeCalls, 1)
    XCTAssertTrue(ctrl.didEmitSessionEnd)
  }

  // MARK: - 7. Launch reconciliation auto-starts from saved enabled state

  func testLaunchReconciliationAutoStartsWhenCaptureEnabled() async throws {
    let loop = makeLoop(intervalSeconds: 30)
    let archive = FinalizingArchiveSpy()
    let ctrl = makeController(
      loop: loop,
      archiveReconciler: archive,
      settingsProvider: { CompilerSettings(captureEnabled: true) }
    )
    XCTAssertFalse(loop.state.isRunning)
    await ctrl.performLaunchReconciliation()
    XCTAssertTrue(loop.state.isRunning)
    XCTAssertEqual(archive.reconcileCalls, 1)
    XCTAssertTrue(ctrl.didPerformLaunchReconciliation)
  }

  func testLaunchReconciliationStaysStoppedWhenCaptureDisabled() async throws {
    let loop = makeLoop(intervalSeconds: 30)
    let ctrl = makeController(
      loop: loop,
      settingsProvider: { CompilerSettings(captureEnabled: false) }
    )
    await ctrl.performLaunchReconciliation()
    XCTAssertFalse(loop.state.isRunning)
  }

  // MARK: - 8. Unclean shutdown flag

  func testUncleanShutdownLockFinalizesToOneCrashMarkerAndClearsOnLaunch() async throws {
    let base = try temporaryDirectory()
    let lock = try CaptureSessionLockFile.inProfile(base)
    // A leftover lock holds the prior session's identity, including the
    // preallocated crash marker id.
    let prior = CaptureSessionIdentity(
      sessionId: "11111111-1111-4111-8111-111111111111",
      startedAt: "2026-07-05T10:00:00.000Z",
      crashMarkerId: "22222222-2222-4222-8222-222222222222"
    )
    try lock.write(prior)
    XCTAssertTrue(lock.exists())

    let loop = makeLoop()
    let archive = FinalizingArchiveSpy()
    let sink = RecordingSessionEndSink()
    let ctrl = makeController(
      loop: loop,
      sessionEndSink: sink,
      archiveReconciler: archive,
      lockFile: lock,
      settingsProvider: { CompilerSettings(captureEnabled: false) }
    )
    await ctrl.performLaunchReconciliation()
    XCTAssertTrue(ctrl.didDetectUncleanShutdown)
    XCTAssertFalse(loop.state.isRunning)
    // Exactly one idempotent `.crash` marker for the prior session, using the
    // preallocated id so the Runtime dedupes it.
    XCTAssertEqual(sink.markers.map(\.reason), [.crash])
    XCTAssertEqual(sink.markers.first?.markerId, prior.crashMarkerId)
    XCTAssertEqual(sink.markers.first?.sessionId, prior.sessionId)
    // The leftover lock is consumed on launch.
    XCTAssertFalse(lock.exists())
  }

  func testStopMarksCleanShutdown() async throws {
    let base = try temporaryDirectory()
    let lock = try CaptureSessionLockFile.inProfile(base)
    let loop = makeLoop()
    let sink = RecordingSessionEndSink()
    let ctrl = makeController(
      loop: loop,
      sessionEndSink: sink,
      lockFile: lock
    )
    loop.start()
    ctrl.stop(reason: .quit)
    XCTAssertFalse(lock.exists())
    XCTAssertTrue(ctrl.didMarkCleanShutdown)
  }

  // MARK: - 9. Idempotency after unclean termination (durable outbox)

  func testUncleanOutboxDrainsExactlyOnceAfterRelaunch() async throws {
    let url = try temporaryDatabaseURL()
    let event = PerceptionEvent(
      eventId: "unclean-event-1",
      capturedAt: "2026-07-05T10:00:00.000Z",
      periodStart: "2026-07-05T10:00:00.000Z",
      periodEnd: "2026-07-05T10:00:00.000Z",
      artifactType: .searchableScreenRecord,
      summary: "survived an unclean quit",
      sensitivityLabel: .normal,
      retentionClass: "screen_memory_7d",
      confidence: 0.9,
      expiresAt: "2099-07-05T10:00:00.000Z",
      localRecordRef: "screen-memory://records/unclean-event-1"
    )
    do {
      let store = try SQLiteScreenMemoryStore(databaseURL: url)
      try store.enqueuePerceptionEvent(event)
    }
    let reopened = try SQLiteScreenMemoryStore(databaseURL: url)
    let runtime = RecordingRuntimeClient()
    var connected = false
    let publisher = PerceptionPublisher(
      runtimeClient: runtime,
      outbox: reopened,
      isRuntimeConnected: { connected }
    )
    // Launch reconciliation: drop expired (none here), do not send.
    let dropped = try publisher.dropExpiredPendingPerceptionEvents()
    XCTAssertEqual(dropped, 0)
    XCTAssertEqual(try reopened.pendingPerceptionEvents(limit: 10).map(\.eventId), ["unclean-event-1"])
    // On connect, flush exactly once.
    connected = true
    let flushed = try publisher.flushPendingIngress()
    XCTAssertEqual(flushed, 1)
    XCTAssertEqual(runtime.perceptionEvents.map(\.eventId), ["unclean-event-1"])
    // A second flush on the same connection finds it already in-flight — no
    // duplicate send. The row stays pending until a `runtime_ingress_ack`.
    XCTAssertEqual(try publisher.flushPendingIngress(), 0)
    XCTAssertEqual(try reopened.pendingPerceptionEvents(limit: 10).count, 1)
  }

  // MARK: - 10. No silent stay-stopped after relaunch (negative control)

  func testWithoutReconciliationLoopStaysStoppedOnRelaunch() {
    let loop = makeLoop(intervalSeconds: 30)
    // No performLaunchReconciliation call
    XCTAssertFalse(loop.state.isRunning)
  }

  // MARK: - 11. Boundary-disabled launch stays inert

  func testBoundaryDisabledLaunchStaysInert() async throws {
    let observer = RecordingCaptureSystemEventObserver()
    let archive = FinalizingArchiveSpy()
    let loop = makeLoop()
    let ctrl = makeController(
      loop: loop,
      systemEventObserver: observer,
      archiveReconciler: archive,
      settingsProvider: { CompilerSettings(captureEnabled: true) },
      captureBoundaryEnabled: false
    )
    ctrl.installSystemEventObservers()
    // No observer handler should have been installed when boundary is disabled.
    XCTAssertNil(observer.handler)
    await ctrl.performLaunchReconciliation()
    XCTAssertFalse(loop.state.isRunning)
    XCTAssertEqual(archive.reconcileCalls, 0)
    // System events are ignored when the boundary is disabled.
    observer.fire(.systemSleep)
    XCTAssertFalse(loop.state.isRunning)
  }

  // MARK: - 12. Launch reconciliation is idempotent

  func testLaunchReconciliationIsIdempotent() async throws {
    let loop = makeLoop(intervalSeconds: 30)
    let archive = FinalizingArchiveSpy()
    let ctrl = makeController(
      loop: loop,
      archiveReconciler: archive,
      settingsProvider: { CompilerSettings(captureEnabled: true) }
    )
    await ctrl.performLaunchReconciliation()
    XCTAssertTrue(loop.state.isRunning)
    XCTAssertEqual(archive.reconcileCalls, 1)
    // second call is a no-op
    await ctrl.performLaunchReconciliation()
    XCTAssertEqual(archive.reconcileCalls, 1)
  }

  // MARK: - 13. yield gate unit tests

  func testYieldGatePauseAndBackoff() {
    var gate = ProactiveScreenRecorderYieldGate(backoffDurationSeconds: 10)
    let t0 = Date(timeIntervalSince1970: 0)
    XCTAssertEqual(gate.decision(isCompetingFrontmost: true, now: t0), .pause(backoffUntil: Date(timeIntervalSince1970: 10)))
    // resigns, within backoff
    XCTAssertEqual(gate.decision(isCompetingFrontmost: false, now: Date(timeIntervalSince1970: 5)), .resumeIntoBackoff)
    // beyond backoff — the resume transition already cleared `wasCompetingFrontmost`,
    // so the next decision is an ordinary `.capture` (Omi's `ProactiveScreenshotCaptureGate` clears
    // the flag on `resumeIntoBackoff` exactly this way).
    XCTAssertEqual(gate.decision(isCompetingFrontmost: false, now: Date(timeIntervalSince1970: 11)), .capture)
  }

  func testYieldGateResumeAndCaptureWhenResignLandsAfterBackoff() {
    var gate = ProactiveScreenRecorderYieldGate(backoffDurationSeconds: 10)
    let t0 = Date(timeIntervalSince1970: 0)
    XCTAssertEqual(gate.decision(isCompetingFrontmost: true, now: t0), .pause(backoffUntil: Date(timeIntervalSince1970: 10)))
    // resign lands at t=11 — beyond backoff — Omi fires `.resumeAndCapture` in one step.
    XCTAssertEqual(gate.decision(isCompetingFrontmost: false, now: Date(timeIntervalSince1970: 11)), .resumeAndCapture)
  }

  func testYieldGateReset() {
    var gate = ProactiveScreenRecorderYieldGate()
    _ = gate.decision(isCompetingFrontmost: true, now: Date())
    gate.reset()
    XCTAssertFalse(gate.wasCompetingFrontmost)
    XCTAssertEqual(gate.backoffUntil, .distantPast)
  }

  // MARK: - Helpers

  private func makeController(
    loop: ScreenMemoryCaptureLoop? = nil,
    cadence: DesktopCaptureCadence = DesktopCaptureCadence(),
    powerSource: DesktopPowerSource? = nil,
    recorderDetector: CompetingScreenRecorderDetector? = nil,
    systemEventObserver: CaptureSystemEventObserver? = nil,
    sessionEndSink: CaptureSessionEndSink? = nil,
    archiveReconciler: ScreenMemoryLaunchReconciliation? = nil,
    outboxDrain: PerceptionOutboxLaunchDrain? = nil,
    lockFile: CaptureSessionLockFile? = nil,
    settingsProvider: @escaping () -> CompilerSettings = { CompilerSettings(captureEnabled: true) },
    permissionProvider: @escaping () -> Bool = { true },
    privacySnapshotProvider: @escaping () -> ScreenMemoryPrivacySnapshot = {
      ScreenMemoryPrivacySnapshot(isPrivateMode: false)
    },
    captureBoundaryEnabled: Bool = true,
    now: @escaping () -> Date = { Date() }
  ) -> ScreenMemoryCaptureLifecycleController {
    ScreenMemoryCaptureLifecycleController(
      loop: loop ?? makeLoop(),
      cadence: cadence,
      powerSource: powerSource,
      recorderDetector: recorderDetector,
      systemEventObserver: systemEventObserver,
      sessionEndSink: sessionEndSink,
      archiveReconciler: archiveReconciler,
      outboxDrain: outboxDrain,
      lockFile: lockFile,
      settingsProvider: settingsProvider,
      permissionProvider: permissionProvider,
      privacySnapshotProvider: privacySnapshotProvider,
      captureBoundaryEnabled: captureBoundaryEnabled,
      now: now
    )
  }

  private func makeLoop(
    source: DesktopCaptureSource? = nil,
    intervalSeconds: TimeInterval = 1,
    intervalProvider: (() -> TimeInterval)? = nil,
    competingRecorderSkipProvider: @escaping () -> String? = { nil },
    now: @escaping () -> Date = { Date(timeIntervalSince1970: 0) }
  ) -> ScreenMemoryCaptureLoop {
    let runtime = RecordingRuntimeClient()
    let store = InMemoryScreenMemoryStore()
    let resolvedSource = source ?? CountingDesktopCaptureSource(frame: makeFrame(id: "tick"))
    return ScreenMemoryCaptureLoop(
      coordinator: CaptureCoordinator(
        compiler: ContextCompiler(),
        screenMemory: store,
        publisher: PerceptionPublisher(runtimeClient: runtime)
      ),
      source: resolvedSource,
      settingsProvider: { CompilerSettings(captureEnabled: true) },
      permissionProvider: { true },
      privacySnapshotProvider: { ScreenMemoryPrivacySnapshot(isPrivateMode: false) },
      now: now,
      intervalSeconds: intervalSeconds,
      intervalProvider: intervalProvider,
      competingRecorderSkipProvider: competingRecorderSkipProvider
    )
  }

  private func makeFrame(id: String, appName: String = "Code") -> CapturedFrame {
    CapturedFrame(
      id: id,
      capturedAt: "2026-07-05T10:00:00.000Z",
      appName: appName,
      windowTitle: "Intentive",
      ocrText: "resilience tick \(id)"
    )
  }

  private func flushPendingTasks() async {
    // The wake-settle delay defaults to 1.5s; for tests we shorten it by
    // yielding to the RunLoop so the scheduled `Task` gets a chance to run.
    // The default wake-settle delay is 1.5s — use it directly when needed.
    try? await Task.sleep(nanoseconds: UInt64(ScreenMemoryCaptureLifecycleController.wakeSettleDelaySeconds * 1_000_000_000) + 200_000_000)
    await Task.yield()
  }

  private func temporaryDirectory() throws -> URL {
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("ResilienceTests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }

  private func temporaryDatabaseURL() throws -> URL {
    try temporaryDirectory().appendingPathComponent("intentive.db")
  }
}

// MARK: - Fakes

private final class FakePowerSource: DesktopPowerSource {
  var isOnBattery: Bool
  var onPowerSourceChanged: ((Bool) -> Void)?

  init(isOnBattery: Bool) {
    self.isOnBattery = isOnBattery
  }
}

private final class FakeCompetingRecorderDetector: CompetingScreenRecorderDetector {
  var isFrontmost: Bool

  init(isFrontmost: Bool) {
    self.isFrontmost = isFrontmost
  }

  func isCompetingRecorderFrontmost() -> Bool { isFrontmost }
}

private final class RecordingSessionEndSink: CaptureSessionEndSink {
  private(set) var markers: [SessionEndMarker] = []
  var emittedReasons: [SessionEndReason] { markers.map(\.reason) }
  func sendSessionEnd(_ marker: SessionEndMarker) throws {
    markers.append(marker)
  }
}

private final class FinalizingArchiveSpy: ScreenMemoryLaunchReconciliation {
  private(set) var reconcileCalls = 0
  private(set) var finalizeCalls = 0

  func reconcileOnLaunch() async throws {
    reconcileCalls += 1
  }

  func finalizeActiveVideoChunk() async throws {
    finalizeCalls += 1
  }
}

private final class CountingDesktopCaptureSource: DesktopCaptureSource {
  var frame: CapturedFrame
  private(set) var captureCount = 0

  init(frame: CapturedFrame) {
    self.frame = frame
  }

  func captureFrame() async throws -> CapturedFrame {
    captureCount += 1
    return frame
  }
}