import AppKit
import ApplicationServices
import IntentiveDesktopCore
import IntentiveDesktopNativeAdapters
import IntentiveDesktopNativeAssets
import IntentiveDesktopPresentation
import ServiceManagement
import SwiftUI

#if DEBUG
private final class AcceptanceScreenCaptureSource: DesktopWindowContextSource {
  func activeWindowContext() throws -> DesktopWindowContext {
    DesktopWindowContext(
      appBundleID: "com.heyintentive.acceptance.fixture",
      appName: "Intentive Acceptance",
      windowTitle: "Authoritative capture first frame")
  }

  func captureFrame() async throws -> CapturedFrame {
    let image = NSImage(size: NSSize(width: 960, height: 540), flipped: false) { rect in
      NSColor.systemIndigo.setFill(); rect.fill()
      return true
    }
    guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:])
    else { throw CocoaError(.fileReadCorruptFile) }
    return CapturedFrame(
      id: UUID().uuidString,
      capturedAt: Date().protocolTimestamp,
      appBundleID: "com.heyintentive.acceptance.fixture",
      appName: "Intentive Acceptance",
      windowTitle: "Authoritative capture first frame",
      ocrText: "Authoritative capture first frame",
      rawFrameBytes: png)
  }
}

private final class AcceptancePassiveAudioSource: PassiveAudioStreamingSource {
  private(set) var isRunning = false
  private(set) var emittedBytes = 0
  private var onPCM16k: (@Sendable (Data) -> Void)?
  func start(onPCM16k: @escaping @Sendable (Data) -> Void) async throws {
    self.onPCM16k = onPCM16k
    isRunning = true
  }
  func stop() { isRunning = false; onPCM16k = nil }
  func clearPendingBuffers() { emittedBytes = 0 }
  func emit(_ data: Data) {
    guard isRunning else { return }
    emittedBytes += data.count
    onPCM16k?(data)
  }
}
#endif

enum DesktopSection: String, CaseIterable, Identifiable {
  case general = "General"
  case rewind = "Rewind"
  case privacy = "Privacy"
  case about = "About"

  var id: String { rawValue }

  var symbol: String {
    switch self {
    case .general: return "gearshape"
    case .rewind: return "clock.arrow.circlepath"
    case .privacy: return "lock.shield"
    case .about: return "info.circle"
    }
  }

  init(_ section: DesktopMainWindowSection) {
    switch section {
    case .general: self = .general
    case .rewind: self = .rewind
    case .privacy: self = .privacy
    case .about: self = .about
    }
  }

  init(_ section: DesktopUtilitySection) {
    switch section {
    case .general: self = .general
    case .rewind: self = .rewind
    case .privacy: self = .privacy
    case .about: self = .about
    }
  }

  var utilitySection: DesktopUtilitySection {
    switch self {
    case .general: return .general
    case .rewind: return .rewind
    case .privacy: return .privacy
    case .about: return .about
    }
  }
}

@MainActor
final class DesktopViewModel: ObservableObject {
  let launchConfiguration: DesktopLaunchConfiguration
  let composition: DesktopApplicationComposition
  @Published var selected: DesktopSection = .general
  @Published var query = ""
  @Published var status: String
  @Published var effectLog: [String] = []
  @Published var captureState: ScreenMemoryCaptureLifecycleState = .disabled
  var captureRunning: Bool { captureState.isRunning }
  @Published var compilerSettings: CompilerSettings
  @Published var excludedAppsText: String
  @Published var privacySnapshot: ScreenMemoryPrivacySnapshot
  @Published var screenRecordingPermissionGranted: Bool
  @Published var microphonePermissionStatus: DesktopMicrophonePermissionStatus
  @Published var runtimeState: DesktopRuntimeSessionState = .signedOut
  @Published var onboardingProgress: DesktopOnboardingProgress
  @Published var onboardingRetentionPeriod: ScreenMemoryRetentionPeriod = .sevenDays
  @Published var utilitySettings: DesktopUtilitySettings
  @Published var updateSnapshot = UpdateSnapshot()
  @Published var passiveAudioState: PassiveAudioCaptureState = .disabled
  @Published var showOnboarding: Bool
  @Published var accessibilityPermissionGranted: Bool
  @Published var coachingState: DesktopCoachingWindowState = .inactive(.awaitingLaunch)

  let messageStore = MessageStore()
  let screenMemory: SwitchableScreenMemoryStore
  private let settingsStore: any ScreenMemorySettingsStore
  private let privacyPolicy: ScreenMemoryPrivacyPolicy
  private let permissionGateway: any ScreenRecordingPermissionGateway
  private let microphonePermissionGateway: any DesktopMicrophonePermissionGateway
  private let onboardingStore: any DesktopOnboardingProgressStore
  private let utilitySettingsCoordinator: DesktopUtilitySettingsCoordinator
  private var publicReleaseOperations: DesktopPublicReleaseOperations!
  #if DEBUG
  private var automationBridge: DesktopAutomationBridge?
  private var automationDropNextIngressAck = false
  private var automationLastIngressAck: RuntimeIngressAck?
  private var automationManualUpdateChecks = 0
  private var automationRetentionExpiredCount = 0
  private var automationExpandedMatrix: [String: Bool] = [:]
  private var automationExpandedMatrixDetails: [String: String] = [:]
  private var automationRewindSmoke: [String: Bool] = [:]
  private var automationRewindSmokeDetails: [String: String] = [:]
  #endif
  private let alreadyAcknowledgedRuntimeClient = AlreadyAcknowledgedRuntimeClient()
  private let runtimeSocket = URLSessionRuntimeSocket()
  // On-device passive-audio stack: Silero VAD gates microphone segments and
  // FluidAudio/Parakeet transcribes on the Neural Engine. Shared so the ONNX
  // session and Parakeet model load once across every passive-audio consumer.
  private let sileroVAD = SileroAudioActivityPredictor()
  private let localTranscription = FluidAudioTranscriptionService()
  private var runtimeRestoreAttempted = false
  private var screenMemoryProfileUserID = DesktopLocalProfile.anonymousUserID
  private var coachingLaunchReason: CoachingWindowStartReason = .appLaunch
  private var coachingSettingsBeforePerception: CompilerSettings?
  private var coachingSystemAudioModeBeforePerception: SystemAudioCaptureMode?
  private var unavailableRequiredAudioSources = Set<PassiveAudioSource>()
  private var coachingStartedAtByWindow: [String: Date] = [:]
  private var lastCoachingPromptShownAt: Date?
  private var coachingWindowsWithFirstReply = Set<String>()
  private lazy var runtime = RuntimeAdapter(
    socket: runtimeSocket,
    messageStore: messageStore,
    clientVersion: DesktopRuntimeConfiguration.clientVersion,
    clientCapabilities: DesktopRuntimeConfiguration.clientCapabilities,
    activeCoachingWindowId: { [weak self] in self?.coachingState.windowId }
  )
  private lazy var runtimeEffectRunner = EffectRunner(
    overlay: FloatingBarOverlaySink(manager: floatingBarManager),
    runtimeClient: runtime,
    activeWindowId: { [weak self] in self?.coachingState.windowId }
  )
  private lazy var runtimeSession = DesktopRuntimeSessionCoordinator(
    auth: DesktopRuntimeConfiguration.authProvider(),
    controlPlane: DesktopRuntimeConfiguration.controlPlaneClient(),
    device: ClientDeviceService(deviceId: DesktopRuntimeConfiguration.deviceFingerprint),
    runtime: runtime,
    initialAccountState: composition.authentication.accountState,
    capturePermissionGranted: { [weak self] in self?.screenRecordingPermissionGranted ?? false }
  )
  private lazy var floatingBarController = FloatingBarController(
    runtimeClient: runtime,
    messageStore: messageStore,
    isCoachingPaused: { [weak self] in self?.coachingState == .paused },
    isCoachingAvailable: { [weak self] in
      guard let self, case .active = self.coachingState else { return false }
      return true
    },
    resumeCoaching: { [weak self] in self?.resumeCoaching() },
    onSubmitted: { [weak self] in self?.recordCoachingReply() }
  )
  private let floatingBarManager = FloatingControlBarManager.shared
  private lazy var compiler = ContextCompiler(
    settings: compilerSettings,
    retentionPolicy: ScreenMemoryRetentionPolicy(
      defaultRetentionClass: onboardingRetentionPeriod.retentionClass
    )
  )
  private lazy var publisher = PerceptionPublisher(
    runtimeClient: runtime,
    outbox: screenMemory,
    isRuntimeConnected: { [weak self] in self?.runtime.status == .connected },
    connectionGeneration: { [weak self] in self?.runtime.connectionGeneration ?? 0 },
    windowIdProvider: { [weak self] in self?.coachingState.windowId }
  )
  private lazy var captureSource: any DesktopWindowContextSource = {
    #if DEBUG
    if ProcessInfo.processInfo.environment["INTENTIVE_ACCEPTANCE_PROFILE_ROOT"] != nil {
      return AcceptanceScreenCaptureSource()
    }
    #endif
    return NativeScreenCaptureSource()
  }()
  private lazy var capture = CaptureCoordinator(
    compiler: compiler,
    screenMemory: screenMemory,
    publisher: publisher,
    archiveProvider: { [weak self] in self?.screenMemory.activeArchive },
    privacyPolicy: privacyPolicy
  )
  private lazy var localAudioMemory = ConditionalAudioMemoryStore(
    store: screenMemory,
    shouldStore: { [weak self] in self?.utilitySettings.storeRecordings ?? true }
  )
  private lazy var ambientAudio = AmbientAudioCoordinator(
    audioMemory: localAudioMemory,
    publisher: publisher
  )
  private lazy var captureLoop = ScreenMemoryCaptureLoop(
    coordinator: capture,
    source: captureSource,
    settingsProvider: { [weak self] in
      self?.compilerSettings ?? CompilerSettings(captureEnabled: false)
    },
    permissionProvider: { [weak self] in
      self?.reattestCoachingEligibilityFromSystem() ?? false
    },
    privacySnapshotProvider: { [weak self] in
      self?.privacyPolicy.snapshot ?? ScreenMemoryPrivacySnapshot()
    },
    intervalProvider: { [weak self] in
      // Battery-aware cadence: 3s on AC, 9s on battery (Omi:
      // `effectiveCaptureInterval`). Falls back to the default when no
      // lifecycle controller is wired yet.
      self?.captureLifecycle?.captureInterval(at: Date())
        ?? ScreenMemoryCaptureLoop.defaultIntervalSeconds
    },
    competingRecorderSkipProvider: { [weak self] in
      // Per-tick frontmost-app yield (Omi: `ProactiveScreenshotCaptureGate`).
      self?.captureLifecycle?.competingRecorderSkipReason(at: Date())
    }
  )
  private lazy var passiveAudioPipeline = PassiveAudioContextPipeline(
    coordinator: ambientAudio,
    voiceGate: SileroVoiceActivityGate(vad: sileroVAD),
    transcription: localTranscription,
    settingsProvider: { [weak self] in
      self?.compilerSettings ?? CompilerSettings(captureEnabled: false)
    },
    privacySnapshotProvider: { [weak self] in
      self?.privacyPolicy.snapshot ?? ScreenMemoryPrivacySnapshot()
    },
    microphonePermissionProvider: { [weak self] in self?.microphonePermissionStatus.isGranted ?? false },
    systemAudioPermissionProvider: { [weak self] in
      self?.requiredAudioSourceIsAvailable(.systemAudio) ?? false
    },
    systemAudioModeProvider: { SystemAudioCaptureSettings.shared.mode },
    meetingActiveProvider: { [weak self] in self?.meetingObserver.isMeetingActive ?? false },
    activeWindowProvider: { [weak self] in
      guard let self else { return nil }
      return try self.captureSource.activeWindowContext()
    }
  )
  #if DEBUG
  private lazy var acceptanceMicrophoneSource = AcceptancePassiveAudioSource()
  private lazy var acceptanceSystemAudioSource = AcceptancePassiveAudioSource()
  #endif
  private lazy var systemAudioSource: any PassiveAudioStreamingSource = {
    #if DEBUG
    if ProcessInfo.processInfo.environment["INTENTIVE_ACCEPTANCE_PROFILE_ROOT"] != nil {
      return acceptanceSystemAudioSource
    }
    #endif
    if #available(macOS 14.4, *) { return SystemAudioCaptureService() }
    return UnavailablePassiveAudioStreamingSource()
  }()
  private lazy var microphoneAudioSource: any PassiveAudioStreamingSource = {
    #if DEBUG
    if ProcessInfo.processInfo.environment["INTENTIVE_ACCEPTANCE_PROFILE_ROOT"] != nil {
      return acceptanceMicrophoneSource
    }
    #endif
    return NativeMicrophoneAudioCaptureService()
  }()
  private lazy var passiveAudioCoordinator: PassiveAudioCaptureCoordinator = {
    let coordinator = PassiveAudioCaptureCoordinator(
      microphone: microphoneAudioSource,
      systemAudio: systemAudioSource,
      pipeline: passiveAudioPipeline,
      microphonePermission: { [weak self] in self?.microphonePermissionStatus.isGranted ?? false },
      systemAudioPermission: { [weak self] in
        self?.requiredAudioSourceIsAvailable(.systemAudio) ?? false
      },
      systemAudioMode: { SystemAudioCaptureSettings.shared.mode }
    )
    coordinator.onStateChange = { [weak self] state in
      self?.passiveAudioState = state
      self?.objectWillChange.send()
      switch state {
      case .permissionBlocked:
        self?.refreshCoachingPermissionsFromSystem()
      case .disabled, .starting, .running, .failed, .degraded:
        break
      }
    }
    coordinator.onRequiredSourceUnavailable = { [weak self] source in
      self?.handleRequiredAudioSourceUnavailable(source)
    }
    return coordinator
  }()
  private lazy var meetingObserver = AppKitMeetingObserver { [weak self] active in
    self?.passiveAudioCoordinator.setMeetingActive(active)
  }
  /// Capture-lifecycle resilience controller: auto-start, sleep/wake/lock,
  /// battery cadence, competing-recorder yield, stop → session_end_marker.
  /// Renovated from Omi's `ProactiveAssistantsPlugin` cycle at the Intentive
  /// `DesktopExperience.swift` seam. The AppKit observers live in the app
  /// target (`CaptureLifecycleAdapters.swift`); Core stays testable.
  private(set) lazy var captureLifecycle: ScreenMemoryCaptureLifecycleController? = {
    guard composition.activeSystemBoundaries.contains(.capture) else { return nil }
    let usesCaptureBoundary = composition.activeSystemBoundaries.contains(.capture)
    let isAcceptance = ProcessInfo.processInfo.environment["INTENTIVE_ACCEPTANCE_PROFILE_ROOT"] != nil
    let recorderDetector: (any CompetingScreenRecorderDetector)? =
      isAcceptance ? nil : AppKitCompetingScreenRecorderDetector()
    // The unclean-shutdown flag file lives next to `intentive.db` in the
    // Intentive profile root. Omi stores `.omi_running` per-database; we keep a
    // single app-level flag because the per-user archive mounts lazily after
    // sign-in and the launch-time check must run before any archive exists.
    let lock =
      (try? CaptureSessionLockFile.inProfile(launchConfiguration.profileRoot))
      ?? CaptureSessionLockFile(
        url: launchConfiguration.profileRoot
          .appendingPathComponent("intentive_session.lock"))
    let controller = ScreenMemoryCaptureLifecycleController(
      loop: captureLoop,
      powerSource: PowerMonitorDesktopPowerSource(),
      recorderDetector: recorderDetector,
      sessionEndSink: publisher,
      archiveReconciler: screenMemory.activeArchive,
      outboxDrain: publisher,
      lockFile: lock,
      settingsProvider: { [weak self] in
        self?.compilerSettings ?? CompilerSettings(captureEnabled: false)
      },
      permissionProvider: { [weak self] in self?.screenRecordingPermissionGranted ?? false },
      captureBoundaryEnabled: usesCaptureBoundary
    )
    controller.onStateChange = { [weak self] state in
      self?.captureState = state
      self?.objectWillChange.send()
      switch state {
      case .permissionBlocked, .failed:
        self?.refreshCoachingPermissionsFromSystem()
      case .disabled, .starting, .running, .autoPaused, .stopping, .degraded:
        break
      }
    }
    controller.onCaptureEvent = { [weak self] event in
      switch event {
      case .captured:
        self?.rebuildScreenMemoryTimeline()
      case .failed:
        self?.refreshCoachingPermissionsFromSystem()
      case .skipped:
        break
      }
    }
    return controller
  }()
  private lazy var coachingEffects = DesktopCoachingWindowEffectAdapter(
    publisher: { [unowned self] in self.publisher },
    startPerception: { [weak self] windowId in
      self?.startCoachingPerception(windowId: windowId)
    },
    stopPerception: { [weak self] in
      self?.stopCoachingPerception()
    },
    finalizePerception: { [weak self] reason in
      self?.finalizeCoachingPerception(reason: reason)
    },
    onWindowStarted: { [weak self] event in
      self?.recordCoachingWindowStarted(event)
    },
    onWindowEnded: { [weak self] event in
      self?.recordCoachingWindowEnded(event)
    }
  )
  private(set) lazy var coachingWindow = DesktopCoachingWindowCoordinator(
    initialEligibility: coachingEligibility,
    effects: coachingEffects,
    eligibilityAttestation: { [weak self] in
      self?.readLiveCoachingEligibility()
        ?? DesktopCoachingEligibility(
          isAuthenticated: false,
          onboardingComplete: false,
          screenRecordingGranted: false,
          microphoneGranted: false,
          accessibilityGranted: false,
          systemAudioGranted: false
        )
    },
    lockFile: CoachingWindowLockFile(
      url: launchConfiguration.profileRoot
        .appendingPathComponent("intentive_coaching_window.lock")
    ),
    runtimeConnected: runtime.status == .connected
  )
  private lazy var coachingSystemEventObserver = AppKitCaptureSystemEventObserver()
  private var didInstallCoachingSystemObservers = false
  private var didRunLaunchReconciliation = false

