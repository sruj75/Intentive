import IntentiveDesktopCore
import IntentiveDesktopNativeAdapters
import IntentiveDesktopNativeAssets
import ServiceManagement
import SwiftUI

enum DesktopSection: String, CaseIterable, Identifiable {
  case screenMemory = "Screen Memory"
  case privacy = "Privacy"
  case sensing = "Sensing"
  case account = "Account"
  case updates = "Updates"
  case diagnostics = "Diagnostics"

  var id: String { rawValue }

  var symbol: String {
    switch self {
    case .screenMemory: return "clock.arrow.circlepath"
    case .privacy: return "hand.raised"
    case .sensing: return "waveform.and.magnifyingglass"
    case .account: return "person.crop.circle"
    case .updates: return "arrow.triangle.2.circlepath"
    case .diagnostics: return "stethoscope"
    }
  }

  init(_ section: DesktopMainWindowSection) {
    switch section {
    case .screenMemory: self = .screenMemory
    case .privacy: self = .privacy
    case .sensing: self = .sensing
    case .account: self = .account
    case .updates: self = .updates
    case .diagnostics: self = .diagnostics
    }
  }

  init(_ section: DesktopUtilitySection) {
    switch section {
    case .screenMemory: self = .screenMemory
    case .privacy: self = .privacy
    case .sensing: self = .sensing
    case .account: self = .account
    case .updates: self = .updates
    case .diagnostics: self = .diagnostics
    }
  }

  var utilitySection: DesktopUtilitySection {
    switch self {
    case .screenMemory: return .screenMemory
    case .privacy: return .privacy
    case .sensing: return .sensing
    case .account: return .account
    case .updates: return .updates
    case .diagnostics: return .diagnostics
    }
  }
}

@MainActor
final class DesktopViewModel: ObservableObject {
  let launchConfiguration: DesktopLaunchConfiguration
  let composition: DesktopApplicationComposition
  @Published var selected: DesktopSection = .screenMemory
  @Published var query = ""
  @Published var status: String
  @Published var effectLog: [String] = []
  @Published var captureRunning = false
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
  @Published var showOnboarding: Bool

