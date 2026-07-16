import IntentiveDesktopCore
import IntentiveDesktopNativeAdapters
import IntentiveDesktopNativeAssets
import SwiftUI

enum DesktopSection: String, CaseIterable, Identifiable {
  case home = "Home"
  case screenMemory = "Screen Memory"
  case settings = "Settings"

  var id: String { rawValue }

  var symbol: String {
    switch self {
    case .home: return "rectangle.grid.2x2"
    case .screenMemory: return "clock.arrow.circlepath"
    case .settings: return "gearshape"
    }
  }

  init(_ section: DesktopMainWindowSection) {
    switch section {
    case .home: self = .home
    case .screenMemory: self = .screenMemory
    case .settings: self = .settings
    }
  }
}

@MainActor
final class DesktopViewModel: ObservableObject {
  let launchConfiguration: DesktopLaunchConfiguration
  let composition: DesktopApplicationComposition
  @Published var selected: DesktopSection = .home
  @Published var query = ""
  @Published var input = ""
  @Published var status: String
  @Published var effectLog: [String] = []
  @Published var captureRunning = false
  @Published var compilerSettings: CompilerSettings
  @Published var excludedAppsText: String
  @Published var privacySnapshot: ScreenMemoryPrivacySnapshot
  @Published var screenRecordingPermissionGranted: Bool
  @Published var accessibilityPermissionGranted: Bool
  @Published var microphonePermissionStatus: DesktopMicrophonePermissionStatus
  @Published var runtimeState: DesktopRuntimeSessionState = .signedOut
  @Published var onboardingProgress: DesktopOnboardingProgress
  @Published var showOnboarding: Bool
  @Published var voiceCaptureRunning = false
  @Published var voiceStatus = "Ready for a local push-to-talk turn"
  @Published var voiceShortcutState: PushToTalkShortcutState = .idle

