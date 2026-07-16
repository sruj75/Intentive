import Foundation

// MARK: - Pause reasons

public enum ScreenMemoryCapturePauseReason: String, Equatable, Sendable {
  case systemSleep
  case screenLock
  case competingScreenRecorder
  case permissionLost
  case privateMode
  case userToggle
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
// `RuntimeAdapter` already implements this body (`sendSessionEnd(reason:)`). The
// protocol lets Core tests inject a recording sink without `RuntimeAdapter`.

public protocol CaptureSessionEndSink: AnyObject {
  func sendSessionEnd(reason: SessionEndReason) throws
}

// MARK: - Archive reconciliation / outbox drain
// Minimal seam the controller calls on launch. Implemented by
// `ScreenMemoryArchive.prepareArchive()` + `runScheduledCleanup()`, and by
// `PerceptionPublisher.flushPendingPerceptionEvents/Tombstones` when connected.

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

// MARK: - Lock file (unclean-shutdown flag)
// Adapted from Omi's `.omi_running` flag (`RewindDatabase.swift`). The Intentive
// file is `intentive_session.lock`, written under the per-user profile root next
// to `intentive.db` so a crash leaves it behind for the next launch to detect.

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

  public func markClean(fileManager: FileManager = .default) throws {
    if exists(fileManager: fileManager) {
      try fileManager.removeItem(at: url)
    }
  }

  public func markUnclean(fileManager: FileManager = .default) throws {
    if !exists(fileManager: fileManager) {
      try Data("intentive_session".utf8).write(to: url)
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
  public let privacySnapshotProvider: () -> ScreenMemoryPrivacySnapshot
  public let captureBoundaryEnabled: Bool
  public let now: () -> Date

  public private(set) var pausedReason: ScreenMemoryCapturePauseReason?
  public private(set) var wasAutoPaused = false
  public private(set) var didEmitSessionEnd = false
  public private(set) var didPerformLaunchReconciliation = false
  public private(set) var didDetectUncleanShutdown = false
  public private(set) var didMarkCleanShutdown = false
  public private(set) var launchReconciliationDroppedExpiredOutboxRows = 0

  private var recorderGate: ProactiveScreenRecorderYieldGate
  private var wakeSettleTask: Task<Void, Never>?

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
    privacySnapshotProvider: @escaping () -> ScreenMemoryPrivacySnapshot = {
      ScreenMemoryPrivacySnapshot(isPrivateMode: false)
    },
    captureBoundaryEnabled: Bool = true,
    recorderGate: ProactiveScreenRecorderYieldGate = ProactiveScreenRecorderYieldGate(),
    now: @escaping () -> Date = { Date() }
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
    self.privacySnapshotProvider = privacySnapshotProvider
    self.captureBoundaryEnabled = captureBoundaryEnabled
    self.recorderGate = recorderGate
    self.now = now
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
        self?.handleSystemEvent(kind)
      }
    }
  }

  private func handleSystemEvent(_ kind: CaptureSystemEventKind) {
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
      break
    }
  }

  // MARK: - Pause / resume

  public func pause(_ reason: ScreenMemoryCapturePauseReason) {
    guard captureBoundaryEnabled else { return }
    guard loop.state.isRunning else { return }
    loop.stop()
    pausedReason = reason
    if reason != .userToggle {
      wasAutoPaused = true
    }
  }

  public func resume() {
    guard captureBoundaryEnabled else { return }
    guard wasAutoPaused else { return }
    defer { wasAutoPaused = false }
    guard settings().captureEnabled,
          permissionProvider(),
          !privacySnapshotProvider().isPrivateMode
    else {
      pausedReason = nil
      return
    }
    pausedReason = nil
    _ = loop.start()
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

  // MARK: - User toggle / quit stop

  /// Stop capture for a user-initiated reason. Stops the loop, finalizes the
  /// active video chunk (so the stop is durable), and emits `session_end_marker`
  /// once. A second call is a no-op (idempotent) — never emits a duplicate.
  ///
  /// The marker is queued synchronously (`RuntimeBridge.sendSessionEnd` is
  /// already outage-safe — it queues when disconnected and flushes on reconnect).
  /// The chunk finalize is bounded by a 5s semaphore so `applicationWillTerminate`
  /// does not stall the OS quit window.
  public func stop(reason: SessionEndReason) {
    loop.stop()
    pausedReason = .userToggle
    guard !didEmitSessionEnd else { return }

    if let archiveReconciler {
      let sem = DispatchSemaphore(value: 0)
      // The archive's finalize is actor-isolated and safe off-main. Run it
      // detached so a synchronous caller on the main actor (e.g.
      // applicationWillTerminate) does not deadlock against `sem.wait`.
      Task.detached {
        try? await archiveReconciler.finalizeActiveVideoChunk()
        sem.signal()
      }
      _ = sem.wait(timeout: .now() + 5)
    }
    do {
      try sessionEndSink?.sendSessionEnd(reason: reason)
    } catch {
      // Outage-safe: the marker is durably queued by `RuntimeBridge.sendOrQueue`
      // before any throw path is reachable; a throw here is a send failure the
      // outbox already absorbed. We still mark emitted to avoid duplicate
      // markers on the next stop.
    }
    didEmitSessionEnd = true
    try? lockFile?.markClean()
    didMarkCleanShutdown = true
  }

  // MARK: - Launch reconciliation

  /// Run on launch after the model attaches. Detects an unclean-shutdown lock
  /// file, reconciles the archive + outbox, and auto-starts capture when the
  /// persisted `captureEnabled` is still `true` and the capture boundary is
  /// active. Idempotent per process; subsequent calls are no-ops.
  public func performLaunchReconciliation() async {
    guard captureBoundaryEnabled else { return }
    guard !didPerformLaunchReconciliation else { return }
    didPerformLaunchReconciliation = true

    if let lockFile, lockFile.exists() {
      didDetectUncleanShutdown = true
    }
    try? lockFile?.markUnclean()

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

    guard settings().captureEnabled,
          permissionProvider(),
          !privacySnapshotProvider().isPrivateMode
    else { return }
    _ = loop.start()
  }

  public func markCleanShutdown() {
    try? lockFile?.markClean()
    didMarkCleanShutdown = true
  }

  private func settings() -> CompilerSettings { settingsProvider() }
}

// MARK: - RuntimeAdapter conformance

extension RuntimeAdapter: CaptureSessionEndSink {}