  /// Screen Memory results for the current `query`, refreshed on query change
  /// rather than per-render so the on-device semantic pass runs at most once per
  /// keystroke. Renovated from Omi's `RewindViewModel.performSearch`.
  @Published var screenMemoryResults: [ScreenMemoryRankedResult] = []
  @Published var timelineState: ScreenMemoryTimeline.State?
  @Published var currentFrameData: Data?
  @Published var screenMemoryPlaying = false
  private var screenMemoryTimeline: ScreenMemoryTimeline?
  private var frameLoadTask: Task<Void, Never>?
  private var playbackTask: Task<Void, Never>?
  private var frameCache: [String: Data] = [:]

  /// Recompute Screen Memory search through the active archive's hybrid local
  /// search (FTS-first, on-device vector recall appended). Falls back to the
  /// store's lexical search when no archive is mounted yet.
  func refreshScreenMemorySearch() {
    if let timeline = screenMemoryTimeline {
      Task { @MainActor [weak self] in
        await timeline.search(self?.query ?? "")
        self?.publishTimelineState()
        self?.loadSelectedTimelineFrame()
      }
      return
    }
    if let archive = screenMemory.activeArchive {
      screenMemoryResults = archive.semanticSearch(query, limit: 24)
    } else {
      screenMemoryResults = screenMemory.search(query, limit: 24).map {
        ScreenMemoryRankedResult(record: $0.record, matchedLexically: true, semanticSimilarity: nil)
      }
    }
  }

  func rebuildScreenMemoryTimeline(selectedDate: Date = Date()) {
    frameLoadTask?.cancel()
    playbackTask?.cancel()
    frameCache.removeAll()
    currentFrameData = nil
    screenMemoryPlaying = false
    guard let archive = screenMemory.activeArchive else {
      screenMemoryTimeline = nil
      timelineState = nil
      return
    }
    let timeline = ScreenMemoryTimeline(archive: archive, selectedDate: selectedDate)
    screenMemoryTimeline = timeline
    Task { @MainActor [weak self] in
      await timeline.loadDay(selectedDate)
      self?.publishTimelineState()
      self?.loadSelectedTimelineFrame()
    }
  }

  func moveScreenMemoryDay(_ offset: Int) {
    guard let timeline = screenMemoryTimeline,
      let date = Calendar.current.date(byAdding: .day, value: offset, to: timeline.state.selectedDate)
    else { return }
    Task { @MainActor [weak self] in
      await timeline.loadDay(date)
      self?.query = ""
      self?.publishTimelineState()
      self?.loadSelectedTimelineFrame()
    }
  }

  func filterScreenMemory(app: String?) {
    guard let timeline = screenMemoryTimeline else { return }
    Task { @MainActor [weak self] in
      await timeline.filterByApp(app)
      self?.publishTimelineState()
      self?.loadSelectedTimelineFrame()
    }
  }

  func selectScreenMemory(_ record: ScreenMemoryRecord) {
    guard let id = UUID(uuidString: record.id).map(ScreenMemoryRecordID.init) else { return }
    screenMemoryTimeline?.select(id)
    publishTimelineState()
    loadSelectedTimelineFrame()
  }

  func scrubScreenMemory(to index: Int) {
    guard let frames = timelineState?.frames, frames.indices.contains(index) else { return }
    selectScreenMemory(frames[index])
  }

  func stepScreenMemory(_ direction: Int) {
    direction < 0 ? screenMemoryTimeline?.selectPrevious() : screenMemoryTimeline?.selectNext()
    publishTimelineState()
    loadSelectedTimelineFrame()
  }

  func toggleScreenMemoryPlayback() {
    screenMemoryPlaying.toggle()
    playbackTask?.cancel()
    guard screenMemoryPlaying else { return }
    playbackTask = Task { @MainActor [weak self] in
      while !Task.isCancelled, self?.screenMemoryPlaying == true {
        try? await Task.sleep(nanoseconds: 700_000_000)
        guard !Task.isCancelled, let self else { return }
        let before = self.timelineState?.selectedRecordID
        self.stepScreenMemory(1)
        if before == self.timelineState?.selectedRecordID { self.screenMemoryPlaying = false }
      }
    }
  }

  func deleteSelectedScreenMemory(confirmChunkDeletion: Bool) async -> ScreenMemoryDeletionResult? {
    guard let timeline = screenMemoryTimeline, let id = timeline.state.selectedRecordID else { return nil }
    let result = await timeline.delete(id, confirmChunkDeletion: confirmChunkDeletion)
    publishTimelineState()
    loadSelectedTimelineFrame()
    return result
  }

  func thumbnailData(for record: ScreenMemoryRecord) async -> Data? {
    if let cached = frameCache[record.id] { return cached }
    guard let timeline = screenMemoryTimeline,
      let id = UUID(uuidString: record.id).map(ScreenMemoryRecordID.init),
      let frame = await timeline.frameImage(for: id)
    else { return nil }
    frameCache[record.id] = frame.imageData
    return frame.imageData
  }

  var selectedTimelineRecord: ScreenMemoryRecord? {
    guard let state = timelineState, let selected = state.selectedRecordID else { return nil }
    return state.frames.first { $0.id == selected.value.uuidString }
  }

  var selectedOCRMatches: [ScreenMemoryOCRBlock] {
    guard let timeline = screenMemoryTimeline, let id = timeline.state.selectedRecordID else { return [] }
    return timeline.matchingBlocks(for: id)
  }

  private func publishTimelineState() { timelineState = screenMemoryTimeline?.state }

  private func loadSelectedTimelineFrame() {
    frameLoadTask?.cancel()
    currentFrameData = nil
    guard let timeline = screenMemoryTimeline, let id = timeline.state.selectedRecordID else { return }
    frameLoadTask = Task { @MainActor [weak self] in
      let frame = await timeline.frameImage(for: id)
      guard !Task.isCancelled, self?.screenMemoryTimeline === timeline,
        self?.screenMemoryTimeline?.state.selectedRecordID == id else { return }
      self?.currentFrameData = frame?.imageData
      if let data = frame?.imageData { self?.frameCache[id.value.uuidString] = data }
      guard let frames = self?.timelineState?.frames,
        let index = frames.firstIndex(where: { $0.id == id.value.uuidString }) else { return }
      for adjacent in [index - 1, index + 1] where frames.indices.contains(adjacent) {
        _ = await self?.thumbnailData(for: frames[adjacent])
      }
    }
  }

  var onboardingRequirements: DesktopOnboardingRequirements {
    let gate = runtimeSession.accountState?.nextGate
    return DesktopOnboardingRequirements(
      progress: onboardingProgress,
      isAuthenticated: isOnboardingAuthenticated,
      crossClientSetupComplete: gate == nil || gate == .capturePermissionSetup,
      screenRecordingPermissionGranted: screenRecordingPermissionGranted,
      microphonePermissionGranted: microphonePermissionStatus.isGranted,
      systemAudioPermissionGranted: screenRecordingPermissionGranted
        && requiredAudioSourceIsAvailable(.systemAudio),
      accessibilityPermissionGranted: accessibilityPermissionGranted
    )
  }

  private var coachingEligibility: DesktopCoachingEligibility {
    DesktopCoachingEligibility(
      isAuthenticated: isOnboardingAuthenticated,
      onboardingComplete: onboardingProgress.completed
        && DesktopOnboardingStep.allCases.allSatisfy(onboardingProgress.isReviewed),
      screenRecordingGranted: screenRecordingPermissionGranted,
      microphoneGranted: microphonePermissionStatus.isGranted
        && requiredAudioSourceIsAvailable(.microphone),
      accessibilityGranted: accessibilityPermissionGranted,
      systemAudioGranted: screenRecordingPermissionGranted
        && requiredAudioSourceIsAvailable(.systemAudio)
    )
  }

  private var isOnboardingAuthenticated: Bool {
    if case .signedIn = composition.authentication { return true }
    return runtimeSession.accountState != nil
  }

