import Foundation

// MARK: - Pause reasons

public enum ScreenMemoryCapturePauseReason: String, Equatable, Sendable {
  case systemSleep
  case screenLock
  case competingScreenRecorder
  case permissionLost
  case userToggle
  case displayChange
}

/// The one observable capture truth consumed by settings, the status menu,
/// onboarding, and acceptance automation.
public enum ScreenMemoryCaptureLifecycleState: Equatable, Sendable {
  case disabled
  case permissionBlocked
  case starting
  case running
  case autoPaused(ScreenMemoryCapturePauseReason)
  case stopping
  case degraded(String)
  case failed(String)

  public var isRunning: Bool {
    if case .running = self { return true }
    return false
  }
}

// MARK: - Power source

public protocol DesktopPowerSource: AnyObject {
  var isOnBattery: Bool { get }
  var onPowerSourceChanged: ((Bool) -> Void)? { get set }
}

// MARK: - Cadence

public struct DesktopCaptureCadence: Sendable {
  public static let acIntervalSeconds: TimeInterval = 3
  public static let batteryIntervalSeconds: TimeInterval = 9

  public init() {}

  public func interval(isOnBattery: Bool) -> TimeInterval {
    isOnBattery
      ? Self.batteryIntervalSeconds
      : Self.acIntervalSeconds
  }
}

// MARK: - Competing screen-recorder detection

public protocol CompetingScreenRecorderDetector: AnyObject {
  func isCompetingRecorderFrontmost() -> Bool
}

public struct DefaultCompetingScreenRecorderBundleIDs: Sendable {
  public static let shared: Set<String> = [
    "com.sindresorhus.cleanshot-x",
    "com.sindresorhus.cleanshot",
    "com.tiamix.shottr",
    "com.neatcaptura.cleanshot",
    "tv.loom.desktop",
    "com.techsmith.snagit2023",
    "com.techsmith.snagit2024",
    "com.techsmith.snagit2025",
    "com.obsproject.obs-studio",
    "com.synium.screenium",
    "com.bohemiancoding.skitch",
    "com.happenapps.monosnap",
    "com.lightshot.screenshot",
    "com.globaldelight.capto",
    "com.apple.screencapture",
    "com.apple.screencaptureui",
    "com.apple.screenshot.launcher",
  ]
}

// MARK: - Screen-recorder yield gate
// Adapted from Omi's `ProactiveScreenshotCaptureGate` in
// `ProactiveAssistantOrchestrationPolicy.swift`. The mechanism — pause when a
// competing recorder is frontmost, hold a backoff window after it resigns, then
// resume — is preserved verbatim. The frontmost bundle-ID set and the
// `detect` hook are Intentive-owned.

public enum ScreenRecorderYieldDecision: Equatable, Sendable {
  case pause(backoffUntil: Date)
  case resumeIntoBackoff
  case resumeAndCapture
  case continueBackoff
  case capture
}

public struct ProactiveScreenRecorderYieldGate: Sendable {
  private(set) var wasCompetingFrontmost = false
  private(set) var backoffUntil: Date = .distantPast
  public var backoffDurationSeconds: TimeInterval

  public init(backoffDurationSeconds: TimeInterval = 10) {
    self.backoffDurationSeconds = max(0, backoffDurationSeconds)
  }

  public mutating func decision(
    isCompetingFrontmost: Bool,
    now: Date
  ) -> ScreenRecorderYieldDecision {
    if isCompetingFrontmost {
      backoffUntil = now.addingTimeInterval(backoffDurationSeconds)
      wasCompetingFrontmost = true
      return .pause(backoffUntil: backoffUntil)
    }
    if wasCompetingFrontmost {
      let resume = now < backoffUntil ? ScreenRecorderYieldDecision.resumeIntoBackoff
        : ScreenRecorderYieldDecision.resumeAndCapture
      wasCompetingFrontmost = false
      return resume
    }
    if now < backoffUntil {
      return .continueBackoff
    }
    return .capture
  }

  public mutating func reset() {
    wasCompetingFrontmost = false
    backoffUntil = .distantPast
  }
}

// MARK: - System-event observer

public enum CaptureSystemEventKind: Equatable, Sendable {
  case systemSleep
  case systemWake
  case screenLock
  case screenUnlock
  case displayChange
}

public protocol CaptureSystemEventObserver: AnyObject {
  func observe(_ handler: @escaping (CaptureSystemEventKind) -> Void)
}