  let messageStore = MessageStore()
  let screenMemory: SwitchableScreenMemoryStore
  private let settingsStore: any ScreenMemorySettingsStore
  private let privacyPolicy: ScreenMemoryPrivacyPolicy
  private let permissionGateway: any ScreenRecordingPermissionGateway
  private let accessibilityPermissionGateway: any DesktopAccessibilityPermissionGateway
  private let microphonePermissionGateway: any DesktopMicrophonePermissionGateway
  private let onboardingStore: any DesktopOnboardingProgressStore
  private let alreadyAcknowledgedRuntimeClient = AlreadyAcknowledgedRuntimeClient()
  private let runtimeSocket = URLSessionRuntimeSocket()
  // On-device passive-audio stack (replaces RunAnywhere): Silero VAD gates
  // microphone turns; FluidAudio/Parakeet transcribes on the Neural Engine. Shared
  // so the ONNX session and the Parakeet model load once across every consumer.
  private let sileroVAD = SileroPushToTalkVADPredictor()
  private let localTranscription = FluidAudioTranscriptionService()
  private let pushToTalkRecorder = NativePushToTalkAudioRecorder()
  private let pushToTalkShortcutMonitor = NativePushToTalkShortcutMonitor()
  private var runtimeRestoreAttempted = false
  private var screenMemoryProfileUserID = DesktopLocalProfile.anonymousUserID
  private var pushToTalkShortcutStateMachine = PushToTalkShortcutStateMachine()
  private var pendingPushToTalkAudio: Data?
  private var pendingPushToTalkLockTask: Task<Void, Never>?
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
  private lazy var floatingBarController = FloatingBarController(runtimeClient: runtime, messageStore: messageStore)
  private let floatingBarManager = FloatingControlBarManager.shared
  private lazy var pushToTalk = PushToTalkManager(
    audioCapture: NativeMicrophoneAudioCaptureService(),
    voiceGate: PushToTalkVoiceActivityGate(vad: sileroVAD),
    transcription: localTranscription
  )
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
    settingsProvider: { [weak self] in self?.compilerSettings ?? CompilerSettings(captureEnabled: false) },
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
    voiceGate: PushToTalkVoiceActivityGate(vad: sileroVAD),
    transcription: localTranscription,
    settingsProvider: { [weak self] in self?.compilerSettings ?? CompilerSettings(captureEnabled: false) },
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
    let lock = (try? CaptureSessionLockFile.inProfile(launchConfiguration.profileRoot))
      ?? CaptureSessionLockFile(url: launchConfiguration.profileRoot
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
      settingsProvider: { [weak self] in self?.compilerSettings ?? CompilerSettings(captureEnabled: false) },
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

  var messages: [ChatMessage] {
    messageStore.messages
  }

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
      screenRecordingPermissionGranted: screenRecordingPermissionGranted,
      accessibilityPermissionGranted: accessibilityPermissionGranted,
      microphonePermissionGranted: microphonePermissionStatus.isGranted
    )
  }

  init(
    launchConfiguration: DesktopLaunchConfiguration,
    composition: DesktopApplicationComposition,
    settingsStore: any ScreenMemorySettingsStore = UserDefaultsScreenMemorySettingsStore(),
    permissionGateway: any ScreenRecordingPermissionGateway = NativeScreenRecordingPermissionGateway(),
    accessibilityPermissionGateway: any DesktopAccessibilityPermissionGateway = NativeAccessibilityPermissionGateway(),
    microphonePermissionGateway: any DesktopMicrophonePermissionGateway = NativeMicrophonePermissionGateway(),
    onboardingStore: any DesktopOnboardingProgressStore = UserDefaultsDesktopOnboardingProgressStore()
  ) {
    self.launchConfiguration = launchConfiguration
    self.composition = composition
    self.settingsStore = settingsStore
    self.permissionGateway = permissionGateway
    self.accessibilityPermissionGateway = accessibilityPermissionGateway
    self.microphonePermissionGateway = microphonePermissionGateway
    self.onboardingStore = onboardingStore
    var settings = settingsStore.load()
    let privacyPolicy = ScreenMemoryPrivacyPolicy(
      persistence: UserDefaultsScreenMemoryPrivacyPersistence(),
      legacyExcludedAppNames: settings.excludedApps
    )
    self.privacyPolicy = privacyPolicy
    settings.excludedApps = []
    let progress = onboardingStore.load()
    let usesCaptureBoundary = composition.activeSystemBoundaries.contains(.capture)
    let screenRecordingPermissionGranted = usesCaptureBoundary
      ? permissionGateway.hasScreenRecordingPermission()
      : composition.permissions.screenRecording == .granted
    let accessibilityPermissionGranted = usesCaptureBoundary
      ? accessibilityPermissionGateway.hasAccessibilityPermission()
      : false
    let microphonePermissionStatus = usesCaptureBoundary
      ? microphonePermissionGateway.authorizationStatus()
      : Self.microphonePermissionStatus(from: composition.permissions.microphone)
    compilerSettings = settings
    excludedAppsText = Self.renderExcludedApps(
      Set(privacyPolicy.snapshot.excludedApplications.map(\.displayName))
    )
    privacySnapshot = privacyPolicy.snapshot
    self.screenRecordingPermissionGranted = screenRecordingPermissionGranted
    self.accessibilityPermissionGranted = accessibilityPermissionGranted
    self.microphonePermissionStatus = microphonePermissionStatus
    onboardingProgress = progress
    showOnboarding = composition.setupSurface == .onboarding
      && !DesktopOnboardingRequirements(
        progress: progress,
        screenRecordingPermissionGranted: screenRecordingPermissionGranted,
        accessibilityPermissionGranted: accessibilityPermissionGranted,
        microphonePermissionGranted: microphonePermissionStatus.isGranted
      ).isComplete

    let launchUserID: String?
    switch composition.authentication {
    case .signedOut:
      launchUserID = nil
    case .signedIn(let userID):
      launchUserID = userID
    }
    let initialScreenMemory = Self.makeScreenMemoryStore(
      userID: launchUserID,
      baseApplicationSupportURL: launchConfiguration.profileRoot
    )
    screenMemory = SwitchableScreenMemoryStore(initialScreenMemory.store)
    screenMemoryProfileUserID = DesktopLocalProfile.sanitizedUserID(launchUserID)
    status = initialScreenMemory.status
    configureRuntimeSocketCallbacks()
    floatingBarManager.configure(controller: floatingBarController)
    floatingBarManager.registerGlobalShortcut()
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
        runtimeState = composition.runtime == .connected ? .connected : .retry(retryAfterSeconds: nil)
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

  func sendMessage() {
    let body = input.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !body.isEmpty else { return }
    do {
      _ = try runtime.sendUserMessage(body)
      input = ""
      status =
        runtime.status == .connected
        ? "Message sent to Runtime Bridge"
        : "Message queued until Runtime connects"
      objectWillChange.send()
    } catch {
      status = "Send failed: \(error.localizedDescription)"
    }
  }

  func openFloatingBar() {
    floatingBarManager.showComposer()
    status = "Floating bar open"
  }

  func openSetup() {
    selected = .settings
    status = "Desktop setup"
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
      status = "Desktop setup is not complete"
      return
    }
    showOnboarding = false
    status = "Desktop setup complete"
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
    markOnboardingStepReviewed(.permissions)
    requestScreenRecordingPermission()
  }

  func openOnboardingScreenRecordingSettings() {
    markOnboardingStepReviewed(.permissions)
    openScreenRecordingSettings()
  }

  func requestAccessibilityPermission() {
    markOnboardingStepReviewed(.permissions)
    let requested = accessibilityPermissionGateway.requestAccessibilityPermission()
    accessibilityPermissionGranted = requested || accessibilityPermissionGateway.hasAccessibilityPermission()
    status =
      accessibilityPermissionGranted
      ? "Accessibility permission granted"
      : "Accessibility permission required for global push-to-talk"
  }

  func openAccessibilitySettings() {
    markOnboardingStepReviewed(.permissions)
    accessibilityPermissionGateway.openAccessibilitySettings()
    status = "Opened Accessibility settings"
  }

  func requestMicrophonePermission() async {
    markOnboardingStepReviewed(.permissions)
    microphonePermissionStatus = await microphonePermissionGateway.requestAccess()
    status =
      microphonePermissionStatus.isGranted
      ? "Microphone permission granted"
      : "Microphone permission required"
    reconcileAmbientAudioCapture()
  }

  func openMicrophoneSettings() {
    markOnboardingStepReviewed(.permissions)
    microphonePermissionGateway.openMicrophoneSettings()
    status = "Opened Microphone settings"
  }

  func refreshDesktopPermissions() {
    refreshScreenRecordingPermission()
    accessibilityPermissionGranted = accessibilityPermissionGateway.hasAccessibilityPermission()
    microphonePermissionStatus = microphonePermissionGateway.authorizationStatus()
    reconcileAmbientAudioCapture()
  }

  func openFloatingBarFromOnboarding() {
    openFloatingBar()
    markOnboardingStepReviewed(.floatingBarDemo)
  }

  func reviewVoiceDemo() {
    selected = .settings
    markOnboardingStepReviewed(.voiceDemo)
    status =
      microphonePermissionStatus.isGranted
      ? "Voice path ready for local transcription"
      : "Microphone permission required for voice"
  }

  func runPushToTalkTurn() async {
    guard !voiceCaptureRunning else { return }
    refreshDesktopPermissions()
    guard microphonePermissionStatus.isGranted else {
      voiceStatus = "Microphone permission is required"
      status = "Microphone permission required for voice"
      return
    }

    voiceCaptureRunning = true
    voiceStatus = "Capturing a push-to-talk turn..."
    status = "Capturing voice"
    defer { voiceCaptureRunning = false }

    do {
      let transcript = try await pushToTalk.captureTranscript()
      applyDictation(transcript)
      objectWillChange.send()
    } catch {
      voiceStatus = error.localizedDescription
      status = "Voice turn failed: \(error.localizedDescription)"
    }
  }

  /// Places a dictated transcript into the composer for review instead of
  /// sending it. The user edits and sends normally (ADR-0007). A nil transcript
  /// means the turn contained no speech.
  private func applyDictation(_ transcript: String?) {
    guard let transcript else {
      voiceStatus = "No speech detected"
      status = "Voice turn ignored because no speech was detected"
      return
    }
    let existing = input.trimmingCharacters(in: .whitespacesAndNewlines)
    input = existing.isEmpty ? transcript : existing + " " + transcript
    voiceStatus = "Dictated: \(transcript)"
    status = "Dictation added to the composer for review"
  }

  /// The global push-to-talk shortcut is the "talk to the companion from
  /// anywhere" affordance, so its transcript is staged in the floating bar's
  /// composer for review (never sent — ADR-0007) rather than the main-window
  /// composer. A nil/empty transcript means the turn contained no speech.
  private func stageShortcutDictationInFloatingBar(_ transcript: String?) {
    guard let transcript,
      !transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else {
      voiceStatus = "No speech detected"
      status = "Voice turn ignored because no speech was detected"
      return
    }
    floatingBarManager.receiveDictation(transcript)
    voiceStatus = "Dictated: \(transcript)"
    status = "Dictation added to the floating bar for review"
  }

  private func configurePushToTalkShortcutMonitor() {
    pushToTalkShortcutMonitor.onShortcutEvent = { [weak self] event in
      Task { @MainActor [weak self] in
        self?.handlePushToTalkShortcutEvent(event)
      }
    }
    pushToTalkShortcutMonitor.start()
  }

  private func handlePushToTalkShortcutEvent(_ event: NativePushToTalkShortcutEvent) {
    let now = ProcessInfo.processInfo.systemUptime
    let actions: [PushToTalkShortcutAction]
    switch event {
    case .down:
      actions = pushToTalkShortcutStateMachine.shortcutDown(at: now)
    case .up:
      actions = pushToTalkShortcutStateMachine.shortcutUp(at: now)
    }
    voiceShortcutState = pushToTalkShortcutStateMachine.state
    performPushToTalkShortcutActions(actions)
  }

  private func performPushToTalkShortcutActions(_ actions: [PushToTalkShortcutAction]) {
    for action in actions {
      switch action {
      case .startRecording:
        startShortcutVoiceRecording()
      case .stopRecordingAndSend:
        stopShortcutVoiceRecordingAndSend()
      case .stopRecordingAndHoldForLock:
        stopShortcutVoiceRecordingForLockDecision()
      case .sendPendingRecording:
        sendPendingShortcutVoiceRecording()
      case .discardPendingRecording:
        pendingPushToTalkAudio = nil
      case .schedulePendingLockTimeout(let delay):
        schedulePendingPushToTalkLockTimeout(delay: delay)
      case .cancelPendingLockTimeout:
        pendingPushToTalkLockTask?.cancel()
        pendingPushToTalkLockTask = nil
      }
    }
    voiceShortcutState = pushToTalkShortcutStateMachine.state
  }

  private func startShortcutVoiceRecording() {
    refreshDesktopPermissions()
    guard accessibilityPermissionGranted else {
      voiceStatus = "Accessibility permission is required for the global Option shortcut"
      status = "Accessibility permission required for global push-to-talk"
      performPushToTalkShortcutActions(pushToTalkShortcutStateMachine.cancel())
      return
    }
    guard microphonePermissionStatus.isGranted else {
      voiceStatus = "Microphone permission is required"
      status = "Microphone permission required for voice"
      performPushToTalkShortcutActions(pushToTalkShortcutStateMachine.cancel())
      return
    }

    voiceCaptureRunning = true
    voiceStatus = pushToTalkShortcutStateMachine.state == .lockedListening
      ? "Voice locked. Tap Option again to send."
      : "Hold Option to talk..."
    status = "Capturing voice"

    Task { @MainActor [weak self] in
      guard let self else { return }
      do {
        try await pushToTalkRecorder.start()
      } catch {
        voiceCaptureRunning = false
        voiceStatus = error.localizedDescription
        status = "Voice turn failed: \(error.localizedDescription)"
        performPushToTalkShortcutActions(pushToTalkShortcutStateMachine.cancel())
      }
    }
  }

  private func stopShortcutVoiceRecordingAndSend() {
    pendingPushToTalkLockTask?.cancel()
    pendingPushToTalkLockTask = nil
    voiceStatus = "Finalizing voice turn..."
    voiceCaptureRunning = false

    Task { @MainActor [weak self] in
      guard let self else { return }
      do {
        let audio = try pushToTalkRecorder.stop()
        await processCapturedPushToTalkAudio(audio)
      } catch {
        finishPushToTalkShortcutAfterFailure(error)
      }
    }
  }

  private func stopShortcutVoiceRecordingForLockDecision() {
    voiceStatus = "Tap Option again to lock, or wait to send."
    voiceCaptureRunning = false

    Task { @MainActor [weak self] in
      guard let self else { return }
      do {
        pendingPushToTalkAudio = try pushToTalkRecorder.stop()
      } catch {
        finishPushToTalkShortcutAfterFailure(error)
      }
    }
  }

  private func sendPendingShortcutVoiceRecording() {
    pendingPushToTalkLockTask?.cancel()
    pendingPushToTalkLockTask = nil
    guard let audio = pendingPushToTalkAudio else {
      finishPushToTalkShortcutAfterFailure(NativeMicrophoneAudioCaptureError.noAudioCaptured)
      return
    }
    pendingPushToTalkAudio = nil
    voiceStatus = "Finalizing voice turn..."

    Task { @MainActor [weak self] in
      await self?.processCapturedPushToTalkAudio(audio)
    }
  }

  private func schedulePendingPushToTalkLockTimeout(delay: TimeInterval) {
    pendingPushToTalkLockTask?.cancel()
    pendingPushToTalkLockTask = Task { @MainActor [weak self] in
      let nanoseconds = UInt64(max(0, delay) * 1_000_000_000)
      try? await Task.sleep(nanoseconds: nanoseconds)
      guard let self, !Task.isCancelled else { return }
      performPushToTalkShortcutActions(pushToTalkShortcutStateMachine.pendingLockTimeout())
    }
  }

  private func processCapturedPushToTalkAudio(_ audio: Data) async {
    do {
      let transcript = try await pushToTalk.transcript(fromPCM16k: audio)
      stageShortcutDictationInFloatingBar(transcript)
      pushToTalkShortcutStateMachine.finishProcessing()
      voiceShortcutState = pushToTalkShortcutStateMachine.state
      voiceCaptureRunning = false
      objectWillChange.send()
    } catch {
      finishPushToTalkShortcutAfterFailure(error)
    }
  }

  private func finishPushToTalkShortcutAfterFailure(_ error: Error) {
    pushToTalkRecorder.cancel()
    pendingPushToTalkAudio = nil
    performPushToTalkShortcutActions(pushToTalkShortcutStateMachine.cancel())
    voiceCaptureRunning = false
    voiceStatus = error.localizedDescription
    status = "Voice turn failed: \(error.localizedDescription)"
  }

  func triggerEffect() {
    let message = CompanionMessage(
      messageId: "pmb-\(UUID().uuidString)",
      body: "Take a quick reset before the next desktop phase.",
      emittedAt: Date().protocolTimestamp,
      viaPostMessageBack: true
    )
    deliverEffect(message, runtimeClient: runtime, statusMessage: "Effect Runner delivered a local nudge")
  }

  func setCaptureEnabled(_ enabled: Bool) {
    var settings = compilerSettings
    settings.captureEnabled = enabled
    applyCompilerSettings(settings)

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
      status = eventPublished
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
    status = granted ? "Screen Recording permission granted" : "Screen Recording permission required"
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

  private func flushQueuedPerceptionEventsIfConnected(_ state: DesktopRuntimeSessionState) -> String? {
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
      return gate == .capturePermissionSetup ? "Screen Recording permission required" : "Gate required: \(gate.rawValue)"
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
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "desktop-dev"
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
    guard let value = environment("INTENTIVE_HOSTED_AUTH_URL") ?? environment("INTENTIVE_NEON_AUTH_URL") else {
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
    guard let value = ProcessInfo.processInfo.environment[key]?.trimmingCharacters(in: .whitespacesAndNewlines),
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
    .task {
      await model.restoreRuntimeSessionIfNeeded()
      await model.performCaptureLaunchReconciliation()
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
        Label(model.captureRunning ? "Stop Capture" : "Start Capture", systemImage: model.captureRunning ? "stop.circle" : "camera.viewfinder")
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
    case .home:
      HomeView(
        capture: model.toggleCapture,
        openFloatingBar: model.openFloatingBar,
        captureRunning: model.captureRunning,
        captureEnabled: model.compilerSettings.captureEnabled && !model.privacySnapshot.isPrivateMode,
        screenRecordingPermissionGranted: model.screenRecordingPermissionGranted
      )
    case .screenMemory:
      ScreenMemoryView(model: model, searchFocused: $searchFocused)
    case .settings:
      SettingsView(model: model)
    }
  }
}

private struct HomeView: View {
  let capture: () -> Void
  let openFloatingBar: () -> Void
  let captureRunning: Bool
  let captureEnabled: Bool
  let screenRecordingPermissionGranted: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 20) {
      Text("Intentive Desktop")
        .font(.largeTitle.bold())
      Text("Capture stays local. The Context Compiler publishes compact perception events, and Desktop joins the same Companion conversation as mobile.")
        .font(.body)
        .foregroundStyle(.secondary)
        .frame(maxWidth: 660, alignment: .leading)
      HStack {
        Button(action: capture) {
          Label(captureRunning ? "Stop Capture" : "Start Capture", systemImage: captureRunning ? "stop.circle" : "camera.viewfinder")
        }
        .disabled(!captureEnabled || !screenRecordingPermissionGranted)
        Button(action: openFloatingBar) {
          Label("Open Floating Bar", systemImage: "text.bubble")
        }
      }
      Spacer()
    }
    .padding(28)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
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
          .accessibilityIdentifier(result.recordID.map(ScreenMemoryAccessibilityID.frame) ?? result.record.id)
        }
        .accessibilityIdentifier(ScreenMemoryAccessibilityID.filmstrip)
      }
    }
    .padding(18)
    .onAppear { model.refreshScreenMemorySearch() }
    .onChange(of: model.query) { model.refreshScreenMemorySearch() }
  }
}