  init(
    launchConfiguration: DesktopLaunchConfiguration,
    composition: DesktopApplicationComposition,
    settingsStore: any ScreenMemorySettingsStore = UserDefaultsScreenMemorySettingsStore(),
    permissionGateway: any ScreenRecordingPermissionGateway =
      NativeScreenRecordingPermissionGateway(),
    microphonePermissionGateway: any DesktopMicrophonePermissionGateway =
      NativeMicrophonePermissionGateway(),
    onboardingStore: any DesktopOnboardingProgressStore =
      UserDefaultsDesktopOnboardingProgressStore(),
    utilitySettingsStore: any DesktopUtilitySettingsStore =
      UserDefaultsDesktopUtilitySettingsStore()
  ) {
    self.launchConfiguration = launchConfiguration
    self.composition = composition
    self.settingsStore = settingsStore
    self.permissionGateway = permissionGateway
    self.microphonePermissionGateway = microphonePermissionGateway
    self.onboardingStore = onboardingStore
    let utilitySettingsCoordinator = DesktopUtilitySettingsCoordinator(store: utilitySettingsStore)
    self.utilitySettingsCoordinator = utilitySettingsCoordinator
    let loadedUtilitySettings = utilitySettingsCoordinator.settings
    utilitySettings = loadedUtilitySettings
    var settings = settingsStore.load()
    let privacyPolicy = ScreenMemoryPrivacyPolicy(
      persistence: UserDefaultsScreenMemoryPrivacyPersistence(),
      legacyExcludedAppNames: settings.excludedApps
    )
    self.privacyPolicy = privacyPolicy
    settings.excludedApps = []
    let progress = onboardingStore.load()
    let usesCaptureBoundary = composition.activeSystemBoundaries.contains(.capture)
    let isAcceptance = ProcessInfo.processInfo.environment["INTENTIVE_ACCEPTANCE_PROFILE_ROOT"] != nil
    let screenRecordingPermissionGranted =
      usesCaptureBoundary && !isAcceptance
      ? permissionGateway.hasScreenRecordingPermission()
      : composition.permissions.screenRecording == .granted
    let microphonePermissionStatus =
      usesCaptureBoundary && !isAcceptance
      ? microphonePermissionGateway.authorizationStatus()
      : Self.microphonePermissionStatus(from: composition.permissions.microphone)
    let accessibilityPermissionGranted =
      isAcceptance ? true : AXIsProcessTrusted()
    settings.captureEnabled = loadedUtilitySettings.screenCaptureEnabled
    settings.ambientAudioCaptureEnabled = loadedUtilitySettings.passiveAudioEnabled
    compilerSettings = settings
    excludedAppsText = Self.renderExcludedApps(
      Set(privacyPolicy.snapshot.excludedApplications.map(\.displayName))
    )
    privacySnapshot = privacyPolicy.snapshot
    self.screenRecordingPermissionGranted = screenRecordingPermissionGranted
    self.microphonePermissionStatus = microphonePermissionStatus
    self.accessibilityPermissionGranted = accessibilityPermissionGranted
    onboardingProgress = progress
    let launchUserID: String?
    switch composition.authentication {
    case .signedOut:
      launchUserID = nil
    case .signedIn(let userID, _):
      launchUserID = userID
    }
    let retentionPersistence = UserDefaultsScreenMemoryRetentionPersistence(
      userID: launchUserID ?? DesktopLocalProfile.anonymousUserID)
    onboardingRetentionPeriod = retentionPersistence.loadRetentionPeriod() ?? .sevenDays
    if let retention = ScreenMemoryRetentionPeriod(rawValue: loadedUtilitySettings.retentionDays) {
      onboardingRetentionPeriod = retention
    }
    showOnboarding =
      composition.setupSurface == .onboarding
      && !DesktopOnboardingRequirements(
        progress: progress,
        isAuthenticated: launchUserID != nil,
        screenRecordingPermissionGranted: screenRecordingPermissionGranted,
        microphonePermissionGranted: microphonePermissionStatus.isGranted,
        systemAudioPermissionGranted: screenRecordingPermissionGranted,
        accessibilityPermissionGranted: accessibilityPermissionGranted
      ).isComplete

    let initialScreenMemory = Self.makeScreenMemoryStore(
      userID: launchUserID,
      baseApplicationSupportURL: launchConfiguration.profileRoot
    )
    let initialScreenMemoryProfileID = DesktopLocalProfile.sanitizedUserID(launchUserID)
    screenMemory = SwitchableScreenMemoryStore(
      initialScreenMemory.store,
      profileID: initialScreenMemoryProfileID
    )
    screenMemoryProfileUserID = initialScreenMemoryProfileID
    status = initialScreenMemory.status
    selected = DesktopSection(loadedUtilitySettings.selectedSection)
    configureRuntimeSocketCallbacks()
    floatingBarManager.configure(controller: floatingBarController)
    floatingBarManager.setShortcutPreset(loadedUtilitySettings.floatingBarShortcut)
    SystemAudioCaptureSettings.shared.mode = loadedUtilitySettings.systemAudioMode
    floatingBarManager.registerGlobalShortcut()
    publicReleaseOperations = DesktopPublicReleaseOperations(
      profileRoot: launchConfiguration.profileRoot,
      updatesEnabled: composition.activeSystemBoundaries.contains(.updates),
      telemetryEnabled: composition.activeSystemBoundaries.contains(.telemetry),
      analyticsConsent: { [weak self] in self?.utilitySettings.analyticsEnabled ?? false },
      onUpdateSnapshot: { [weak self] snapshot in self?.updateSnapshot = snapshot }
    )
    publicReleaseOperations.setAutomaticUpdatePreferences(
      checks: loadedUtilitySettings.automaticallyChecksForUpdates,
      downloads: loadedUtilitySettings.automaticallyDownloadsUpdates
    )
    _ = coachingWindow
    coachingWindow.onStateChange = { [weak self] state in
      self?.coachingState = state
      self?.floatingBarManager.refreshCoachingState()
      self?.objectWillChange.send()
    }
    installCoachingSystemEventObservers()
    passiveAudioCoordinator.setUserEnabled(false)
    meetingObserver.start()
    rebuildScreenMemoryTimeline()
    #if DEBUG
    if let tokenPath = ProcessInfo.processInfo.environment["INTENTIVE_AUTOMATION_TOKEN_FILE"] {
      automationBridge = DesktopAutomationBridge(tokenFile: URL(fileURLWithPath: tokenPath)) { [weak self] in
        guard let self else { return [:] }
        let pendingIngress = (try? self.screenMemory.pendingIngress(limit: 1_000)) ?? []
        let hasStructuredScreenIngress = pendingIngress.contains { item in
          guard case .perceptionEvent(let event) = item,
            event.artifactType == .searchableScreenRecord
          else { return false }
          return event.signals["app_name"] != nil
            && event.signals["window_title"] != nil
            && event.signals["ocr_text"] != nil
        }
        let tombstoneReasons: [String] = pendingIngress.compactMap { item in
          guard case .perceptionTombstone(let tombstone) = item else { return nil }
          return tombstone.reason.rawValue
        }
        return [
          "capture_state": String(describing: self.captureState),
          "capture_source_frames": self.captureLifecycle?.loop.state.capturedFrameCount ?? 0,
          "capture_source_running": self.captureLifecycle?.loop.state.isRunning ?? false,
          "capture_source_last_error": self.captureLifecycle?.loop.state.lastError ?? NSNull(),
          "capture_source_last_skip": self.captureLifecycle?.loop.state.lastSkipReason ?? NSNull(),
          "passive_audio_state": String(describing: self.passiveAudioState),
          "acceptance_microphone_pcm_bytes": self.acceptanceMicrophoneSource.emittedBytes,
          "runtime_state": String(describing: self.runtimeState),
          "screen_memory_frames": self.timelineState?.frames.count ?? 0,
          "screen_memory_query": self.query,
          "screen_memory_selected_record": self.timelineState?.selectedRecordID?.value.uuidString ?? NSNull(),
          "screen_memory_playing": self.screenMemoryPlaying,
          "screen_memory_selected_date": self.timelineState?.selectedDate.protocolTimestamp ?? NSNull(),
          "capture_enabled": self.compilerSettings.captureEnabled,
          "passive_audio_enabled": self.compilerSettings.ambientAudioCaptureEnabled,
          "account_email": self.accountEmail ?? NSNull(),
          "onboarding_presented": self.showOnboarding,
          "onboarding_screen_recording_decision": self.onboardingProgress.screenRecordingDecision?.rawValue ?? NSNull(),
          "onboarding_audio_decision": self.onboardingProgress.microphoneDecision?.rawValue ?? NSNull(),
          "onboarding_completed": self.onboardingProgress.completed,
          "update_phase": self.updateSnapshot.phase.rawValue,
          "manual_update_checks": self.automationManualUpdateChecks,
          "app_status": self.status,
          "app_windows": NSApp.windows.count,
          "visible_windows": NSApp.windows.filter(\.isVisible).count,
          "floating_bar_visible": self.floatingBarManager.isVisible,
          "floating_bar_engaged": self.floatingBarManager.isConversationEngaged,
          "coaching_state": String(describing: self.coachingState),
          "coaching_window_id": self.coachingState.windowId ?? NSNull(),
          "coaching_paused": self.coachingState == .paused,
          "conversation_message_count": self.messageStore.messages.count,
          "runtime_ingress_pending": pendingIngress.count,
          "runtime_ingress_kinds": pendingIngress.map(\.kind.rawValue),
          "runtime_tombstone_reasons": tombstoneReasons,
          "runtime_structured_screen_ingress": hasStructuredScreenIngress,
          "retention_expired_count": self.automationRetentionExpiredCount,
          "expanded_matrix": self.automationExpandedMatrix,
          "expanded_matrix_details": self.automationExpandedMatrixDetails,
          "rewind_smoke": self.automationRewindSmoke,
          "rewind_smoke_details": self.automationRewindSmokeDetails,
        ]
      } resetFixture: { [weak self] in
        guard let self else { return [:] }
        return try await self.resetAcceptanceFixture()
      } seedFixture: { [weak self] in
        guard let self else { return [:] }
        return try await self.seedAcceptanceFixture()
      } dropNextAck: { [weak self] in
        self?.automationDropNextIngressAck = true
        return ["armed": true]
      } disconnectRuntime: { [weak self] in
        guard let self else { return [:] }
        self.runtime.markConnectionLost(reason: "Acceptance fault")
        self.runtimeSession.markRuntimeClosed(reason: "Acceptance fault")
        self.applyRuntimeState(self.runtimeSession.state)
        return ["runtime_state": String(describing: self.runtimeState)]
      } reconnectRuntime: { [weak self] in
        guard let self else { return [:] }
        do {
          try self.runtime.handleSocketEvent(
            ProtocolEventCodec.encode(
              HelloOk(sessionSnapshot: SessionSnapshot(messages: [], beforeCursor: nil))))
        } catch {
          // Assembled acceptance intentionally has no network transport. The
          // real hello transition occurs before its ephemeral queue flush hits
          // that absent socket; decoding or state failures remain fatal.
          guard self.runtime.status == .connected else { throw error }
        }
        self.runtimeSession.markRuntimeConnected()
        self.applyRuntimeState(self.runtimeSession.state)
        return ["runtime_state": String(describing: self.runtimeState)]
      } emitPendingAck: { [weak self] in
        guard let self else { return ["acknowledged": false] }
        let ack: RuntimeIngressAck
        let duplicate: Bool
        if let item = try self.screenMemory.pendingIngress(limit: 1).first {
          ack = RuntimeIngressAck(ingressKind: item.kind, ingressId: item.ingressId)
          self.automationLastIngressAck = ack
          duplicate = false
        } else if let last = self.automationLastIngressAck {
          ack = last
          duplicate = true
        } else {
          return ["acknowledged": false]
        }
        try self.runtime.handleSocketEvent(ProtocolEventCodec.encode(ack))
        return ["acknowledged": true, "duplicate": duplicate, "ingress_id": ack.ingressId]
      } emitOrdinaryReply: { [weak self] in
        guard let self else { return [:] }
        let message = CompanionMessage(
          messageId: "acceptance-ordinary-\(UUID().uuidString)",
          body: "Ordinary acceptance reply",
          emittedAt: Date().protocolTimestamp,
          viaPostMessageBack: false
        )
        try self.runtime.handleSocketEvent(ProtocolEventCodec.encode(message))
        self.floatingBarManager.refreshMessages()
        return ["message_id": message.messageId]
      } emitProactiveMessage: { [weak self] in
        guard let self else { return [:] }
        // A real Post-Message-Back reply travels the production socket path:
        // `handleSocketEvent` lands it in the shared store and fires the
        // `onCompanionMessage` effect that auto-opens the bar in-thread.
        let message = CompanionMessage(
          messageId: "acceptance-proactive-\(UUID().uuidString)",
          windowId: self.coachingState.windowId,
          body: "Proactive acceptance nudge",
          emittedAt: Date().protocolTimestamp,
          viaPostMessageBack: true
        )
        try self.runtime.handleSocketEvent(ProtocolEventCodec.encode(message))
        self.floatingBarManager.refreshMessages()
        return ["message_id": message.messageId]
      } runRewindSmoke: { [weak self] in
        guard let self else { return [:] }
        await self.acceptanceRunRewindSmoke()
        return ["rewind_smoke": self.automationRewindSmoke]
      } runExpandedMatrix: { [weak self] in
        guard let self else { return [:] }
        await self.acceptanceRunExpandedMatrix()
        return ["expanded_matrix": self.automationExpandedMatrix]
      }
      try? automationBridge?.start()
    }
    #endif
  }