public final class RecordingCaptureSystemEventObserver: CaptureSystemEventObserver {
  public private(set) var handler: ((CaptureSystemEventKind) -> Void)?

  public init() {}

  public func observe(_ handler: @escaping (CaptureSystemEventKind) -> Void) {
    self.handler = handler
  }

  public func fire(_ kind: CaptureSystemEventKind) {
    handler?(kind)
  }
}

// MARK: - Session-end sink
// The durable `PerceptionPublisher` implements this body (`publishSessionEnd`):
// a marker is inserted into `runtime_ingress_outbox` before delivery is
// attempted, so a clean stop, quit, or crash-recovery marker survives an outage
// and is redelivered until the Runtime acknowledges it. The protocol lets Core
// tests inject a recording sink without a live publisher.

public protocol CaptureSessionEndSink: AnyObject {
  func sendSessionEnd(_ marker: SessionEndMarker) throws
}

// MARK: - Archive reconciliation / outbox drain
// Minimal seam the controller calls on launch. Implemented by
// `ScreenMemoryArchive.prepareArchive()` + `runScheduledCleanup()`, and by
// `PerceptionPublisher.flushPendingIngress` when connected.

public protocol ScreenMemoryLaunchReconciliation: AnyObject {
  /// Reconcile orphaned chunks / run scheduled expiry. Idempotent per process.
  func reconcileOnLaunch() async throws

  /// Finalize the currently-active video chunk so a quit/stop is durable.
  func finalizeActiveVideoChunk() async throws
}

public protocol PerceptionOutboxLaunchDrain: AnyObject {
  /// Drop already-expired unsent records and return the count dropped. Does
  /// not require the Runtime to be connected.
  @discardableResult
  func dropExpiredPendingPerceptionEvents() throws -> Int
}

private final class CaptureFinalizationOutcomeBox: @unchecked Sendable {
  private let lock = NSLock()
  private var storedResult: Result<Void, Error>?

  func store(_ result: Result<Void, Error>) {
    lock.lock()
    storedResult = result
    lock.unlock()
  }

  func result() -> Result<Void, Error>? {
    lock.lock()
    defer { lock.unlock() }
    return storedResult
  }
}

// MARK: - Session identity

/// The active capture session's durable identity, persisted as JSON in
/// `intentive_session.lock`. The preallocated `crashMarkerId` lets an unclean
/// prior session finalize to exactly one idempotent `.crash` marker on the next
/// launch — the Runtime dedupes by that stable id no matter how many times the
/// leftover lock is observed.
public struct CaptureSessionIdentity: Codable, Equatable, Sendable {
  public var sessionId: String
  public var startedAt: String
  public var crashMarkerId: String

  public init(sessionId: String, startedAt: String, crashMarkerId: String) {
    self.sessionId = sessionId
    self.startedAt = startedAt
    self.crashMarkerId = crashMarkerId
  }

  enum CodingKeys: String, CodingKey {
    case sessionId = "session_id"
    case startedAt = "started_at"
    case crashMarkerId = "crash_marker_id"
  }
}

// MARK: - Lock file (unclean-shutdown flag + session identity)
// Adapted from Omi's `.omi_running` flag (`RewindDatabase.swift`). The Intentive
// file is `intentive_session.lock`, written under the per-user profile root next
// to `intentive.db` so a crash leaves it behind for the next launch to detect.
// Unlike Omi's empty flag, it holds the running session's `CaptureSessionIdentity`
// so launch reconciliation can attribute a single crash marker to the prior run.

public struct CaptureSessionLockFile: Equatable, Sendable {
  public let url: URL

  public init(url: URL) {
    self.url = url
  }

  public static func inProfile(_ profileRoot: URL, fileManager: FileManager = .default) throws
    -> CaptureSessionLockFile
  {
    try fileManager.createDirectory(at: profileRoot, withIntermediateDirectories: true)
    return CaptureSessionLockFile(url: profileRoot.appendingPathComponent("intentive_session.lock"))
  }

  public func exists(fileManager: FileManager = .default) -> Bool {
    fileManager.fileExists(atPath: url.path)
  }

  /// Decode the persisted session identity. Returns `nil` when the lock is
  /// absent or holds a legacy flag payload (older builds wrote plain bytes) —
  /// the caller still treats the lock's presence as an unclean-shutdown signal.
  public func read(fileManager: FileManager = .default) -> CaptureSessionIdentity? {
    guard exists(fileManager: fileManager), let data = try? Data(contentsOf: url) else {
      return nil
    }
    return try? JSONDecoder().decode(CaptureSessionIdentity.self, from: data)
  }