  let messageStore = MessageStore()
  let screenMemory: SwitchableScreenMemoryStore
  private let settingsStore: any ScreenMemorySettingsStore
  private let privacyPolicy: ScreenMemoryPrivacyPolicy
  private let permissionGateway: any ScreenRecordingPermissionGateway
  private let microphonePermissionGateway: any DesktopMicrophonePermissionGateway
  private let onboardingStore: any DesktopOnboardingProgressStore
  private let utilitySettingsCoordinator: DesktopUtilitySettingsCoordinator
  private var publicReleaseOperations: DesktopPublicReleaseOperations!
  private let alreadyAcknowledgedRuntimeClient = AlreadyAcknowledgedRuntimeClient()
  private let runtimeSocket = URLSessionRuntimeSocket()
  // On-device passive-audio stack: Silero VAD gates microphone segments and
  // FluidAudio/Parakeet transcribes on the Neural Engine. Shared so the ONNX
  // session and Parakeet model load once across every passive-audio consumer.
  private let sileroVAD = SileroAudioActivityPredictor()
  private let localTranscription = FluidAudioTranscriptionService()
  private var runtimeRestoreAttempted = false
  private var screenMemoryProfileUserID = DesktopLocalProfile.anonymousUserID
  private lazy var runtime = RuntimeAdapter(
    socket: runtimeSocket,
    messageStore: messageStore,
    clientVersion: DesktopRuntimeConfiguration.clientVersion
  )
  private lazy var runtimeSession = DesktopRuntimeSessionCoordinator(
    auth: DesktopRuntimeConfiguration.authProvider(),
    controlPlane: DesktopRuntimeConfiguration.controlPlaneClient(),
    device: ClientDeviceService(deviceId: DesktopRuntimeConfiguration.deviceFingerprint),
    runtime: runtime,
    capturePermissionGranted: { [weak self] in self?.screenRecordingPermissionGranted ?? false }
  )
  private lazy var floatingBarController = FloatingBarController(
    runtimeClient: runtime, messageStore: messageStore)
  private let floatingBarManager = FloatingControlBarManager.shared
  private lazy var compiler = ContextCompiler(settings: compilerSettings)
  private lazy var publisher = PerceptionPublisher(
    runtimeClient: runtime,
    outbox: screenMemory,
    isRuntimeConnected: { [weak self] in self?.runtime.status == .connected }
  )
  private lazy var captureSource = NativeScreenCaptureSource()
  private lazy var capture = CaptureCoordinator(
    compiler: compiler,
    screenMemory: screenMemory,
    publisher: publisher,
    archiveProvider: { [weak self] in self?.screenMemory.activeArchive },
    privacyPolicy: privacyPolicy
  )
  private lazy var ambientAudio = AmbientAudioCoordinator(
    audioMemory: screenMemory,
    publisher: publisher
  )
  private lazy var captureLoop = ScreenMemoryCaptureLoop(
    coordinator: capture,
    source: captureSource,
    settingsProvider: { [weak self] in
      self?.compilerSettings ?? CompilerSettings(captureEnabled: false)
    },
    permissionProvider: { [weak self] in self?.screenRecordingPermissionGranted ?? false },
    privacySnapshotProvider: { [weak self] in
      self?.privacyPolicy.snapshot ?? ScreenMemoryPrivacySnapshot(isPrivateMode: true)
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
  private lazy var ambientAudioLoop = AmbientAudioCaptureLoop(
    coordinator: ambientAudio,
    audioCapture: NativeMicrophoneAudioCaptureService(captureDuration: 4.0),
    voiceGate: SileroVoiceActivityGate(vad: sileroVAD),
    transcription: localTranscription,
    settingsProvider: { [weak self] in
      self?.compilerSettings ?? CompilerSettings(captureEnabled: false)
    },
    permissionProvider: { [weak self] in self?.microphonePermissionStatus.isGranted ?? false },
    privacySnapshotProvider: { [weak self] in
      self?.privacyPolicy.snapshot ?? ScreenMemoryPrivacySnapshot(isPrivateMode: true)
    },
    activeWindowProvider: { [weak self] in
      guard let self else { return nil }
      return try self.captureSource.activeWindowContext()
    }
  )
  private lazy var screenPrivateModeGate = RememberingScreenMemorySensingGate(
    isRunning: { [weak self] in self?.captureLoop.state.isRunning ?? false },
    pause: { [weak self] in
      self?.captureLoop.stop()
      self?.captureRunning = false
    },
    resume: { [weak self] in self?.startCaptureAfterPrivateMode() }
  )
  private lazy var microphonePrivateModeGate = RememberingScreenMemorySensingGate(
    isRunning: { [weak self] in self?.ambientAudioLoop.state.isRunning ?? false },
    pause: { [weak self] in self?.ambientAudioLoop.stop() },
    resume: { [weak self] in self?.reconcileAmbientAudioCapture() }
  )
  private lazy var systemAudioPrivateModeGate = RememberingScreenMemorySensingGate(
    isRunning: { false },
    pause: {},
    resume: {}
  )
  private lazy var privacyCoordinator = ScreenMemoryPrivacyCoordinator(
    policy: privacyPolicy,
    archiveProvider: { [weak self] in self?.screenMemory.activeArchive },
    sensingGates: [
      screenPrivateModeGate,
      microphonePrivateModeGate,
      systemAudioPrivateModeGate,
    ]
  )
  /// Capture-lifecycle resilience controller: auto-start, sleep/wake/lock,
  /// battery cadence, competing-recorder yield, stop → session_end_marker.
  /// Renovated from Omi's `ProactiveAssistantsPlugin` cycle at the Intentive
  /// `DesktopExperience.swift` seam. The AppKit observers live in the app
  /// target (`CaptureLifecycleAdapters.swift`); Core stays testable.
  private(set) lazy var captureLifecycle: ScreenMemoryCaptureLifecycleController? = {
    guard composition.activeSystemBoundaries.contains(.capture) else { return nil }
    let usesCaptureBoundary = composition.activeSystemBoundaries.contains(.capture)
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
      recorderDetector: AppKitCompetingScreenRecorderDetector(),
      systemEventObserver: AppKitCaptureSystemEventObserver(),
      sessionEndSink: runtime,
      archiveReconciler: screenMemory.activeArchive,
      outboxDrain: publisher,
      lockFile: lock,
      settingsProvider: { [weak self] in
        self?.compilerSettings ?? CompilerSettings(captureEnabled: false)
      },
      permissionProvider: { [weak self] in self?.screenRecordingPermissionGranted ?? false },
      privacySnapshotProvider: { [weak self] in
        self?.privacyPolicy.snapshot ?? ScreenMemoryPrivacySnapshot(isPrivateMode: true)
      },
      captureBoundaryEnabled: usesCaptureBoundary
    )
    controller.installSystemEventObservers()
    return controller
  }()
  private var didRunLaunchReconciliation = false

  func openFloatingConversation() {
    floatingBarManager.showComposer()
  }

  /// Screen Memory results for the current `query`, refreshed on query change
  /// rather than per-render so the on-device semantic pass runs at most once per
  /// keystroke. Renovated from Omi's `RewindViewModel.performSearch`.
  @Published var screenMemoryResults: [ScreenMemoryRankedResult] = []

  /// Recompute Screen Memory search through the active archive's hybrid local
  /// search (FTS-first, on-device vector recall appended). Falls back to the
  /// store's lexical search when no archive is mounted yet.
  func refreshScreenMemorySearch() {
    if let archive = screenMemory.activeArchive {
      screenMemoryResults = archive.semanticSearch(query, limit: 24)
    } else {
      screenMemoryResults = screenMemory.search(query, limit: 24).map {
        ScreenMemoryRankedResult(record: $0.record, matchedLexically: true, semanticSimilarity: nil)
      }
    }
  }

  var onboardingRequirements: DesktopOnboardingRequirements {
    DesktopOnboardingRequirements(
      progress: onboardingProgress,
      isAuthenticated: isOnboardingAuthenticated,
      screenRecordingPermissionGranted: screenRecordingPermissionGranted,
      microphonePermissionGranted: microphonePermissionStatus.isGranted,
      systemAudioPermissionGranted: screenRecordingPermissionGranted
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
    let screenRecordingPermissionGranted =
      usesCaptureBoundary
      ? permissionGateway.hasScreenRecordingPermission()
      : composition.permissions.screenRecording == .granted
    let microphonePermissionStatus =
      usesCaptureBoundary
      ? microphonePermissionGateway.authorizationStatus()
      : Self.microphonePermissionStatus(from: composition.permissions.microphone)
    settings.captureEnabled = loadedUtilitySettings.screenCaptureEnabled
    settings.ambientAudioCaptureEnabled = loadedUtilitySettings.passiveAudioEnabled
    compilerSettings = settings
    excludedAppsText = Self.renderExcludedApps(
      Set(privacyPolicy.snapshot.excludedApplications.map(\.displayName))
    )
    privacySnapshot = privacyPolicy.snapshot
    self.screenRecordingPermissionGranted = screenRecordingPermissionGranted
    self.microphonePermissionStatus = microphonePermissionStatus
    onboardingProgress = progress
    let launchUserID: String?
    switch composition.authentication {
    case .signedOut:
      launchUserID = nil
    case .signedIn(let userID):
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
        systemAudioPermissionGranted: screenRecordingPermissionGranted
      ).isComplete

    let initialScreenMemory = Self.makeScreenMemoryStore(
      userID: launchUserID,
      baseApplicationSupportURL: launchConfiguration.profileRoot
    )
    screenMemory = SwitchableScreenMemoryStore(initialScreenMemory.store)
    screenMemoryProfileUserID = DesktopLocalProfile.sanitizedUserID(launchUserID)
    status = initialScreenMemory.status
    selected = DesktopSection(loadedUtilitySettings.selectedSection)
    configureRuntimeSocketCallbacks()
    floatingBarManager.configure(controller: floatingBarController)
    floatingBarManager.setShortcutPreset(loadedUtilitySettings.floatingBarShortcut)
    floatingBarManager.registerGlobalShortcut()
    publicReleaseOperations = DesktopPublicReleaseOperations(
      profileRoot: launchConfiguration.profileRoot,
      updatesEnabled: composition.activeSystemBoundaries.contains(.updates),
      telemetryEnabled: composition.activeSystemBoundaries.contains(.telemetry),
      analyticsConsent: { [weak self] in self?.utilitySettings.analyticsEnabled ?? false },
      onUpdateSnapshot: { [weak self] snapshot in self?.updateSnapshot = snapshot }
    )
    reconcileAmbientAudioCapture()
    privacyCoordinator.enforcePersistedState()
  }

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
    await captureLifecycle?.performLaunchReconciliation()
    captureRunning = captureLoop.state.isRunning
    if captureRunning {
      status = "Capture running"
    }
    objectWillChange.send()
  }

  /// Slice 07 — quit path. Finalizes the active video chunk and emits
  /// `session_end_marker` with reason `.quit` before the app terminates.
  /// Renovated from Omi's `RewindShutdownFlush` + `OmiApp.applicationWillTerminate`.
  func requestQuit() {
    captureLifecycle?.stop(reason: .quit)
    captureRunning = false
    publicReleaseOperations.shutdown()
  }

  func restoreRuntimeSession() async {
    status = "Restoring Runtime session..."
    let state = await runtimeSession.restoreAndConnect()
    applyRuntimeState(state)
  }

  func signInAndConnectRuntime() async {
    guard composition.activeSystemBoundaries.contains(.network) else {
      status = "Runtime network is disabled for this launch"
      return
    }
    status = "Connecting Runtime..."
    let state = await runtimeSession.signInAndConnect()
    applyRuntimeState(state)
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
      captureRunning = false
      status = "Capture is disabled for this launch"
      return
    }
    if captureLoop.state.isRunning {
      captureLoop.stop()
      captureRunning = false
      status = "Capture stopped"
      return
    }

    guard compilerSettings.captureEnabled else {
      captureRunning = false
      status = "Screen Memory is off"
      return
    }
    guard refreshScreenRecordingPermissionForCapture() else { return }

    captureRunning = true
    status = "Capture running"
    _ = captureLoop.start { [weak self] event in
      guard let self else { return }
      switch event {
      case .captured(let eventCount):
        status = "Capture running. \(perceptionCaptureStatus(eventCount: eventCount))"
      case .skipped(let reason):
        status = "Capture paused: \(reason)"
      case .failed(let message):
        status = "Capture warning: \(message)"
      }
      captureRunning = captureLoop.state.isRunning
      objectWillChange.send()
    }
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
    do {
      if enabled {
        try SMAppService.mainApp.register()
      } else {
        try SMAppService.mainApp.unregister()
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

  func checkForUpdates() {
    guard composition.activeSystemBoundaries.contains(.updates) else {
      status = "Updates are disabled for this deterministic launch"
      return
    }
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
    guard onboardingRequirements.nextIncompleteStep == .ready else {
      status = "Desktop setup is not complete"
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
    if onboardingRequirements.captureReady {
      Task { await performCaptureLaunchReconciliation() }
    }
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
    runtimeSession.disconnect()
    runtimeRestoreAttempted = false
    applyRuntimeState(runtimeSession.state)
    status = "Signed out"
    objectWillChange.send()
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
    status =
      microphonePermissionStatus.isGranted
      ? "Microphone permission granted"
      : "Microphone permission required"
    reconcileAmbientAudioCapture()
    decideAudio(microphonePermissionStatus.isGranted ? .granted : .denied)
  }

  func openMicrophoneSettings() {
    microphonePermissionGateway.openMicrophoneSettings()
    status = "Opened Microphone settings"
  }

  func refreshOnboardingPermissions() {
    refreshScreenRecordingPermission()
    microphonePermissionStatus = microphonePermissionGateway.authorizationStatus()
  }

  func setOnboardingRetentionDays(_ days: Int) {
    guard let period = ScreenMemoryRetentionPeriod(rawValue: days) else { return }
    onboardingRetentionPeriod = period
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
    refreshScreenRecordingPermission()
    microphonePermissionStatus = microphonePermissionGateway.authorizationStatus()
    reconcileAmbientAudioCapture()
  }

  func openFloatingBarFromOnboarding() {
    openFloatingBar()
    markOnboardingStepReviewed(.textChatShortcut)
  }

  func triggerEffect() {
    let message = CompanionMessage(
      messageId: "pmb-\(UUID().uuidString)",
      body: "Take a quick reset before the next desktop phase.",
      emittedAt: Date().protocolTimestamp,
      viaPostMessageBack: true
    )
    deliverEffect(
      message, runtimeClient: runtime, statusMessage: "Effect Runner delivered a local nudge")
  }

  func setCaptureEnabled(_ enabled: Bool) {
    var settings = compilerSettings
    settings.captureEnabled = enabled
    applyCompilerSettings(settings)
    utilitySettings.screenCaptureEnabled = enabled
    persistUtilitySettings()

    if enabled {
      status = "Screen Memory is on"
    } else {
      // Slice 07: route the user-initiated stop through the lifecycle controller
      // so it finalizes the active chunk and emits `session_end_marker`
      // (reason `.userToggle`). When the controller is absent (capture boundary
      // disabled for this launch) fall back to a plain loop stop.
      if let lifecycle = captureLifecycle {
        lifecycle.stop(reason: .userToggle)
      } else if captureLoop.state.isRunning {
        captureLoop.stop()
      }
      ambientAudioLoop.stop()
      captureRunning = false
      status = "Screen Memory is off"
    }
    reconcileAmbientAudioCapture()
  }

  func enterPrivateMode() async {
    do {
      try await privacyCoordinator.enterPrivateMode()
      privacySnapshot = privacyCoordinator.snapshot
      captureRunning = false
      status = "Private Mode — all sensing paused"
    } catch {
      status = "Could not enter Private Mode: \(error.localizedDescription)"
    }
  }

  func resumeFromPrivateMode() {
    do {
      try privacyCoordinator.resume()
      privacySnapshot = privacyCoordinator.snapshot
      status = "Private Mode ended"
    } catch {
      status = "Could not resume sensing: \(error.localizedDescription)"
    }
  }

  private func startCaptureAfterPrivateMode() {
    guard !captureLoop.state.isRunning,
      compilerSettings.captureEnabled,
      screenRecordingPermissionGranted
    else { return }
    toggleCapture()
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
    // Passive microphone/system-audio sensing is restored behind its dedicated
    // local pipeline in Slice 8. The walking skeleton must not start the legacy
    // RunAnywhere ambient path merely because an old preference remains set.
    ambientAudioLoop.stop()
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
      privacySnapshot = privacyPolicy.snapshot
    } catch {
      status = "Privacy Zones save failed: \(error.localizedDescription)"
    }
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
    status =
      screenRecordingPermissionGranted
      ? "Screen Recording permission granted"
      : "Screen Recording permission required"
  }

  func openScreenRecordingSettings() {
    permissionGateway.openScreenRecordingSettings()
    status = "Opened Screen Recording settings"
  }

  func refreshScreenRecordingPermission() {
    let granted = permissionGateway.hasScreenRecordingPermission()
    screenRecordingPermissionGranted = granted
    if !granted, captureLoop.state.isRunning {
      captureLoop.stop()
      captureRunning = false
    }
    status =
      granted ? "Screen Recording permission granted" : "Screen Recording permission required"
  }

  private func refreshScreenRecordingPermissionForCapture() -> Bool {
    let granted = permissionGateway.hasScreenRecordingPermission()
    screenRecordingPermissionGranted = granted
    if !granted {
      captureRunning = false
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
    if message.viaPostMessageBack {
      deliverEffect(
        message,
        runtimeClient: alreadyAcknowledgedRuntimeClient,
        statusMessage: "Effect Runner delivered Runtime nudge"
      )
    }
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

  private func deliverEffect(
    _ message: CompanionMessage,
    runtimeClient: RuntimeChatClient,
    statusMessage: String
  ) {
    let runner = EffectRunner(
      overlay: FloatingBarOverlaySink(manager: floatingBarManager),
      runtimeClient: runtimeClient
    )
    do {
      try runner.handle(message)
      effectLog.append("Intentive: \(message.body)")
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
      let flushed = try publisher.flushPendingPerceptionEvents()
      // Propagate any locally-queued deletions on the same durable channel.
      let tombstoned = try publisher.flushPendingPerceptionTombstones()
      let synced = flushed + tombstoned
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
    screenMemory.replace(with: newScreenMemory.store)
    screenMemoryProfileUserID = sanitizedUserID
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
  static var clientVersion: String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
      ?? "desktop-dev"
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
    if let value = environment("INTENTIVE_CONTROL_PLANE_URL"), let url = URL(string: value) {
      return url
    }
    return URL(string: "http://localhost:8080")!
  }

  private static var hostedAuthURL: URL? {
    guard
      let value = environment("INTENTIVE_HOSTED_AUTH_URL") ?? environment("INTENTIVE_NEON_AUTH_URL")
    else {
      return nil
    }
    return URL(string: value)
  }

  private static var hostedAuthTokenExchangeURL: URL? {
    guard let value = environment("INTENTIVE_AUTH_TOKEN_EXCHANGE_URL") else {
      return nil
    }
    return URL(string: value)
  }

  private static var callbackScheme: String {
    environment("INTENTIVE_AUTH_CALLBACK_SCHEME") ?? "intentive-desktop"
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
  let composition: DesktopApplicationComposition
  @FocusState private var searchFocused: Bool

  @MainActor
  init(model: DesktopViewModel, composition: DesktopApplicationComposition) {
    _model = StateObject(wrappedValue: model)
    self.composition = composition
  }

  var body: some View {
    NavigationSplitView {
      List(selection: $model.selected) {
        Section("Desktop") {
          ForEach(composition.mainWindowSections.map(DesktopSection.init)) { section in
            Label(section.rawValue, systemImage: section.symbol)
              .tag(section)
          }
        }
      }
      .navigationSplitViewColumnWidth(min: 210, ideal: 230, max: 260)
    } detail: {
      VStack(spacing: 0) {
        if model.privacySnapshot.isPrivateMode {
          HStack(spacing: 10) {
            Image(systemName: "hand.raised.fill")
            Text("Private Mode is on. Screen, microphone, and system-audio sensing are paused.")
              .fontWeight(.semibold)
            Spacer()
            Button("Resume Sensing", action: model.resumeFromPrivateMode)
          }
          .padding(.horizontal, 18)
          .frame(minHeight: 44)
          .foregroundStyle(.white)
          .background(Color.red.opacity(0.9))
        }
        topBar
        Divider()
        content
      }
      .background(Color(nsColor: .windowBackgroundColor))
    }
    .onReceive(NotificationCenter.default.publisher(for: .intentiveFocusScreenMemorySearch)) { _ in
      model.selected = .screenMemory
      searchFocused = true
    }
    .onChange(of: model.selected) { _, section in model.persistSelectedUtilitySection(section) }
    .task {
      await model.restoreRuntimeSessionIfNeeded()
      if !model.showOnboarding {
        await model.performCaptureLaunchReconciliation()
      }
    }
    .sheet(isPresented: $model.showOnboarding) {
      DesktopOnboardingSheet(model: model)
    }
  }

  private var topBar: some View {
    HStack(spacing: 12) {
      Label(model.selected.rawValue, systemImage: model.selected.symbol)
        .font(.headline)
      Spacer()
      Text(model.status)
        .font(.caption)
        .foregroundStyle(.secondary)
      Button(action: model.openSetup) {
        Label("Setup", systemImage: "checklist")
      }
      Button {
        Task {
          await model.signInAndConnectRuntime()
        }
      } label: {
        Label("Connect Runtime", systemImage: "bolt.horizontal.circle")
      }
      .keyboardShortcut("r", modifiers: [.command])
      Button {
        model.toggleCapture()
      } label: {
        Label(
          model.captureRunning ? "Stop Capture" : "Start Capture",
          systemImage: model.captureRunning ? "stop.circle" : "camera.viewfinder")
      }
      .disabled(
        model.privacySnapshot.isPrivateMode
          || !model.compilerSettings.captureEnabled
          || !model.screenRecordingPermissionGranted
      )
      .keyboardShortcut("n", modifiers: [.command])
    }
    .padding(.horizontal, 18)
    .frame(height: 50)
  }

  @ViewBuilder
  private var content: some View {
    switch model.selected {
    case .screenMemory:
      ScreenMemoryView(model: model, searchFocused: $searchFocused)
    case .privacy, .sensing, .account, .updates, .diagnostics:
      UtilitySettingsView(model: model, section: model.selected)
    }
  }
}

private struct ScreenMemoryView: View {
  @ObservedObject var model: DesktopViewModel
  var searchFocused: FocusState<Bool>.Binding

  var body: some View {
    let results = model.screenMemoryResults
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        Image(systemName: "magnifyingglass")
          .foregroundStyle(.secondary)
        TextField("Search Screen Memory", text: $model.query)
          .textFieldStyle(.plain)
          .focused(searchFocused)
          .accessibilityIdentifier(ScreenMemoryAccessibilityID.searchField)
      }
      .padding(10)
      .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))

      if results.isEmpty {
        ContentUnavailableView(
          model.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "No Screen Memory yet"
            : "No matching records",
          systemImage: "clock.arrow.circlepath"
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityIdentifier(ScreenMemoryAccessibilityID.emptyState)
      } else {
        List(results, id: \.record.id) { result in
          VStack(alignment: .leading, spacing: 4) {
            HStack {
              Text(result.record.appName)
                .font(.headline)
              if !result.matchedLexically {
                Text("Related")
                  .font(.caption2.weight(.semibold))
                  .foregroundStyle(.secondary)
                  .padding(.horizontal, 6)
                  .padding(.vertical, 1)
                  .background(.quaternary, in: Capsule())
              }
              Spacer()
              Text(result.record.capturedAt)
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Text(result.record.summary)
              .foregroundStyle(.secondary)
          }
          .padding(.vertical, 6)
          .accessibilityIdentifier(
            result.recordID.map(ScreenMemoryAccessibilityID.frame) ?? result.record.id)
        }
        .accessibilityIdentifier(ScreenMemoryAccessibilityID.filmstrip)
      }
    }
    .padding(18)
    .onAppear { model.refreshScreenMemorySearch() }
    .onChange(of: model.query) { model.refreshScreenMemorySearch() }
  }
}

private struct UtilitySettingsView: View {
  @ObservedObject var model: DesktopViewModel
  let section: DesktopSection

  var body: some View {
    Form {
      if section == .sensing {
        Section("Sensing") {
          Toggle(
            "Screen Memory",
            isOn: Binding(
              get: { model.compilerSettings.captureEnabled },
              set: model.setCaptureEnabled
            )
          )
          Toggle(
            "Passive audio context",
            isOn: Binding(
              get: { model.compilerSettings.ambientAudioCaptureEnabled },
              set: model.setAmbientAudioCaptureEnabled
            )
          )
          LabeledContent(
            "Screen Recording",
            value: model.screenRecordingPermissionGranted ? "Granted" : "Required")
          LabeledContent(
            "Microphone",
            value: model.microphonePermissionStatus.isGranted ? "Granted" : "Not granted")
          Toggle(
            "Launch at login",
            isOn: Binding(get: { model.utilitySettings.launchAtLogin }, set: model.setLaunchAtLogin)
          )
          Picker(
            "Floating Bar shortcut",
            selection: Binding(
              get: { model.utilitySettings.floatingBarShortcut }, set: model.setFloatingBarShortcut)
          ) {
            Text("⌘O").tag("command+o")
            Text("⌘⇧Space").tag("command+shift+space")
            Text("⌥Space").tag("option+space")
          }
        }
      }

      if section == .privacy {
        Section("Privacy") {
          HStack {
            Label(
              model.privacySnapshot.isPrivateMode ? "Private Mode On" : "Private Mode Off",
              systemImage: model.privacySnapshot.isPrivateMode ? "hand.raised.fill" : "hand.raised"
            )
            Spacer()
            if model.privacySnapshot.isPrivateMode {
              Button("Resume Sensing", action: model.resumeFromPrivateMode)
            } else {
              Button("Enter Private Mode") {
                Task { await model.enterPrivateMode() }
              }
            }
          }

          HStack {
            Label("Screen Recording", systemImage: "rectangle.on.rectangle")
            Spacer()
            Label(
              model.screenRecordingPermissionGranted ? "Granted" : "Required",
              systemImage: model.screenRecordingPermissionGranted
                ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
            )
            .foregroundStyle(model.screenRecordingPermissionGranted ? .green : .orange)
          }

          HStack {
            Button(action: model.requestScreenRecordingPermission) {
              Label("Request Access", systemImage: "hand.raised")
            }
            Button(action: model.openScreenRecordingSettings) {
              Label("Open System Settings", systemImage: "gearshape")
            }
            Button(action: model.refreshScreenRecordingPermission) {
              Label("Refresh", systemImage: "arrow.clockwise")
            }
          }

          TextField(
            "Excluded applications (comma separated)",
            text: Binding(
              get: { model.excludedAppsText },
              set: model.updateExcludedAppsText
            )
          )
          Picker(
            "Keep Screen Memory",
            selection: Binding(
              get: { model.onboardingRetentionPeriod.rawValue }, set: model.setRetentionDays)
          ) {
            ForEach(DesktopUtilitySettings.allowedRetentionDays, id: \.self) { days in
              Text("\(days) days").tag(days)
            }
          }
          Button("Clear local Screen Memory", role: .destructive, action: model.clearLocalData)
        }
      }

      if section == .account {
        Section("Account") {
          LabeledContent(
            "Runtime", value: model.runtimeState == .connected ? "Connected" : "Disconnected")
          Button("Sign Out", action: model.signOut)
        }
      }

      if section == .updates {
        Section("Updates") {
          LabeledContent("Application", value: "Intentive Desktop")
          LabeledContent("Status", value: model.updateSnapshot.phase.displayName)
          if let version = model.updateSnapshot.availableVersion {
            LabeledContent("Available version", value: version)
          }
          if let failure = model.updateSnapshot.failureMessage {
            Text(failure).foregroundStyle(.red)
          }
          Button("Check for Updates", action: model.checkForUpdates)
            .disabled(model.updateSnapshot.phase == .checking)
          if model.updateSnapshot.phase == .downloadedAwaitingInstall {
            Button("Install Downloaded Update", action: model.installDownloadedUpdate)
          }
        }
      }

      if section == .diagnostics {
        Section("Diagnostics") {
          Toggle(
            "Anonymous product analytics",
            isOn: Binding(
              get: { model.utilitySettings.analyticsEnabled }, set: model.setAnalyticsEnabled))
          LabeledContent("Capture", value: model.captureRunning ? "Running" : "Stopped")
          LabeledContent("Runtime", value: String(describing: model.runtimeState))
          Button("Export Logs", action: model.exportDiagnostics)
          Button("Clear Logs", role: .destructive, action: model.clearDiagnostics)
        }
      }
    }
    .padding(24)
  }
}

private extension UpdatePhase {
  var displayName: String {
    switch self {
    case .idle: return "Up to date"
    case .checking: return "Checking"
    case .downloading: return "Downloading"
    case .downloadedAwaitingInstall: return "Ready to install"
    case .installing: return "Installing"
    case .failed: return "Needs attention"
    }
  }
}