  #if DEBUG
  private func resetAcceptanceFixture() async throws -> [String: Any] {
    guard let archive = screenMemory.activeArchive else {
      throw ScreenMemoryArchiveError.signedInProfileRequired
    }
    _ = try await archive.clearAll()
    query = ""
    rebuildScreenMemoryTimeline()
    return ["screen_memory_frames": 0]
  }

  private func seedAcceptanceFixture() async throws -> [String: Any] {
    guard let archive = screenMemory.activeArchive else {
      throw ScreenMemoryArchiveError.signedInProfileRequired
    }
    setAmbientAudioCaptureEnabled(false)
    setCaptureEnabled(false)
    _ = try await archive.clearAll()
    // Fixture setup establishes a quiet, completed baseline. Onboarding is
    // reset and exercised later through its real AX menu action; leaving its
    // window frontmost here can hide confirmation dialogs owned by the utility
    // window and produce false failures.
    onboardingProgress = DesktopOnboardingProgress(
      completedSteps: Set(DesktopOnboardingStep.allCases),
      screenRecordingDecision: .granted,
      microphoneDecision: .granted,
      completed: true
    )
    try onboardingStore.save(onboardingProgress)
    showOnboarding = false
    reconcileCoachingEligibility(startReason: .onboardingCompleted)
    let now = Date()
    let seeds: [(String, String, String, NSColor)] = [
      ("com.apple.Safari", "Safari", "Invoice 1042 - Acme", .systemBlue),
      ("com.figma.Desktop", "Figma", "Intentive release checklist", .systemPurple),
      ("com.apple.Terminal", "Terminal", "Desktop acceptance passed", .systemGreen),
    ]
    for (index, seed) in seeds.enumerated() {
      let capturedAt = now.addingTimeInterval(Double(index - seeds.count) * 30)
      _ = try await archive.ingest(
        ScreenMemoryCaptureInput(
          userID: archive.userID,
          imageData: try acceptanceFixtureImage(
            title: seed.2,
            detail: index == 0 ? "Invoice total $42.00" : "Frame \(index + 1)",
            color: seed.3,
            variant: index
          ),
          capturedAt: capturedAt.protocolTimestamp,
          appBundleID: seed.0,
          appName: seed.1,
          windowTitle: seed.2
        ))
    }
    try await archive.finalizeActiveVideoChunk()
    _ = try await archive.ingest(
      ScreenMemoryCaptureInput(
        userID: archive.userID,
        imageData: try acceptanceFixtureImage(
          title: "Expired retention fixture",
          detail: "This frame must expire under the three-day policy",
          color: .systemOrange,
          variant: 99
        ),
        capturedAt: now.addingTimeInterval(-5 * 24 * 60 * 60).protocolTimestamp,
        appBundleID: "com.heyintentive.acceptance.expired",
        appName: "Expired Fixture",
        windowTitle: "Expired retention fixture"
      ))
    try await archive.finalizeActiveVideoChunk()
    let marker = SessionEndMarker(
      markerId: UUID().uuidString,
      sessionId: UUID().uuidString,
      endedAt: now.protocolTimestamp,
      reason: .userToggle
    )
    try screenMemory.enqueueSessionEndMarker(marker)
    query = ""
    let timeline = ScreenMemoryTimeline(archive: archive, selectedDate: now)
    screenMemoryTimeline = timeline
    await timeline.loadDay(now)
    publishTimelineState()
    loadSelectedTimelineFrame()
    return ["screen_memory_frames": timeline.state.frames.count]
  }