  /// Persist the running session's identity, replacing any prior lock. Presence
  /// of the file is itself the unclean-shutdown flag until `markClean` removes it.
  public func write(_ identity: CaptureSessionIdentity, fileManager: FileManager = .default) throws {
    let data = try JSONEncoder().encode(identity)
    try data.write(to: url, options: .atomic)
  }

  public func markClean(fileManager: FileManager = .default) throws {
    if exists(fileManager: fileManager) {
      try fileManager.removeItem(at: url)
    }
  }
}

// MARK: - Lifecycle controller

/// Owns the resilience state machine for the Intentive `ScreenMemoryCaptureLoop`.
///
/// Renovated from Omi's `ProactiveAssistantsPlugin` capture-lifecycle code:
///   - launch-time restore of saved enabled state (Omi:
///     `DesktopHomeView.scheduleProactiveMonitoringStart`)
///   - sleep/wake + lock/unlock pause/resume with a wake settle delay
///     (Omi: `setupSystemEventObservers`)
///   - battery-aware capture cadence (Omi: `effectiveCaptureInterval`)
///   - per-tick competing-screen-recorder yield (Omi:
///     `ProactiveScreenshotCaptureGate`)
///   - user toggle / quit stop that finalizes the active chunk and emits
///     `session_end_marker` (Omi: `RewindShutdownFlush`)
///   - unclean-shutdown flag file + launch reconciliation (Omi: `.omi_running` +
///     `performInitialization`)
///
/// All OS observers are injected (`CaptureSystemEventObserver`), so the whole
/// state machine is unit-testable with a fake observer. The AppKit implementation
/// lives in the `Intentive` app target; Core never imports AppKit.
@MainActor
public final class ScreenMemoryCaptureLifecycleController {
  public static let wakeSettleDelaySeconds: TimeInterval = 1.5

  public let loop: ScreenMemoryCaptureLoop
  public let cadence: DesktopCaptureCadence
  public let powerSource: DesktopPowerSource?
  public let recorderDetector: CompetingScreenRecorderDetector?
  public let systemEventObserver: CaptureSystemEventObserver?
  public let sessionEndSink: CaptureSessionEndSink?
  public let archiveReconciler: ScreenMemoryLaunchReconciliation?
  public let outboxDrain: PerceptionOutboxLaunchDrain?
  public let lockFile: CaptureSessionLockFile?
  public let settingsProvider: () -> CompilerSettings
  public let permissionProvider: () -> Bool
  public let captureBoundaryEnabled: Bool
  public let finalizationTimeoutSeconds: TimeInterval
  public let now: () -> Date

  public private(set) var pausedReason: ScreenMemoryCapturePauseReason?
  public private(set) var wasAutoPaused = false
  public private(set) var didEmitSessionEnd = false
  public private(set) var didPerformLaunchReconciliation = false
  public private(set) var didDetectUncleanShutdown = false
  public private(set) var didMarkCleanShutdown = false
  public private(set) var launchReconciliationDroppedExpiredOutboxRows = 0
  /// The active capture session's id, allocated when a capture actually starts.
  /// `nil` before the first start / after a clean stop.
  public private(set) var currentSessionId: String?
  public private(set) var state: ScreenMemoryCaptureLifecycleState = .disabled {
    didSet { if oldValue != state { onStateChange?(state) } }
  }
  public var onStateChange: ((ScreenMemoryCaptureLifecycleState) -> Void)?
  public var onCaptureEvent: ((ScreenMemoryCaptureLoopEvent) -> Void)?

  private let makeUUID: () -> String
  private var recorderGate: ProactiveScreenRecorderYieldGate
  private var wakeSettleTask: Task<Void, Never>?
  private var displayChangeTask: Task<Void, Never>?
  private var userEnabled = false
  private var startGeneration = 0