private struct FloatingChatView: View {
  @ObservedObject var model: DesktopViewModel

  var body: some View {
    VStack(spacing: 12) {
      HStack {
        Spacer()
        Button(action: model.openFloatingBar) {
          Label("Open Floating Bar", systemImage: "text.bubble")
        }
      }
      .padding([.horizontal, .top])

      ScrollView {
        LazyVStack(alignment: .leading, spacing: 10) {
          ForEach(model.messages) { message in
            HStack {
              if message.author == .companion {
                bubble(message, alignment: .leading)
                Spacer(minLength: 80)
              } else {
                Spacer(minLength: 80)
                bubble(message, alignment: .trailing)
              }
            }
          }
        }
        .padding()
      }
      HStack {
        TextField("Ask Intentive", text: $model.input)
          .textFieldStyle(.roundedBorder)
          .onSubmit(model.sendMessage)
        Button(action: model.sendMessage) {
          Image(systemName: "paperplane.fill")
        }
        .buttonStyle(.borderedProminent)
      }
      .padding([.horizontal, .bottom])
    }
  }

  private func bubble(_ message: ChatMessage, alignment: HorizontalAlignment) -> some View {
    VStack(alignment: alignment, spacing: 4) {
      Text(message.body)
      Text(message.author.rawValue.capitalized)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
    .padding(10)
    .background(message.author == .companion ? Color(nsColor: .controlBackgroundColor) : Color.accentColor.opacity(0.18))
    .clipShape(RoundedRectangle(cornerRadius: 8))
  }
}

private struct EffectsView: View {
  @ObservedObject var model: DesktopViewModel

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Button(action: model.triggerEffect) {
        Label("Trigger PMB Nudge", systemImage: "bell.badge")
      }
      List(model.effectLog, id: \.self) { item in
        Text(item)
      }
    }
    .padding(20)
  }
}

private struct SettingsView: View {
  @ObservedObject var model: DesktopViewModel

  var body: some View {
    Form {
      Section("General") {
        Toggle(
          "Screen Memory",
          isOn: Binding(
            get: { model.compilerSettings.captureEnabled },
            set: model.setCaptureEnabled
          )
        )
      }

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
            systemImage: model.screenRecordingPermissionGranted ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
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
          "Privacy Zones",
          text: Binding(
            get: { model.excludedAppsText },
            set: model.updateExcludedAppsText
          )
        )
      }

      Section("About") {
        Text("Intentive Desktop")
      }
    }
    .padding(24)
  }
}