  private func acceptanceFixtureImage(
    title: String,
    detail: String,
    color: NSColor,
    variant: Int
  ) throws -> Data {
    let size = NSSize(width: 960, height: 540)
    let image = NSImage(size: size, flipped: false) { rect in
      color.setFill()
      rect.fill()
      NSColor.black.withAlphaComponent(0.7).setFill()
      switch variant {
      case 0:
        NSRect(x: 0, y: 0, width: 250, height: rect.height).fill()
      case 1:
        NSRect(x: 0, y: rect.height - 190, width: rect.width, height: 190).fill()
      case 100:
        NSRect(x: 0, y: 0, width: 180, height: rect.height).fill()
        NSRect(x: 0, y: 0, width: rect.width, height: 120).fill()
      default:
        for x in stride(from: 0, to: Int(rect.width), by: 180) where (x / 180).isMultiple(of: 2) {
          NSRect(x: CGFloat(x), y: 0, width: 90, height: rect.height).fill()
        }
      }
      let paragraph = NSMutableParagraphStyle()
      paragraph.alignment = .center
      title.draw(
        in: NSRect(x: 40, y: 270, width: 880, height: 90),
        withAttributes: [
          .font: NSFont.systemFont(ofSize: 42, weight: .bold),
          .foregroundColor: NSColor.white,
          .paragraphStyle: paragraph,
        ])
      detail.draw(
        in: NSRect(x: 40, y: 205, width: 880, height: 60),
        withAttributes: [
          .font: NSFont.systemFont(ofSize: 28),
          .foregroundColor: NSColor.white,
          .paragraphStyle: paragraph,
        ])
      return true
    }
    guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:])
    else {
      throw CocoaError(.fileWriteUnknown)
    }
    return png
  }
  #endif

  func restoreRuntimeSessionIfNeeded() async {
    guard composition.activeSystemBoundaries.contains(.network) else {
      switch composition.authentication {
      case .signedOut:
        runtimeState = .signedOut
        status = "Sign in required"
      case .signedIn:
        runtimeState =
          composition.runtime == .connected ? .connected : .retry(retryAfterSeconds: nil)
        status = composition.runtime == .connected ? "Runtime fixture connected" : "Runtime offline"
      }
      return
    }
    guard !runtimeRestoreAttempted else { return }
    runtimeRestoreAttempted = true
    await restoreRuntimeSession()
  }

  /// Slice 07 — launch-time capture-lifecycle reconciliation: detect an
  /// unclean shutdown (leftover `intentive_session.lock`), reconcile orphaned
  /// video chunks / expired outbox rows, and auto-start the capture loop when
  /// the persisted `captureEnabled` is still `true`. Renovated from Omi's
  /// `DesktopHomeView.scheduleProactiveMonitoringStart` + `.omi_running` flag.
  func performCaptureLaunchReconciliation() async {
    guard !didRunLaunchReconciliation else { return }
    didRunLaunchReconciliation = true
    guard composition.activeSystemBoundaries.contains(.capture) else { return }
    await captureLifecycle?.performLaunchReconciliation(autoStart: false)
    captureState = captureLifecycle?.state ?? .disabled
    do {
      try coachingWindow.handle(.launch(coachingLaunchReason))
      coachingState = coachingWindow.state
      if coachingState.windowId != nil {
        status = "Coaching Window active"
      }
    } catch {
      status = "Coaching Window could not start: \(error.localizedDescription)"
    }
    objectWillChange.send()
  }

  func configureCoachingLaunch(background: Bool) {
    coachingLaunchReason = background ? .loginLaunch : .appLaunch
  }

  func pauseCoaching() {
    do {
      try coachingWindow.handle(.pauseRequested)
      coachingState = coachingWindow.state
      publicReleaseOperations.trackCoachingEvent(.coachingPaused)
      status = "Coaching paused"
    } catch {
      status = "Pause Coaching failed: \(error.localizedDescription)"
    }
  }

  func resumeCoaching() {
    do {
      try coachingWindow.handle(.resumeRequested)
      coachingState = coachingWindow.state
      if coachingState.windowId != nil {
        publicReleaseOperations.trackCoachingEvent(.coachingResumed)
      }
      status = coachingState.windowId == nil
        ? "Required permissions must be restored before coaching can resume"
        : "Coaching resumed"
    } catch {
      status = "Resume Coaching failed: \(error.localizedDescription)"
    }
  }

  private func installCoachingSystemEventObservers() {
    guard !didInstallCoachingSystemObservers else { return }
    didInstallCoachingSystemObservers = true
    coachingSystemEventObserver.observe { [weak self] kind in
      Task { @MainActor [weak self] in
        guard let self else { return }
        do {
          switch kind {
          case .systemSleep:
            try coachingWindow.handle(.systemSleep)
          case .systemWake:
            refreshCoachingPermissionsFromSystem(allowRequiredAudioRetry: true)
            try coachingWindow.handle(.systemWake)
          case .screenLock:
            try coachingWindow.handle(.screenLocked)
          case .screenUnlock:
            refreshCoachingPermissionsFromSystem(allowRequiredAudioRetry: true)
            try coachingWindow.handle(.screenUnlocked)
          case .displayChange:
            captureLifecycle?.receiveSystemEvent(.displayChange)
          }
          coachingState = coachingWindow.state
        } catch {
          status = "Coaching lifecycle failed: \(error.localizedDescription)"
        }
      }
    }
  }

  private func startCoachingPerception(windowId: String) {
    guard coachingState.windowId == windowId else { return }
    if coachingSettingsBeforePerception == nil {
      coachingSettingsBeforePerception = compilerSettings
    }
    var activeSettings = compilerSettings
    activeSettings.captureEnabled = true
    activeSettings.ambientAudioCaptureEnabled = true
    compilerSettings = activeSettings
    compiler.update(settings: activeSettings)
    if coachingSystemAudioModeBeforePerception == nil {
      coachingSystemAudioModeBeforePerception = SystemAudioCaptureSettings.shared.mode
    }
    SystemAudioCaptureSettings.shared.mode = .always
    captureLifecycle?.setUserEnabled(true)
    passiveAudioCoordinator.setUserEnabled(true)
    captureState = captureLifecycle?.state ?? .disabled
  }

  private func stopCoachingPerception() {
    captureLifecycle?.suspendForCoachingBoundary()
    passiveAudioCoordinator.stopSynchronously()
    if let prior = coachingSettingsBeforePerception {
      compilerSettings = prior
      compiler.update(settings: prior)
      coachingSettingsBeforePerception = nil
    }
    if let priorMode = coachingSystemAudioModeBeforePerception {
      SystemAudioCaptureSettings.shared.mode = priorMode
      coachingSystemAudioModeBeforePerception = nil
    }
    captureState = captureLifecycle?.state ?? .disabled
  }

  private func finalizeCoachingPerception(reason: CoachingWindowEndReason) {
    let sessionReason: SessionEndReason =
      switch reason {
      case .quit: .quit
      case .crash: .crash
      case .pause, .systemSleep, .signOut, .permissionLost: .userToggle
      }
    captureLifecycle?.stop(reason: sessionReason)
    captureState = captureLifecycle?.state ?? .disabled
  }

  /// Slice 07 — quit path. Finalizes the active video chunk and emits
  /// `session_end_marker` with reason `.quit` before the app terminates.
  /// Renovated from Omi's `RewindShutdownFlush` + `OmiApp.applicationWillTerminate`.
  @discardableResult
  func requestQuit() -> Bool {
    do {
      try coachingWindow.handle(.quit)
      coachingState = coachingWindow.state
    } catch {
      status = "Intentive could not durably end Coaching before quitting: \(error.localizedDescription)"
      objectWillChange.send()
      return false
    }
    meetingObserver.stop()
    captureState = captureLifecycle?.state ?? .disabled
    publicReleaseOperations.shutdown()
    #if DEBUG
    automationBridge?.stop()
    #endif
    return true
  }

  func restoreRuntimeSession() async {
    status = "Restoring Runtime session..."
    let state = await runtimeSession.restoreAndConnect()
    applyRuntimeState(state)
    reconcileCoachingEligibility(startReason: coachingLaunchReason)
  }

  func signInAndConnectRuntime() async {
    guard composition.activeSystemBoundaries.contains(.network) else {
      status = "Runtime network is disabled for this launch"
      return
    }
    status = "Connecting Runtime..."
    let state = await runtimeSession.signInAndConnect()
    applyRuntimeState(state)
    reconcileCoachingEligibility(startReason: .signIn)
  }

  func cancelSignIn() {
    runtimeSession.cancelSignIn()
    applyRuntimeState(.signedOut)
    status = "Sign in cancelled"
  }

  func captureCurrentScreen() async {
    guard composition.activeSystemBoundaries.contains(.capture) else {
      status = "Capture is disabled for this launch"
      return
    }
    guard compilerSettings.captureEnabled else {
      status = "Screen Memory is off"
      return
    }
    guard refreshScreenRecordingPermissionForCapture() else { return }

    status = "Capturing active window..."
    do {
      let events = try await capture.captureOnce(from: captureSource)
      status = perceptionCaptureStatus(eventCount: events.count)
      objectWillChange.send()
    } catch {
      status = "Capture failed: \(error.localizedDescription)"
    }
  }

  func toggleCapture() {
    guard composition.activeSystemBoundaries.contains(.capture) else {
      captureState = .disabled
      status = "Capture is disabled for this launch"
      return
    }
    setCaptureEnabled(!compilerSettings.captureEnabled)
  }

  func openFloatingBar() {
    floatingBarManager.showComposer()
    status = "Floating bar open"
  }

  func openSetup() {
    selected = .privacy
    status = "Desktop setup"
  }

  func persistSelectedUtilitySection(_ section: DesktopSection) {
    utilitySettings.selectedSection = section.utilitySection
    persistUtilitySettings()
  }

  func setLaunchAtLogin(_ enabled: Bool) {
    guard composition.activeSystemBoundaries.contains(.capture) else {
      status = "Launch at login is unavailable in this deterministic launch"
      return
    }
    // Login-at-login runs the app headless: the bundled LaunchAgent passes
    // `--background` (which `SMAppService.mainApp` cannot do) so the delegate
    // stays menu-bar-only. Only the registration mechanism changes; the
    // `launchAtLogin` toggle contract is unchanged. See ADR 0011.
    let loginAgent = SMAppService.agent(plistName: "com.heyintentive.desktop.login.plist")
    do {
      if enabled {
        try loginAgent.register()
      } else {
        try loginAgent.unregister()
      }
    } catch {
      status = "Launch at login could not be changed: \(error.localizedDescription)"
      return
    }
    utilitySettings.launchAtLogin = enabled
    persistUtilitySettings()
    status = enabled ? "Launch at login enabled" : "Launch at login disabled"
  }

  func setAnalyticsEnabled(_ enabled: Bool) {
    utilitySettings.analyticsEnabled = enabled
    persistUtilitySettings()
    publicReleaseOperations.setAnalyticsEnabled(enabled)
    status = enabled ? "Anonymous product analytics enabled" : "Product analytics disabled"
  }

  func setFloatingBarShortcut(_ shortcut: String) {
    utilitySettings.floatingBarShortcut = shortcut
    persistUtilitySettings()
    floatingBarManager.setShortcutPreset(shortcut)
    status = "Floating Bar shortcut saved"
  }

  func setSystemAudioMode(_ mode: SystemAudioCaptureMode) {
    utilitySettings.systemAudioMode = mode
    SystemAudioCaptureSettings.shared.mode = mode
    persistUtilitySettings()
    reconcileAmbientAudioCapture()
    status = "System audio preference saved"
  }

  func setStoreRecordings(_ enabled: Bool) {
    utilitySettings.storeRecordings = enabled
    persistUtilitySettings()
    status = enabled ? "Future audio recordings will be stored locally" : "Future audio recordings will not be stored"
  }

  func setAutomaticUpdateChecks(_ enabled: Bool) {
    utilitySettings.automaticallyChecksForUpdates = enabled
    if !enabled { utilitySettings.automaticallyDownloadsUpdates = false }
    persistUtilitySettings()
    publicReleaseOperations.setAutomaticUpdatePreferences(
      checks: enabled, downloads: utilitySettings.automaticallyDownloadsUpdates)
  }

  func setAutomaticUpdateDownloads(_ enabled: Bool) {
    utilitySettings.automaticallyDownloadsUpdates = enabled
    if enabled { utilitySettings.automaticallyChecksForUpdates = true }
    persistUtilitySettings()
    publicReleaseOperations.setAutomaticUpdatePreferences(
      checks: utilitySettings.automaticallyChecksForUpdates, downloads: enabled)
  }

  func setRetentionDays(_ days: Int) {
    setOnboardingRetentionDays(days)
    utilitySettings.retentionDays = days
    persistUtilitySettings()
  }

  func exportDiagnostics() {
    let destination = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
      ?? launchConfiguration.profileRoot
    do {
      let export = try publicReleaseOperations.exportDiagnostics(to: destination)
      NSWorkspace.shared.activateFileViewerSelecting([export])
      status = "Diagnostics exported"
    } catch {
      status = "Diagnostics export failed: \(error.localizedDescription)"
    }
  }

  func clearDiagnostics() {
    do {
      try publicReleaseOperations.clearDiagnostics()
      status = "Diagnostics cleared"
    } catch {
      status = "Diagnostics could not be cleared: \(error.localizedDescription)"
    }
  }

  var accountEmail: String? { runtimeSession.accountState?.email }
  var passiveAudioRunning: Bool { passiveAudioState.isRecording }

  func submitIssueReport(message: String, name: String, email: String) throws {
    try publicReleaseOperations.submitUserReport(message: message, name: name, email: email)
  }

  func saveIssueDiagnostics(to destination: URL) throws -> URL {
    try publicReleaseOperations.exportDiagnostics(to: destination)
  }

  func checkForUpdates() {
    guard composition.activeSystemBoundaries.contains(.updates) else {
      status = "Updates are disabled for this deterministic launch"
      return
    }
    #if DEBUG
    automationManualUpdateChecks += 1
    #endif
    publicReleaseOperations.checkForUpdates()
    status = "Checking for updates"
  }

  func installDownloadedUpdate() {
    publicReleaseOperations.resumeDeferredInstall()
    status = "Installing update"
  }

  func clearLocalData() {
    guard let archive = screenMemory.activeArchive else {
      status = "No local Screen Memory archive is mounted"
      return
    }
    Task { @MainActor [weak self] in
      do {
        _ = try await archive.clearAll()
        self?.refreshScreenMemorySearch()
        self?.status = "Local Screen Memory cleared"
      } catch {
        self?.status = "Clear data failed: \(error.localizedDescription)"
      }
    }
  }

  private func persistUtilitySettings() {
    do { try utilitySettingsCoordinator.update(utilitySettings) } catch {
      status = "Utility settings save failed: \(error.localizedDescription)"
    }
  }

  func presentOnboarding() {
    refreshDesktopPermissions()
    showOnboarding = true
  }

  func finishOnboardingLater() {
    showOnboarding = false
    status = "Desktop setup can be resumed from Setup"
  }

  func finishOnboarding() {
    guard onboardingRequirements.isComplete else {
      status = "Every required setup step and live permission must be complete"
      return
    }
    onboardingProgress = onboardingProgress.completingOnboarding()
    do {
      try onboardingStore.save(onboardingProgress)
    } catch {
      status = error.localizedDescription
      return
    }
    showOnboarding = false
    status = "Desktop setup complete"
    reconcileCoachingEligibility(startReason: .onboardingCompleted)
    Task { await performCaptureLaunchReconciliation() }
  }

  func markOnboardingStepReviewed(_ step: DesktopOnboardingStep) {
    onboardingProgress = onboardingProgress.completing(step)
    do {
      try onboardingStore.save(onboardingProgress)
    } catch {
      status = error.localizedDescription
    }
  }

  /// Menu-bar action: clear onboarding progress and reopen the setup flow.
  func resetOnboarding() {
    onboardingProgress = DesktopOnboardingProgress()
    do {
      try onboardingStore.save(onboardingProgress)
    } catch {
      status = error.localizedDescription
    }
    refreshDesktopPermissions()
    showOnboarding = true
    NSApp.activate(ignoringOtherApps: true)
    status = "Onboarding reset"
  }

  /// Menu-bar action: disconnect the Runtime Bridge and sign out locally.
  func signOut() {
    do {
      try coachingWindow.handle(.signOut)
      coachingState = coachingWindow.state
    } catch {
      status = "Coaching Window could not end: \(error.localizedDescription)"
      return
    }
    Task { @MainActor [weak self] in
      guard let self else { return }
      let state = await runtimeSession.signOut()
      runtimeRestoreAttempted = false
      applyRuntimeState(state)
      if state == .signedOut { status = "Signed out" }
      objectWillChange.send()
    }
  }

  func requestOnboardingScreenRecordingPermission() {
    requestScreenRecordingPermission()
  }

  func openOnboardingScreenRecordingSettings() {
    openScreenRecordingSettings()
  }

  func decideScreenRecording(_ decision: DesktopPermissionDecision) {
    onboardingProgress = onboardingProgress.decidingScreenRecording(decision)
    persistOnboardingProgress()
  }

  func decideAudio(_ decision: DesktopPermissionDecision) {
    onboardingProgress = onboardingProgress.decidingAudio(decision)
    if decision != .granted { setAmbientAudioCaptureEnabled(false) }
    persistOnboardingProgress()
  }

  private func persistOnboardingProgress() {
    do { try onboardingStore.save(onboardingProgress) } catch {
      status = error.localizedDescription
    }
  }

  func requestMicrophonePermission() async {
    microphonePermissionStatus = await microphonePermissionGateway.requestAccess()
    if microphonePermissionStatus.isGranted {
      unavailableRequiredAudioSources.remove(.microphone)
    }
    status =
      microphonePermissionStatus.isGranted
      ? "Microphone permission granted"
      : "Microphone permission required"
    decideAudio(microphonePermissionStatus.isGranted ? .granted : .denied)
    reconcileCoachingEligibility(startReason: .permissionRestored)
  }

  func openMicrophoneSettings() {
    microphonePermissionGateway.openMicrophoneSettings()
    status = "Opened Microphone settings"
  }

  func refreshOnboardingPermissions() {
    #if DEBUG
    if ProcessInfo.processInfo.environment["INTENTIVE_ACCEPTANCE_PROFILE_ROOT"] != nil {
      screenRecordingPermissionGranted = composition.permissions.screenRecording == .granted
      microphonePermissionStatus = Self.microphonePermissionStatus(
        from: composition.permissions.microphone)
      accessibilityPermissionGranted = true
      reconcileCoachingEligibility(startReason: .permissionRestored)
      return
    }
    #endif
    _ = reattestCoachingEligibilityFromSystem(allowRequiredAudioRetry: true)
  }

  func setAccessibilityPermissionGranted(_ granted: Bool) {
    accessibilityPermissionGranted = granted
    status = granted ? "Accessibility permission granted" : "Accessibility permission required"
    reconcileCoachingEligibility(startReason: .permissionRestored)
  }

  func setOnboardingRetentionDays(_ days: Int) {
    guard let period = ScreenMemoryRetentionPeriod(rawValue: days) else { return }
    onboardingRetentionPeriod = period
    compiler.update(retentionPeriod: period)
    let userID = runtimeSession.accountState?.userId ?? DesktopLocalProfile.anonymousUserID
    do {
      try UserDefaultsScreenMemoryRetentionPersistence(userID: userID).saveRetentionPeriod(period)
      if let archive = screenMemory.activeArchive {
        Task { @MainActor [weak self] in
          do { _ = try await archive.applyRetentionPolicy(period) } catch {
            self?.status = "Retention enforcement failed: \(error.localizedDescription)"
          }
        }
      }
    } catch {
      status = "Retention save failed: \(error.localizedDescription)"
    }
  }

  func refreshDesktopPermissions() {
    #if DEBUG
    if ProcessInfo.processInfo.environment["INTENTIVE_ACCEPTANCE_PROFILE_ROOT"] != nil {
      screenRecordingPermissionGranted = composition.permissions.screenRecording == .granted
      microphonePermissionStatus = Self.microphonePermissionStatus(
        from: composition.permissions.microphone)
      accessibilityPermissionGranted = true
      reconcileCoachingEligibility(startReason: .permissionRestored)
      return
    }
    #endif
    _ = reattestCoachingEligibilityFromSystem(allowRequiredAudioRetry: true)
  }

  /// Reattests every required macOS grant for the process-wide Coaching Window,
  /// independent of whether setup is currently visible. App activation and
  /// permission-shaped sensor failures feed this path so an external TCC
  /// revocation reaches the coordinator before any source can keep sensing.
  func refreshCoachingPermissionsFromSystem(allowRequiredAudioRetry: Bool = false) {
    #if DEBUG
    if ProcessInfo.processInfo.environment["INTENTIVE_ACCEPTANCE_PROFILE_ROOT"] != nil {
      return
    }
    #endif
    _ = reattestCoachingEligibilityFromSystem(
      allowRequiredAudioRetry: allowRequiredAudioRetry
    )
  }

  /// Reads every permission API that macOS exposes synchronously. This is the
  /// attestation provider owned by `DesktopCoachingWindowCoordinator`; callers
  /// must not use the cached UI fields as live authorization.
  private func readLiveCoachingEligibility() -> DesktopCoachingEligibility {
    #if DEBUG
    if ProcessInfo.processInfo.environment["INTENTIVE_ACCEPTANCE_PROFILE_ROOT"] != nil {
      return coachingEligibility
    }
    #endif
    screenRecordingPermissionGranted = permissionGateway.hasScreenRecordingPermission()
    microphonePermissionStatus = microphonePermissionGateway.authorizationStatus()
    accessibilityPermissionGranted = AXIsProcessTrusted()
    return coachingEligibility
  }

  /// Used both by app activation and by every active screen-capture cadence.
  /// A false result means the same tick that observed a revoked grant has
  /// already synchronously stopped all Coaching Window perception.
  private func reattestCoachingEligibilityFromSystem(
    allowRequiredAudioRetry: Bool = false
  ) -> Bool {
    do {
      if allowRequiredAudioRetry {
        // Core Audio taps expose authorization only by attempting capture. A
        // return from System Settings, wake, or unlock permits one fresh
        // attempt; ordinary cadence and failure callbacks cannot erase the
        // prior failed attestation and accidentally restart sensing.
        unavailableRequiredAudioSources.removeAll()
      }
      return try coachingWindow.reattestEligibility()
    } catch {
      status = "Coaching permission attestation failed: \(error.localizedDescription)"
      return false
    }
  }

  private func requiredAudioSourceIsAvailable(_ source: PassiveAudioSource) -> Bool {
    !unavailableRequiredAudioSources.contains(source)
  }

  private func handleRequiredAudioSourceUnavailable(_ source: PassiveAudioSource) {
    unavailableRequiredAudioSources.insert(source)
    reconcileCoachingEligibility(startReason: .permissionRestored)
  }

  func openFloatingBarFromOnboarding() {
    openFloatingBar()
  }

  func triggerEffect() {
    let message = CompanionMessage(
      messageId: "pmb-\(UUID().uuidString)",
      windowId: coachingState.windowId,
      body: "Take a quick reset before the next desktop phase.",
      emittedAt: Date().protocolTimestamp,
      viaPostMessageBack: true
    )
    deliverEffect(
      message, runtimeClient: runtime, statusMessage: "Effect Runner delivered a local nudge")
  }

  #if DEBUG
  func acceptanceActivateMeetingAudio() {
    passiveAudioCoordinator.setMeetingActive(true)
  }

  func acceptanceEmitMicrophonePCM() {
    acceptanceMicrophoneSource.emit(Data(repeating: 1, count: 16_000 * 2 * 4))
  }

  func acceptanceCaptureSleep() { captureLifecycle?.receiveSystemEvent(.systemSleep) }
  func acceptanceCaptureWake() { captureLifecycle?.receiveSystemEvent(.systemWake) }
  func acceptanceCaptureDisplayChange() { captureLifecycle?.receiveSystemEvent(.displayChange) }

  /// Prove the Rewind journey (search, open, scrub, play/pause render, OCR
  /// display, deletion) against the exact `ScreenMemoryTimeline` backend a viewer
  /// would drive. The main window is intentionally utility-only, so this exercises
  /// the same seam the `ScreenMemoryAccessibilityID`-addressed headless smoke uses
  /// over the seeded fixture, rather than a viewer we do not ship.
  func acceptanceRunRewindSmoke() async {
    automationRewindSmoke = [:]
    automationRewindSmokeDetails = [:]
    guard let archive = screenMemory.activeArchive else {
      automationRewindSmokeDetails["rewind"] = "no signed-in archive"
      return
    }
    let now = Date()
    let timeline = ScreenMemoryTimeline(archive: archive, selectedDate: now)
    let smoke = ScreenMemoryTimelineSmoke(timeline: timeline)

    await smoke.launch(on: now)
    let launched = smoke.snapshot()
    automationRewindSmoke["rewind-open"] = !launched.frames.isEmpty
    automationRewindSmokeDetails["rewind-open"] =
      "frames=\(launched.frames.count), apps=\(launched.appFilterIdentifiers.count)"

    // Search a term indexed in FTS (the Safari seed's window title), then open a
    // matching frame so OCR-highlight identifiers can be recorded as evidence.
    await smoke.typeSearch("Invoice")
    let searched = smoke.snapshot()
    automationRewindSmoke["rewind-search"] =
      !searched.frames.isEmpty && searched.searchQuery == "Invoice"
    automationRewindSmokeDetails["rewind-search"] = "matches=\(searched.frames.count)"
    if let firstMatch = searched.frames.first?.identifier {
      _ = smoke.tapFrame(firstMatch)
    }
    automationRewindSmokeDetails["rewind-ocr-highlights"] =
      "count=\(smoke.snapshot().ocrHighlightIdentifiers.count)"
    await smoke.typeSearch("")

    // Filter by the first app and open its first frame.
    let dayFrames = smoke.snapshot()
    if let firstApp = dayFrames.appFilterIdentifiers.first {
      await smoke.tapAppFilter(firstApp)
    }
    let filtered = smoke.snapshot()
    var opened = false
    if let firstFrame = filtered.frames.first?.identifier {
      opened = smoke.tapFrame(firstFrame)
    }
    automationRewindSmoke["rewind-filter-open"] =
      opened && smoke.snapshot().selectedFrameIdentifier != nil
    await smoke.tapAppFilter(nil)

    // Scrub forward and back changes the selected frame.
    let beforeScrub = smoke.snapshot().selectedFrameIdentifier
    smoke.tapScrubForward()
    let afterForward = smoke.snapshot().selectedFrameIdentifier
    smoke.tapScrubBackward()
    let afterBack = smoke.snapshot().selectedFrameIdentifier
    automationRewindSmoke["rewind-scrub"] =
      beforeScrub != nil && afterForward != nil
      && (afterForward != beforeScrub || afterBack == beforeScrub)
    automationRewindSmokeDetails["rewind-scrub"] =
      "before=\(beforeScrub ?? "nil"), fwd=\(afterForward ?? "nil"), back=\(afterBack ?? "nil")"

    // Render the current frame — the play/pause surface produces real bytes and is
    // the target a viewer overlays OCR highlights onto.
    let frameBytes = await smoke.renderCurrentFrame()
    automationRewindSmoke["rewind-render-frame"] = (frameBytes?.isEmpty == false)

    // Delete the current frame through the timeline's real deletion path.
    let framesBeforeDelete = smoke.snapshot().frames.count
    let deletion = await smoke.tapDeleteCurrentFrame(confirmChunkDeletion: true)
    let framesAfterDelete = smoke.snapshot().frames.count
    automationRewindSmoke["rewind-delete"] =
      deletion != nil && framesAfterDelete < framesBeforeDelete
    automationRewindSmokeDetails["rewind-delete"] =
      "before=\(framesBeforeDelete), after=\(framesAfterDelete)"

    // Restore the timeline the utility surface reads so later steps see truth.
    rebuildScreenMemoryTimeline()
  }

  func acceptanceRunExpandedMatrix() async {
    await Task { @MainActor [weak self] in
      guard let self else { return }
      automationExpandedMatrix = [:]
      automationExpandedMatrixDetails = [:]

      setCaptureEnabled(true)
      setAmbientAudioCaptureEnabled(true)
      try? await Task.sleep(nanoseconds: 2_000_000_000)
      automationExpandedMatrix["capture-enable-first-frame"] = captureState.isRunning
        && (captureLifecycle?.loop.state.capturedFrameCount ?? 0) > 0
      automationExpandedMatrixDetails["capture-enable-first-frame"] =
        "state=\(captureState), frames=\(captureLifecycle?.loop.state.capturedFrameCount ?? 0), "
        + "skip=\(captureLifecycle?.loop.state.lastSkipReason ?? "none"), "
        + "error=\(captureLifecycle?.loop.state.lastError ?? "none")"
      if case .running(let microphone, _) = passiveAudioState {
        automationExpandedMatrix["audio-microphone-running"] = microphone
      }
      automationExpandedMatrixDetails["audio-microphone-running"] = String(
        describing: passiveAudioState)

      passiveAudioCoordinator.setMeetingActive(true)
      try? await Task.sleep(nanoseconds: 500_000_000)
      if case .running(_, let systemAudio) = passiveAudioState {
        automationExpandedMatrix["audio-meeting-system-tap"] = systemAudio
      }
      let pcmBefore = acceptanceMicrophoneSource.emittedBytes
      acceptanceEmitMicrophonePCM()
      automationExpandedMatrix["audio-vad-ingestion"] = acceptanceMicrophoneSource.emittedBytes > pcmBefore
      let permissionLossWindowId = coachingState.windowId
      acceptanceDegradeMicrophonePermission()
      try? await Task.sleep(nanoseconds: 500_000_000)
      automationExpandedMatrix["audio-permission-degradation"] =
        coachingState.windowId == nil
        && captureLifecycle?.loop.state.isRunning == false
        && !passiveAudioState.isRecording
      acceptanceRestoreMicrophonePermission()
      automationExpandedMatrix["coaching-permission-restoration-new-window"] =
        coachingState.windowId != nil
        && coachingState.windowId != permissionLossWindowId

      let lockWindowId = coachingState.windowId
      try? coachingWindow.handle(.screenLocked)
      coachingState = coachingWindow.state
      let sensorsStoppedWhileLocked =
        captureLifecycle?.loop.state.isRunning == false && !passiveAudioState.isRecording
      automationExpandedMatrix["coaching-lock-stops-sensors"] =
        coachingState.windowId == lockWindowId && sensorsStoppedWhileLocked
      try? coachingWindow.handle(.screenUnlocked)
      coachingState = coachingWindow.state
      automationExpandedMatrix["coaching-unlock-same-window"] =
        coachingState.windowId == lockWindowId

      let sleepingWindowId = coachingState.windowId
      try? coachingWindow.handle(.systemSleep)
      coachingState = coachingWindow.state
      automationExpandedMatrix["capture-sleep"] =
        coachingState.windowId == nil
        && captureLifecycle?.loop.state.isRunning == false
        && !passiveAudioState.isRecording
      try? coachingWindow.handle(.systemWake)
      coachingState = coachingWindow.state
      try? await Task.sleep(nanoseconds: 2_000_000_000)
      automationExpandedMatrix["capture-wake"] =
        coachingState.windowId != nil
        && coachingState.windowId != sleepingWindowId
        && captureLifecycle?.loop.state.isRunning == true

      let prePauseWindowId = coachingState.windowId
      pauseCoaching()
      automationExpandedMatrix["coaching-pause-stops-sensors"] =
        coachingState == .paused
        && captureLifecycle?.loop.state.isRunning == false
        && !passiveAudioState.isRecording
      resumeCoaching()
      try? await Task.sleep(nanoseconds: 500_000_000)
      automationExpandedMatrix["coaching-resume-new-window"] =
        coachingState.windowId != nil && coachingState.windowId != prePauseWindowId

      floatingBarManager.hide()
      let effectsBeforeSuppression = effectLog.count
      let nilWindowMessage = CompanionMessage(
        messageId: "acceptance-windowless-\(UUID().uuidString)",
        body: "Windowless acceptance message",
        emittedAt: Date().protocolTimestamp,
        viaPostMessageBack: true
      )
      deliverEffect(
        nilWindowMessage,
        runtimeClient: alreadyAcknowledgedRuntimeClient,
        statusMessage: "Windowless message must remain suppressed"
      )
      let staleWindowMessage = CompanionMessage(
        messageId: "acceptance-stale-\(UUID().uuidString)",
        windowId: "00000000-0000-4000-8000-000000000001",
        body: "Stale acceptance message",
        emittedAt: Date().protocolTimestamp,
        viaPostMessageBack: true
      )
      deliverEffect(
        staleWindowMessage,
        runtimeClient: alreadyAcknowledgedRuntimeClient,
        statusMessage: "Stale message must remain suppressed"
      )
      automationExpandedMatrix["coaching-stale-window-suppressed"] =
        !floatingBarManager.isVisible && effectLog.count == effectsBeforeSuppression
      if let activeWindowId = coachingState.windowId {
        let matchingWindowMessage = CompanionMessage(
          messageId: "acceptance-matching-\(UUID().uuidString)",
          windowId: activeWindowId,
          body: "Matching acceptance message",
          emittedAt: Date().protocolTimestamp,
          viaPostMessageBack: true
        )
        deliverEffect(
          matchingWindowMessage,
          runtimeClient: alreadyAcknowledgedRuntimeClient,
          statusMessage: "Matching Coaching message shown"
        )
      }
      automationExpandedMatrix["coaching-matching-window-shown"] =
        floatingBarManager.isVisible && effectLog.count == effectsBeforeSuppression + 1

      captureLifecycle?.receiveSystemEvent(.displayChange)
      let displayDeadline = Date().addingTimeInterval(30)
      while captureLifecycle?.loop.state.isRunning != true && Date() < displayDeadline {
        try? await Task.sleep(nanoseconds: 250_000_000)
      }
      automationExpandedMatrix["capture-display-change"] =
        captureLifecycle?.loop.state.isRunning == true

      // Deterministically drive one structured capture through the real
      // compile→publish→ingress path before observing the outbox. Relying on the
      // ambient loop's own frame does not work here: its acceptance fixture is a
      // static image whose stateful dHash dedups after the first store, and any
      // structured record it did publish earlier was already drained by the
      // preceding ack-fixture steps — so no pending structured record remains to
      // observe. A direct `accept` runs the same `SearchableScreenRecordAnalyzer`
      // that builds the app_name/window_title/ocr_text signals a live capture
      // ships, and (there being no auto-ack in the assembled build) the event
      // stays in `pendingIngress` for the check.
      _ = try? capture.accept(
        frame: CapturedFrame(
          id: UUID().uuidString,
          capturedAt: Date().protocolTimestamp,
          appBundleID: "com.heyintentive.acceptance.fixture",
          appName: "Intentive Acceptance",
          windowTitle: "Structured search ingress fixture",
          ocrText: "Structured search ingress fixture"))
      let structuredPending = ((try? screenMemory.pendingIngress(limit: 1_000)) ?? [])
      let hadStructuredScreenIngress = structuredPending.contains { item in
          guard case .perceptionEvent(let event) = item,
            event.artifactType == .searchableScreenRecord
          else { return false }
          return event.signals["app_name"] != nil
            && event.signals["window_title"] != nil
            && event.signals["ocr_text"] != nil
        }
      automationExpandedMatrix["runtime-structured-search-ingress"] = hadStructuredScreenIngress
      let structuredSearchableCount = structuredPending.filter {
        if case .perceptionEvent(let event) = $0 {
          return event.artifactType == .searchableScreenRecord
        }
        return false
      }.count
      automationExpandedMatrixDetails["runtime-structured-search-ingress"] =
        "pending=\(structuredPending.count), searchableScreenRecord=\(structuredSearchableCount)"

      if let archive = screenMemory.activeArchive {
        do {
          // Screen Memory dHash deduplication is intentionally stateful. Reset
          // the acceptance-only archive baseline so this expired record is
          // guaranteed to be inserted before exercising the real policy.
          _ = try await archive.clearAll()
          _ = try await archive.ingest(
            ScreenMemoryCaptureInput(
              userID: archive.userID,
              imageData: try acceptanceFixtureImage(
                title: "Expanded retention fixture",
                detail: "This AX-triggered record must expire",
                color: .systemOrange,
                variant: 100
              ),
              capturedAt: Date().addingTimeInterval(-5 * 24 * 60 * 60).protocolTimestamp,
              appBundleID: "com.heyintentive.acceptance.expanded-expired",
              appName: "Expanded Expired Fixture",
              windowTitle: "Expanded retention fixture"
            ))
          try await archive.finalizeActiveVideoChunk()
          let result = try await archive.applyRetentionPolicy(.threeDays)
          automationRetentionExpiredCount = result.recordIDs.count
          let reasons: [PerceptionTombstoneReason] =
            ((try? screenMemory.pendingIngress(limit: 1_000)) ?? []).compactMap { item in
            guard case .perceptionTombstone(let tombstone) = item else { return nil }
            return tombstone.reason
            }
          automationExpandedMatrix["runtime-retention-expiry"] = !result.recordIDs.isEmpty
            && reasons.contains(.retentionExpiry)
        } catch {
          automationExpandedMatrix["runtime-retention-expiry"] = false
          automationExpandedMatrixDetails["runtime-retention-expiry"] = error.localizedDescription
        }
      }
      acceptanceEnqueueTombstoneOrderingFixture()
      let kinds = ((try? screenMemory.pendingIngress(limit: 1_000)) ?? []).map(\.kind)
      if let event = kinds.lastIndex(of: .perceptionEvent),
        let tombstone = kinds.lastIndex(of: .perceptionTombstone) {
        automationExpandedMatrix["runtime-tombstone-ordering"] = event < tombstone
      }
      let markersBefore = kinds.filter { $0 == .sessionEndMarker }.count
      acceptanceEnqueueDurableTerminationMarkers()
      let markersAfter = ((try? screenMemory.pendingIngress(limit: 1_000)) ?? [])
        .filter { $0.kind == .sessionEndMarker }.count
      automationExpandedMatrix["runtime-durable-quit-crash-markers"] = markersAfter == markersBefore + 2
    }.value
  }

  func acceptanceDegradeMicrophonePermission() {
    microphonePermissionStatus = .denied
    reconcileCoachingEligibility(startReason: .permissionRestored)
  }

  func acceptanceRestoreMicrophonePermission() {
    microphonePermissionStatus = .granted
    reconcileCoachingEligibility(startReason: .permissionRestored)
  }

  func acceptanceApplyRetentionExpiry() {
    guard let archive = screenMemory.activeArchive else { return }
    Task { @MainActor [weak self] in
      guard let self else { return }
      do {
        let result = try await archive.applyRetentionPolicy(.threeDays)
        automationRetentionExpiredCount = result.recordIDs.count
        rebuildScreenMemoryTimeline()
      } catch {
        status = "Acceptance retention failed: \(error.localizedDescription)"
      }
    }
  }

  func acceptanceEnqueueDurableTerminationMarkers() {
    for reason in [SessionEndReason.quit, .crash] {
      let marker = SessionEndMarker(
        markerId: UUID().uuidString,
        sessionId: UUID().uuidString,
        endedAt: Date().protocolTimestamp,
        reason: reason
      )
      try? screenMemory.enqueueSessionEndMarker(marker)
    }
  }

  func acceptanceEnqueueTombstoneOrderingFixture() {
    let eventID = UUID().uuidString
    let timestamp = Date().protocolTimestamp
    let event = PerceptionEvent(
      eventId: eventID,
      capturedAt: timestamp,
      periodStart: timestamp,
      periodEnd: timestamp,
      artifactType: .searchableScreenRecord,
      summary: "Acceptance tombstone ordering fixture",
      sensitivityLabel: .normal,
      retentionClass: ScreenMemoryRetentionPeriod.threeDays.retentionClass,
      confidence: 1,
      expiresAt: Date().addingTimeInterval(3 * 24 * 60 * 60).protocolTimestamp,
      localRecordRef: UUID().uuidString
    )
    let tombstone = PerceptionTombstone(
      tombstoneId: UUID().uuidString,
      reason: .manualDelete,
      eventRefs: [eventID],
      emittedAt: timestamp
    )
    try? screenMemory.enqueuePerceptionEvent(event)
    try? screenMemory.enqueuePerceptionTombstone(tombstone)
  }

  func acceptanceOnboardingDenied() { decideScreenRecording(.denied) }
  func acceptanceOnboardingDeferred() { decideAudio(.deferred) }
  func acceptanceOnboardingGranted() {
    decideScreenRecording(.granted)
    decideAudio(.granted)
  }
  func acceptanceOnboardingResume() { resetOnboarding() }
  #endif

  func setCaptureEnabled(_ enabled: Bool) {
    var settings = compilerSettings
    settings.captureEnabled = enabled
    applyCompilerSettings(settings)
    utilitySettings.screenCaptureEnabled = enabled
    persistUtilitySettings()

    if enabled {
      captureLifecycle?.setUserEnabled(true)
      status = "Screen Memory is on"
    } else {
      // Slice 07: route the user-initiated stop through the lifecycle controller
      // so it finalizes the active chunk and emits `session_end_marker`
      // (reason `.userToggle`). When the controller is absent (capture boundary
      // disabled for this launch) fall back to a plain loop stop.
      captureLifecycle?.setUserEnabled(false)
      status = "Screen Memory is off"
    }
    reconcileAmbientAudioCapture()
  }

  func setAmbientAudioCaptureEnabled(_ enabled: Bool) {
    var settings = compilerSettings
    settings.ambientAudioCaptureEnabled = enabled
    applyCompilerSettings(settings)
    utilitySettings.passiveAudioEnabled = enabled
    persistUtilitySettings()
    reconcileAmbientAudioCapture()
    status = enabled ? "Ambient audio capture is on" : "Ambient audio capture is off"
  }

  private func reconcileAmbientAudioCapture() {
    guard case .active = coachingState else {
      passiveAudioCoordinator.setUserEnabled(false)
      return
    }
    passiveAudioCoordinator.setUserEnabled(
      PassiveAudioCaptureEligibility.isEnabled(
        authenticated: isOnboardingAuthenticated,
        ambientAudioCaptureEnabled: compilerSettings.ambientAudioCaptureEnabled
      )
    )
  }

  private func reconcileCoachingEligibility(startReason: CoachingWindowStartReason) {
    let priorState = coachingWindow.state
    do {
      try coachingWindow.handle(
        .eligibilityChanged(
          coachingEligibility,
          eligibleStartReason: startReason
        )
      )
      coachingState = coachingWindow.state
      if priorState.windowId != nil, coachingState == .inactive(.ineligible) {
        showOnboarding = true
        status = "A required permission was removed. Restore it to resume Coaching."
      } else if
        showOnboarding,
        onboardingProgress.completed,
        DesktopOnboardingStep.allCases.allSatisfy(onboardingProgress.isReviewed),
        coachingState.windowId != nil
      {
        showOnboarding = false
        status = "Required permissions restored"
      }
    } catch {
      status = "Coaching eligibility failed: \(error.localizedDescription)"
    }
  }

  private func handleAmbientAudioEvent(_ event: AmbientAudioCaptureLoopEvent) {
    switch event {
    case .captured(let eventPublished):
      status =
        eventPublished
        ? "Ambient audio summary captured"
        : "Ambient audio capture produced no summary"
    case .skipped:
      break
    case .failed(let reason):
      status = "Ambient audio capture failed: \(reason)"
    }
  }

  func updateExcludedAppsText(_ text: String) {
    excludedAppsText = text
    do {
      try privacyPolicy.replaceExcludedDisplayNames(Self.parseExcludedApps(text))
      refreshPrivacySnapshot()
    } catch {
      status = "Privacy Zones save failed: \(error.localizedDescription)"
    }
  }

  func excludeApplication(bundleID: String?, displayName: String) {
    do {
      try privacyPolicy.exclude(
        PrivacyZoneApplication(bundleID: bundleID, displayName: displayName)
      )
      refreshPrivacySnapshot()
    } catch {
      status = "Privacy Zones save failed: \(error.localizedDescription)"
    }
  }

  func includeApplication(bundleID: String?, displayName: String) {
    do {
      try privacyPolicy.include(
        PrivacyZoneApplication(bundleID: bundleID, displayName: displayName)
      )
      refreshPrivacySnapshot()
    } catch {
      status = "Privacy Zones save failed: \(error.localizedDescription)"
    }
  }

  func resetExcludedApplications() {
    do {
      try privacyPolicy.resetPrivacyZonesToDefaults()
      refreshPrivacySnapshot()
    } catch {
      status = "Privacy Zones save failed: \(error.localizedDescription)"
    }
  }

  private func refreshPrivacySnapshot() {
    privacySnapshot = privacyPolicy.snapshot
    excludedAppsText = Self.renderExcludedApps(
      Set(privacySnapshot.excludedApplications.map(\.displayName))
    )
  }

  private func applyCompilerSettings(_ settings: CompilerSettings) {
    compilerSettings = settings
    capture.updateCompilerSettings(settings)
    do {
      try settingsStore.save(settings)
    } catch {
      status = "Settings save failed: \(error.localizedDescription)"
    }
  }

  func requestScreenRecordingPermission() {
    let requested = permissionGateway.requestScreenRecordingPermission()
    screenRecordingPermissionGranted = requested || permissionGateway.hasScreenRecordingPermission()
    if screenRecordingPermissionGranted {
      unavailableRequiredAudioSources.remove(.systemAudio)
    }
    status =
      screenRecordingPermissionGranted
      ? "Screen Recording permission granted"
      : "Screen Recording permission required"
    reconcileCoachingEligibility(startReason: .permissionRestored)
  }

  func openScreenRecordingSettings() {
    permissionGateway.openScreenRecordingSettings()
    status = "Opened Screen Recording settings"
  }

  func refreshScreenRecordingPermission() {
    let granted = permissionGateway.hasScreenRecordingPermission()
    screenRecordingPermissionGranted = granted
    if !granted, captureLoop.state.isRunning {
      captureLifecycle?.reconcile()
    }
    status =
      granted ? "Screen Recording permission granted" : "Screen Recording permission required"
    reconcileCoachingEligibility(startReason: .permissionRestored)
  }

  private func refreshScreenRecordingPermissionForCapture() -> Bool {
    let granted = permissionGateway.hasScreenRecordingPermission()
    screenRecordingPermissionGranted = granted
    if !granted {
      captureLifecycle?.reconcile()
      status = "Screen Recording permission required"
    }
    return granted
  }

  private func configureRuntimeSocketCallbacks() {
    _ = runtime
    runtime.onCompanionMessage = { [weak self] companion in
      Task { @MainActor [weak self] in
        self?.handleRuntimeCompanionMessage(companion)
      }
    }
    // A `runtime_ingress_ack` (emitted after the Runtime's ledger+projection
    // commit) is the only signal that deletes a durable outbox row.
    runtime.onIngressAck = { [weak self] ack in
      Task { @MainActor [weak self] in
        #if DEBUG
        if self?.automationDropNextIngressAck == true {
          self?.automationDropNextIngressAck = false
          return
        }
        #endif
        try? self?.publisher.acknowledge(ack)
      }
    }
    runtimeSocket.onMessage = { [weak self] data in
      Task { @MainActor [weak self] in
        self?.handleRuntimeSocketMessage(data)
      }
    }
    runtimeSocket.onClose = { [weak self] error in
      Task { @MainActor [weak self] in
        guard let self else { return }
        let reason = error?.localizedDescription ?? "Runtime connection closed"
        runtimeSession.markRuntimeClosed(reason: reason)
        applyRuntimeState(runtimeSession.state)
      }
    }
  }

  private func handleRuntimeCompanionMessage(_ message: CompanionMessage) {
    // The companion replies in text only; the message renders in the chat
    // surfaces. A Post-Message-Back reply additionally fires a local effect.
    guard message.viaPostMessageBack,
      let windowId = message.windowId,
      coachingState.windowId == windowId
    else { return }
    // RuntimeAdapter deliberately defers window-bound transcript projection
    // until this final MainActor lifecycle check. A stale message therefore
    // cannot appear in an already-open bar while its proactive effect is
    // correctly suppressed.
    messageStore.appendCompanion(message)
    deliverEffect(
      message,
      runner: runtimeEffectRunner,
      statusMessage: "Effect Runner delivered Runtime nudge"
    )
  }

  private func handleRuntimeSocketMessage(_ data: Data) {
    do {
      try runtime.handleSocketEvent(data)
      if runtime.status == .connected {
        runtimeSession.markRuntimeConnected()
      }
      applyRuntimeState(runtimeSession.state)
      floatingBarManager.refreshMessages()
      objectWillChange.send()
    } catch {
      status = "Runtime event failed: \(error.localizedDescription)"
    }
  }

  private func recordCoachingWindowStarted(_ event: CoachingWindowStarted) {
    let startedAt =
      ISO8601DateFormatter.intentiveProtocol.date(from: event.startedAt)
      ?? ISO8601DateFormatter().date(from: event.startedAt)
      ?? Date()
    coachingStartedAtByWindow[event.windowId] = startedAt
    lastCoachingPromptShownAt = nil
    publicReleaseOperations.trackCoachingEvent(
      .coachingWindowStarted,
      properties: ["reason": .string(event.reason.rawValue)]
    )
  }

  private func recordCoachingWindowEnded(_ event: CoachingWindowEnded) {
    var properties: [String: TelemetryValue] = [
      "reason": .string(event.reason.rawValue)
    ]
    if let startedAt = coachingStartedAtByWindow.removeValue(forKey: event.windowId) {
      properties["duration_ms"] = .integer(
        max(0, Int(Date().timeIntervalSince(startedAt) * 1_000))
      )
    }
    publicReleaseOperations.trackCoachingEvent(
      .coachingWindowEnded,
      properties: properties
    )
  }

  private func recordCoachingReply() {
    guard let windowId = coachingState.windowId else { return }
    if let promptAt = lastCoachingPromptShownAt {
      publicReleaseOperations.trackCoachingEvent(
        .coachingReplySent,
        properties: [
          "duration_ms": .integer(max(0, Int(Date().timeIntervalSince(promptAt) * 1_000)))
        ]
      )
    } else {
      publicReleaseOperations.trackCoachingEvent(.coachingReplySent)
    }
    if coachingWindowsWithFirstReply.insert(windowId).inserted {
      var properties: [String: TelemetryValue] = [:]
      if let startedAt = coachingStartedAtByWindow[windowId] {
        properties["duration_ms"] = .integer(
          max(0, Int(Date().timeIntervalSince(startedAt) * 1_000))
        )
      }
      publicReleaseOperations.trackCoachingEvent(
        .coachingFirstReply,
        properties: properties
      )
    }
  }

  private func deliverEffect(
    _ message: CompanionMessage,
    runtimeClient: RuntimeChatClient,
    statusMessage: String
  ) {
    let runner = EffectRunner(
      overlay: FloatingBarOverlaySink(manager: floatingBarManager),
      runtimeClient: runtimeClient,
      activeWindowId: { [weak self] in self?.coachingState.windowId }
    )
    deliverEffect(message, runner: runner, statusMessage: statusMessage)
  }

  private func deliverEffect(
    _ message: CompanionMessage,
    runner: EffectRunner,
    statusMessage: String
  ) {
    do {
      guard try runner.handle(message) else { return }
      effectLog.append("Intentive: \(message.body)")
      lastCoachingPromptShownAt = Date()
      publicReleaseOperations.trackCoachingEvent(
        message.messageId.hasPrefix("opening:")
          ? .coachingOrientationShown
          : .coachingInterventionShown
      )
      status = statusMessage
      objectWillChange.send()
    } catch {
      status = "Effect failed: \(error.localizedDescription)"
    }
  }

  private func applyRuntimeState(_ state: DesktopRuntimeSessionState) {
    runtimeState = state
    let storageStatus = reconfigureScreenMemoryForAuthenticatedUserIfNeeded()
    let flushStatus = flushQueuedPerceptionEventsIfConnected(state)
    try? coachingWindow.handle(.runtimeConnectionChanged(state == .connected))
    coachingState = coachingWindow.state
    reconcileAmbientAudioCapture()
    status = [Self.renderRuntimeState(state), storageStatus, flushStatus]
      .compactMap { $0 }
      .joined(separator: " · ")
    objectWillChange.send()
  }

  private func perceptionCaptureStatus(eventCount: Int) -> String {
    if eventCount == 0 {
      return "No perception events captured"
    }
    return runtime.status == .connected
      ? "Published \(eventCount) perception event(s)"
      : "Queued \(eventCount) perception event(s) for Runtime"
  }

  private func flushQueuedPerceptionEventsIfConnected(_ state: DesktopRuntimeSessionState)
    -> String?
  {
    guard case .connected = state else { return nil }
    do {
      // Redeliver every unacknowledged durable-ingress item (events, tombstones,
      // session-end markers) in enqueue order on the one outbox channel. Rows
      // stay until a `runtime_ingress_ack` deletes them.
      let synced = try publisher.flushPendingIngress()
      return synced > 0 ? "synced \(synced) queued perception update(s)" : nil
    } catch {
      return "perception sync pending: \(error.localizedDescription)"
    }
  }

  private func reconfigureScreenMemoryForAuthenticatedUserIfNeeded() -> String? {
    let userID = runtimeSession.accountState?.userId
    let sanitizedUserID = DesktopLocalProfile.sanitizedUserID(userID)
    guard sanitizedUserID != screenMemoryProfileUserID else { return nil }

    let newScreenMemory = Self.makeScreenMemoryStore(
      userID: userID,
      baseApplicationSupportURL: launchConfiguration.profileRoot
    )
    screenMemory.replace(with: newScreenMemory.store, profileID: sanitizedUserID)
    screenMemoryProfileUserID = sanitizedUserID
    rebuildScreenMemoryTimeline()
    return newScreenMemory.status
  }

  private static func renderRuntimeState(_ state: DesktopRuntimeSessionState) -> String {
    switch state {
    case .signedOut:
      return "Sign in required"
    case .checkingAccount:
      return "Checking account"
    case .registeringDevice:
      return "Registering desktop"
    case .routing:
      return "Fetching Runtime route"
    case .connecting:
      return "Runtime connecting"
    case .connected:
      return "Runtime connected"
    case .gate(let gate):
      return gate == .capturePermissionSetup
        ? "Screen Recording permission required" : "Gate required: \(gate.rawValue)"
    case .retry(let retryAfterSeconds):
      if let retryAfterSeconds {
        return "Runtime unavailable. Retry after \(Int(retryAfterSeconds))s"
      }
      return "Runtime unavailable. Retry shortly"
    case .failed(let message):
      return "Runtime failed: \(message)"
    }
  }

  private static func parseExcludedApps(_ text: String) -> Set<String> {
    Set(
      text.components(separatedBy: CharacterSet(charactersIn: ",;\n"))
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
    )
  }

  private static func renderExcludedApps(_ apps: Set<String>) -> String {
    apps.sorted().joined(separator: ", ")
  }

  private static func makeScreenMemoryStore(
    userID: String?,
    baseApplicationSupportURL: URL
  ) -> (store: ScreenMemoryStore, status: String) {
    guard let userID, !userID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return (InMemoryScreenMemoryStore(), "Sign in to start Screen Memory")
    }
    do {
      let profile = try ScreenMemoryProfile(
        userID: userID,
        rootURL: baseApplicationSupportURL
      )
      let archive = try ScreenMemoryArchive(
        profile: profile,
        imageAnalyzer: OmiScreenMemoryOCRAdapter(),
        videoArchive: try OmiScreenMemoryVideoArchive(profile: profile)
      )
      return (archive, "Local Screen Memory ready")
    } catch {
      return (InMemoryScreenMemoryStore(), "Screen Memory fallback: \(error.localizedDescription)")
    }
  }

  private static func microphonePermissionStatus(
    from state: DesktopPermissionState
  ) -> DesktopMicrophonePermissionStatus {
    switch state {
    case .notDetermined: return .notDetermined
    case .granted: return .granted
    case .denied: return .denied
    case .restricted: return .restricted
    }
  }
}