  public init(
    loop: ScreenMemoryCaptureLoop,
    cadence: DesktopCaptureCadence = DesktopCaptureCadence(),
    powerSource: DesktopPowerSource? = nil,
    recorderDetector: CompetingScreenRecorderDetector? = nil,
    systemEventObserver: CaptureSystemEventObserver? = nil,
    sessionEndSink: CaptureSessionEndSink? = nil,
    archiveReconciler: ScreenMemoryLaunchReconciliation? = nil,
    outboxDrain: PerceptionOutboxLaunchDrain? = nil,
    lockFile: CaptureSessionLockFile? = nil,
    settingsProvider: @escaping () -> CompilerSettings = { CompilerSettings() },
    permissionProvider: @escaping () -> Bool = { true },
    captureBoundaryEnabled: Bool = true,
    finalizationTimeoutSeconds: TimeInterval = 5,
    recorderGate: ProactiveScreenRecorderYieldGate = ProactiveScreenRecorderYieldGate(),
    now: @escaping () -> Date = { Date() },
    makeUUID: @escaping () -> String = { UUID().uuidString }
  ) {
    self.loop = loop
    self.cadence = cadence
    self.powerSource = powerSource
    self.recorderDetector = recorderDetector
    self.systemEventObserver = systemEventObserver
    self.sessionEndSink = sessionEndSink
    self.archiveReconciler = archiveReconciler
    self.outboxDrain = outboxDrain
    self.lockFile = lockFile
    self.settingsProvider = settingsProvider
    self.permissionProvider = permissionProvider
    self.captureBoundaryEnabled = captureBoundaryEnabled
    self.finalizationTimeoutSeconds = finalizationTimeoutSeconds
    self.recorderGate = recorderGate
    self.now = now
    self.makeUUID = makeUUID
  }

  /// Allocate a fresh capture session identity, persist it in the lock (with a
  /// preallocated crash marker id), and reset session-end idempotency. Called
  /// whenever a capture actually starts, so a new run never reuses the prior
  /// session's markers. The lock's presence is the unclean-shutdown flag until a
  /// clean stop removes it.
  @discardableResult
  private func beginSession() -> CaptureSessionIdentity {
    let identity = CaptureSessionIdentity(
      sessionId: makeUUID(),
      startedAt: now().protocolTimestamp,
      crashMarkerId: makeUUID()
    )
    currentSessionId = identity.sessionId
    didEmitSessionEnd = false
    didMarkCleanShutdown = false
    try? lockFile?.write(identity)
    return identity
  }

  // MARK: - Resilience queries the loop consults each tick

  /// Battery-aware capture interval at the supplied time.
  public func captureInterval(at date: Date) -> TimeInterval {
    let onBattery = powerSource?.isOnBattery ?? false
    return cadence.interval(isOnBattery: onBattery)
  }

  /// Per-tick competing-recorder consult. Returns the skip reason when capture
  /// must yield this tick; `nil` when capture may proceed. Mirrors Omi's
  /// `ProactiveScreenshotCaptureGate` consult in `captureFrame()`.
  public func competingRecorderSkipReason(at date: Date) -> String? {
    guard let recorderDetector else { return nil }
    let decision = recorderGate.decision(
      isCompetingFrontmost: recorderDetector.isCompetingRecorderFrontmost(),
      now: date
    )
    switch decision {
    case .pause:
      return "competing screen recorder"
    case .resumeIntoBackoff, .continueBackoff:
      return "competing screen recorder backoff"
    case .resumeAndCapture, .capture:
      return nil
    }
  }

  // MARK: - Observer install (called from the app target during launch)

  public func installSystemEventObservers() {
    guard captureBoundaryEnabled else { return }
    systemEventObserver?.observe { [weak self] kind in
      Task { @MainActor [weak self] in
        self?.receiveSystemEvent(kind)
      }
    }
  }

  /// Routes an observed AppKit power/display event through the authoritative
  /// lifecycle. Public so the assembled acceptance host can inject the same
  /// boundary event without controlling user actions through its bridge.
  public func receiveSystemEvent(_ kind: CaptureSystemEventKind) {
    guard captureBoundaryEnabled else { return }
    switch kind {
    case .systemSleep:
      pause(.systemSleep)
    case .systemWake:
      scheduleWakeResume()
    case .screenLock:
      pause(.screenLock)
    case .screenUnlock:
      scheduleWakeResume()
    case .displayChange:
      handleDisplayChange()
    }
  }

  /// Sole user-facing start/stop entry point. Callers persist the desired
  /// preference, then ask this controller to reconcile the physical source.
  public func setUserEnabled(_ enabled: Bool) {
    userEnabled = enabled
    startGeneration += 1
    if enabled {
      reconcile()
    } else {
      stop(reason: .userToggle)
    }
  }

  /// Immediate, non-finalizing stop used by the Coaching Window privacy
  /// boundary. It invalidates every delayed restart before stopping the source;
  /// the coordinator separately finalizes and durably ends sessions when the
  /// window itself ends. A lock uses this stop without ending the session.
  public func suspendForCoachingBoundary() {
    startGeneration += 1
    wakeSettleTask?.cancel()
    wakeSettleTask = nil
    displayChangeTask?.cancel()
    displayChangeTask = nil
    userEnabled = false
    wasAutoPaused = false
    pausedReason = .userToggle
    loop.stop()
    state = .disabled
  }

  /// Reconcile desired policy, permission, privacy, and the actual source.
  public func reconcile() {
    guard captureBoundaryEnabled else {
      loop.stop()
      state = .disabled
      return
    }
    let enabled = userEnabled || settings().captureEnabled
    guard enabled else {
      loop.stop()
      state = .disabled
      return
    }
    guard permissionProvider() else {
      loop.stop()
      state = .permissionBlocked
      return
    }
    guard !loop.state.isRunning else {
      pausedReason = nil
      state = .running
      return
    }

    state = .starting
    if currentSessionId == nil { beginSession() }
    let generation = startGeneration
    let started = loop.start { [weak self] event in
      guard let self, generation == self.startGeneration else { return }
      self.onCaptureEvent?(event)
      switch event {
      case .captured:
        self.state = .running
      case .skipped(let reason):
        self.state = .degraded(reason)
      case .failed(let reason):
        self.state = .failed(reason)
      }
    }
    state = started || loop.state.isRunning ? .running : .failed("capture source did not start")
  }

  // MARK: - Pause / resume

  public func pause(_ reason: ScreenMemoryCapturePauseReason) {
    guard captureBoundaryEnabled else { return }
    guard loop.state.isRunning else { return }
    loop.stop()
    pausedReason = reason
    if reason != .userToggle {
      wasAutoPaused = true
      state = .autoPaused(reason)
    }
  }

  public func resume() {
    guard captureBoundaryEnabled else { return }
    guard wasAutoPaused else { return }
    defer { wasAutoPaused = false }
    guard settings().captureEnabled,
          permissionProvider()
    else {
      pausedReason = nil
      return
    }
    pausedReason = nil
    reconcile()
  }

  private func scheduleWakeResume() {
    wakeSettleTask?.cancel()
    let delay = Self.wakeSettleDelaySeconds
    wakeSettleTask = Task { [weak self] in
      if delay > 0 {
        try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
      }
      guard !Task.isCancelled else { return }
      await MainActor.run { self?.resume() }
    }
  }

  private func handleDisplayChange() {
    guard loop.state.isRunning else { return }
    startGeneration += 1
    loop.stop()
    pausedReason = .displayChange
    wasAutoPaused = true
    state = .autoPaused(.displayChange)
    displayChangeTask?.cancel()
    displayChangeTask = Task { [weak self] in
      guard let self else { return }
      try? await archiveReconciler?.finalizeActiveVideoChunk()
      guard !Task.isCancelled else { return }
      try? await Task.sleep(
        nanoseconds: UInt64(Self.wakeSettleDelaySeconds * 1_000_000_000))
      guard !Task.isCancelled else { return }
      pausedReason = nil
      wasAutoPaused = false
      reconcile()
    }
  }

  // MARK: - User toggle / quit stop