private enum DesktopRuntimeConfiguration {
  private static let services: DesktopServiceConfiguration = {
    let bundle = Bundle.main
    let installedBundleIDs = [
      "com.heyintentive.desktop",
      "com.heyintentive.desktop.preview",
    ]
    do {
      return try DesktopServiceConfiguration.resolve(
        environment: ProcessInfo.processInfo.environment,
        bundleInfo: bundle.infoDictionary ?? [:],
        isPublicRelease: installedBundleIDs.contains(bundle.bundleIdentifier ?? "")
      )
    } catch {
      fatalError("Invalid Desktop service configuration: \(error)")
    }
  }()

  static var clientVersion: String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
      ?? "desktop-dev"
  }

  static var clientCapabilities: [ClientCapability]? {
    let bundleID = Bundle.main.bundleIdentifier
    let isPreview = bundleID == "com.heyintentive.desktop.preview"
    let isAcceptance =
      ProcessInfo.processInfo.environment["INTENTIVE_ACCEPTANCE_PROFILE_ROOT"] != nil
    let explicitlyEnabled =
      environment("INTENTIVE_DESKTOP_COACHING_V1") == "1"
    return isPreview || isAcceptance || explicitlyEnabled
      ? [.desktopCoachingV1]
      : nil
  }

  static var deviceFingerprint: String {
    let key = "intentive.desktop.deviceFingerprint"
    if let existing = UserDefaults.standard.string(forKey: key), !existing.isEmpty {
      return existing
    }
    let generated = "mac-\(UUID().uuidString)"
    UserDefaults.standard.set(generated, forKey: key)
    return generated
  }

  static func controlPlaneClient() -> ControlPlaneClient {
    ControlPlaneClient(baseURL: controlPlaneBaseURL)
  }

  @MainActor
  static func authProvider() -> AuthAdapter {
    if let token = DesktopServiceConfiguration.releaseAcceptanceToken(
      in: ProcessInfo.processInfo.environment
    ) {
      return DevAuthProvider(token: token)
    }
    if let token = environment("INTENTIVE_DESKTOP_USER_JWT") {
      return DevAuthProvider(token: token)
    }
    return NeonAuthProvider(
      hostedAuthURL: hostedAuthURL,
      callbackScheme: callbackScheme,
      tokenStore: KeychainTokenStore(),
      authSession: ASWebAuthenticationHostedAuthSession(),
      tokenExchangeURL: hostedAuthTokenExchangeURL
    )
  }

  private static var controlPlaneBaseURL: URL {
    services.controlPlaneURL
  }

  private static var hostedAuthURL: URL? {
    services.hostedAuthURL
  }

  private static var hostedAuthTokenExchangeURL: URL? {
    services.authTokenExchangeURL
  }

  private static var callbackScheme: String {
    let bundle = Bundle.main
    let installedBundleIDs = [
      "com.heyintentive.desktop",
      "com.heyintentive.desktop.preview",
    ]
    if !installedBundleIDs.contains(bundle.bundleIdentifier ?? ""),
      let override = environment("INTENTIVE_AUTH_CALLBACK_SCHEME")
    {
      return override
    }
    if
      let urlTypes = bundle.object(forInfoDictionaryKey: "CFBundleURLTypes")
        as? [[String: Any]],
      let schemes = urlTypes.first?["CFBundleURLSchemes"] as? [String],
      let bundledScheme = schemes.first,
      !bundledScheme.isEmpty
    {
      return bundledScheme
    }
    return "intentive-desktop"
  }

  private static func environment(_ key: String) -> String? {
    guard
      let value = ProcessInfo.processInfo.environment[key]?.trimmingCharacters(
        in: .whitespacesAndNewlines),
      !value.isEmpty
    else {
      return nil
    }
    return value
  }
}

struct MainWindowView: View {
  @StateObject private var model: DesktopViewModel
  @StateObject private var presentation: IntentiveDesktopPresentationAdapter
  let composition: DesktopApplicationComposition

  @MainActor
  init(model: DesktopViewModel, composition: DesktopApplicationComposition) {
    _model = StateObject(wrappedValue: model)
    _presentation = StateObject(wrappedValue: IntentiveDesktopPresentationAdapter(model: model))
    self.composition = composition
  }

  var body: some View {
    Group {
      if model.showOnboarding {
        IntentiveMacSetupView(model: presentation)
      } else {
        IntentiveSettingsWindow(model: presentation)
      }
    }
    .task {
      await model.restoreRuntimeSessionIfNeeded()
      await model.performCaptureLaunchReconciliation()
    }
  }
}