  /// Stop capture for a user-initiated reason. Stops the loop, finalizes the
  /// active video chunk (so the stop is durable), durably enqueues one
  /// `session_end_marker`, then attempts delivery. A second call is a no-op
  /// (idempotent) — never emits a duplicate.
  ///
  /// The marker is inserted into `runtime_ingress_outbox` by the durable
  /// `PerceptionPublisher` before any send is attempted, so a disconnected stop
  /// still redelivers on reconnect. The lock is removed only after the chunk
  /// finalize and the marker enqueue both succeed. A finalization error or
  /// timeout emits no marker and leaves the session identity + lock intact for
  /// next-launch recovery; an enqueue error also retains the lock. The chunk
  /// finalize is bounded so `applicationWillTerminate` cannot deadlock.
  public func stop(reason: SessionEndReason) {
    startGeneration += 1
    state = .stopping
    loop.stop()
    pausedReason = .userToggle
    guard let sessionId = currentSessionId else {
      state = .disabled
      return
    }
    guard !didEmitSessionEnd else {
      state = .disabled
      return
    }

    if let archiveReconciler {
      let sem = DispatchSemaphore(value: 0)
      let outcome = CaptureFinalizationOutcomeBox()
      // The archive's finalize is actor-isolated and safe off-main. Run it
      // detached so a synchronous caller on the main actor (e.g.
      // applicationWillTerminate) does not deadlock against `sem.wait`.
      let finalizationTask = Task.detached {
        do {
          try await archiveReconciler.finalizeActiveVideoChunk()
          outcome.store(.success(()))
        } catch {
          outcome.store(.failure(error))
        }
        sem.signal()
      }
      guard sem.wait(timeout: .now() + max(0, finalizationTimeoutSeconds)) == .success else {
        finalizationTask.cancel()
        state = .failed("archive finalization timed out")
        return
      }
      guard let finalizationResult = outcome.result() else {
        state = .failed("archive finalization did not report an outcome")
        return
      }
      if case .failure(let error) = finalizationResult {
        state = .failed(error.localizedDescription)
        return
      }
    }

    let marker = SessionEndMarker(
      markerId: makeUUID(),
      sessionId: sessionId,
      endedAt: now().protocolTimestamp,
      reason: reason
    )
    do {
      try sessionEndSink?.sendSessionEnd(marker)
      // Durable enqueue succeeded (delivery, if disconnected, is redelivered by
      // the outbox). Safe to clear the unclean-shutdown lock.
      didEmitSessionEnd = true
      currentSessionId = nil
      try? lockFile?.markClean()
      didMarkCleanShutdown = true
      state = .disabled
    } catch {
      // Enqueue failed: keep the lock so the next launch finalizes this run via
      // a crash marker. Still mark emitted to avoid a duplicate on a repeat stop.
      didEmitSessionEnd = true
      state = .failed(error.localizedDescription)
    }
  }

  // MARK: - Launch reconciliation

  /// Run on launch after the model attaches. Detects an unclean-shutdown lock
  /// file, reconciles the archive + outbox, and auto-starts capture when the
  /// persisted `captureEnabled` is still `true` and the capture boundary is
  /// active. Idempotent per process; subsequent calls are no-ops.
  public func performLaunchReconciliation(autoStart: Bool = true) async {
    guard captureBoundaryEnabled else { return }
    guard !didPerformLaunchReconciliation else { return }
    didPerformLaunchReconciliation = true

    // A leftover lock means the prior session exited uncleanly. Finalize it to
    // exactly one idempotent `.crash` marker (using the preallocated marker id
    // so the Runtime dedupes it) before any new session is created. Clear the
    // lock only after the marker is durably enqueued. If enqueue or lock removal
    // fails, leave reconciliation retryable and return before auto-start can
    // overwrite the prior session identity.
    if let lockFile, lockFile.exists() {
      didDetectUncleanShutdown = true
      do {
        if let prior = lockFile.read() {
          guard let sessionEndSink else {
            didPerformLaunchReconciliation = false
            return
          }
          let crashMarker = SessionEndMarker(
            markerId: prior.crashMarkerId,
            sessionId: prior.sessionId,
            endedAt: now().protocolTimestamp,
            reason: .crash
          )
          try sessionEndSink.sendSessionEnd(crashMarker)
        }
        try lockFile.markClean()
      } catch {
        didPerformLaunchReconciliation = false
        return
      }
    }

    if let archiveReconciler {
      do {
        try await archiveReconciler.reconcileOnLaunch()
      } catch {
        // Reconciliation is best-effort on launch; the archive's own lazy
        // recovery still catches orphaned chunks on first touch.
      }
    }
    if let outboxDrain {
      launchReconciliationDroppedExpiredOutboxRows = (try? outboxDrain.dropExpiredPendingPerceptionEvents()) ?? 0
    }

    guard autoStart,
          settings().captureEnabled,
          permissionProvider()
    else { return }
    userEnabled = true
    reconcile()
  }

  public func markCleanShutdown() {
    try? lockFile?.markClean()
    didMarkCleanShutdown = true
  }

  private func settings() -> CompilerSettings { settingsProvider() }
}

// MARK: - PerceptionPublisher conformance
// The session-end sink is the durable outbox driver: a marker is inserted into
// `runtime_ingress_outbox` before delivery, so a quit/crash marker survives an
// outage and redelivers until acknowledged. `RuntimeAdapter` no longer owns
// session-end durability (its `outboundQueue` is ephemeral connection traffic).

extension PerceptionPublisher: CaptureSessionEndSink {
  public func sendSessionEnd(_ marker: SessionEndMarker) throws {
    try publishSessionEnd(marker)
  }
}
