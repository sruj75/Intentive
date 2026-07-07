import IntentiveDesktopCore
import IntentiveDesktopNativeAdapters
import IntentiveDesktopNativeAssets
import SwiftUI

private enum DesktopSection: String, CaseIterable, Identifiable {
  case home = "Home"
  case screenMemory = "Screen Memory"
  case chat = "Floating Chat"
  case voice = "Voice"
  case effects = "Effects"
  case settings = "Settings"

  var id: String { rawValue }

  var symbol: String {
    switch self {
    case .home: return "rectangle.grid.2x2"
    case .screenMemory: return "clock.arrow.circlepath"
    case .chat: return "text.bubble"
    case .voice: return "waveform"
    case .effects: return "bell.badge"
    case .settings: return "gearshape"
    }
  }
}

@MainActor
private final class DesktopViewModel: ObservableObject {
  @Published var selected: DesktopSection = .home
  @Published var query = ""
  @Published var input = ""
  @Published var status: String
  @Published var effectLog: [String] = []
  @Published var captureRunning = false
  @Published var compilerSettings: CompilerSettings
  @Published var excludedAppsText: String
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
  private let permissionGateway: any ScreenRecordingPermissionGateway
  private let accessibilityPermissionGateway: any DesktopAccessibilityPermissionGateway
  private let microphonePermissionGateway: any DesktopMicrophonePermissionGateway
  private let onboardingStore: any DesktopOnboardingProgressStore
  private let notificationSink = UserNotificationDesktopSink()
  private let alreadyAcknowledgedRuntimeClient = AlreadyAcknowledgedRuntimeClient()
  private let runtimeSocket = URLSessionRuntimeSocket()
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
  private lazy var floatingBarPresenter = IntentiveFloatingBarPresenter(controller: floatingBarController)
  private lazy var pushToTalk = PushToTalkManager(
    audioCapture: NativeMicrophoneAudioCaptureService(),
    voiceGate: PushToTalkVoiceActivityGate(vad: SileroPushToTalkVADPredictor()),
    transcription: FluidAudioLocalTranscriptionService(),
    runtimeClient: runtime
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
    publisher: publisher
  )
  private lazy var captureLoop = ScreenMemoryCaptureLoop(
    coordinator: capture,
    source: captureSource,
    settingsProvider: { [weak self] in self?.compilerSettings ?? CompilerSettings(captureEnabled: false) },
    permissionProvider: { [weak self] in self?.screenRecordingPermissionGranted ?? false }
  )

  var messages: [ChatMessage] {
    messageStore.messages
  }

  var searchResults: [ScreenMemorySearchResult] {
    screenMemory.search(query, limit: 24)
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
    settingsStore: any ScreenMemorySettingsStore = UserDefaultsScreenMemorySettingsStore(),
    permissionGateway: any ScreenRecordingPermissionGateway = NativeScreenRecordingPermissionGateway(),
    accessibilityPermissionGateway: any DesktopAccessibilityPermissionGateway = NativeAccessibilityPermissionGateway(),
    microphonePermissionGateway: any DesktopMicrophonePermissionGateway = NativeMicrophonePermissionGateway(),
    onboardingStore: any DesktopOnboardingProgressStore = UserDefaultsDesktopOnboardingProgressStore()
  ) {
    self.settingsStore = settingsStore
    self.permissionGateway = permissionGateway
    self.accessibilityPermissionGateway = accessibilityPermissionGateway
    self.microphonePermissionGateway = microphonePermissionGateway
    self.onboardingStore = onboardingStore
    let settings = settingsStore.load()
    let progress = onboardingStore.load()
    let screenRecordingPermissionGranted = permissionGateway.hasScreenRecordingPermission()
    let accessibilityPermissionGranted = accessibilityPermissionGateway.hasAccessibilityPermission()
    let microphonePermissionStatus = microphonePermissionGateway.authorizationStatus()
    compilerSettings = settings
    excludedAppsText = Self.renderExcludedApps(settings.excludedApps)
    self.screenRecordingPermissionGranted = screenRecordingPermissionGranted
    self.accessibilityPermissionGranted = accessibilityPermissionGranted
    self.microphonePermissionStatus = microphonePermissionStatus
    onboardingProgress = progress
    showOnboarding =
      !DesktopOnboardingRequirements(
        progress: progress,
        screenRecordingPermissionGranted: screenRecordingPermissionGranted,
        accessibilityPermissionGranted: accessibilityPermissionGranted,
        microphonePermissionGranted: microphonePermissionStatus.isGranted
      ).isComplete

    let initialScreenMemory = Self.makeScreenMemoryStore(userID: nil)
    screenMemory = SwitchableScreenMemoryStore(initialScreenMemory.store)
    status = initialScreenMemory.status
    configureRuntimeSocketCallbacks()
    configurePushToTalkShortcutMonitor()
  }

  func restoreRuntimeSessionIfNeeded() async {
    guard !runtimeRestoreAttempted else { return }
    runtimeRestoreAttempted = true
    await restoreRuntimeSession()
  }

  func restoreRuntimeSession() async {
    status = "Restoring Runtime session..."
    let state = await runtimeSession.restoreAndConnect()
    applyRuntimeState(state)
  }

  func signInAndConnectRuntime() async {
    status = "Connecting Runtime..."
    let state = await runtimeSession.signInAndConnect()
    applyRuntimeState(state)
  }

  func captureCurrentScreen() async {
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
    floatingBarPresenter.show()
    status = "Floating bar open"
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
  }

  func openFloatingBarFromOnboarding() {
    openFloatingBar()
    markOnboardingStepReviewed(.floatingBarDemo)
  }

  func reviewVoiceDemo() {
    selected = .voice
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
    voiceStatus = "Listening for a push-to-talk turn..."
    status = "Listening for voice"
    defer { voiceCaptureRunning = false }

    do {
      let message = try await pushToTalk.captureAndSend()
      if let message {
        voiceStatus =
          runtime.status == .connected
          ? "Sent: \(message.body)"
          : "Queued: \(message.body)"
        status =
          runtime.status == .connected
          ? "Voice turn sent to Runtime Bridge"
          : "Voice turn queued until Runtime connects"
      } else {
        voiceStatus = "No speech detected"
        status = "Voice turn ignored because no speech was detected"
      }
      objectWillChange.send()
    } catch {
      voiceStatus = error.localizedDescription
      status = "Voice turn failed: \(error.localizedDescription)"
    }
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
    status = "Listening for voice"

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
      let message = try await pushToTalk.processAndSend(pcm16k: audio)
      if let message {
        voiceStatus =
          runtime.status == .connected
          ? "Sent: \(message.body)"
          : "Queued: \(message.body)"
        status =
          runtime.status == .connected
          ? "Voice turn sent to Runtime Bridge"
          : "Voice turn queued until Runtime connects"
      } else {
        voiceStatus = "No speech detected"
        status = "Voice turn ignored because no speech was detected"
      }
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
      if captureLoop.state.isRunning {
        captureLoop.stop()
      }
      captureRunning = false
      status = "Screen Memory is off"
    }
  }

  func updateExcludedAppsText(_ text: String) {
    excludedAppsText = text
    var settings = compilerSettings
    settings.excludedApps = Self.parseExcludedApps(text)
    applyCompilerSettings(settings)
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
    guard message.viaPostMessageBack else { return }
    deliverEffect(
      message,
      runtimeClient: alreadyAcknowledgedRuntimeClient,
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
      floatingBarPresenter.refreshMessages()
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
      notifications: notificationSink,
      overlay: FloatingBarOverlaySink(presenter: floatingBarPresenter),
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
      return flushed > 0 ? "synced \(flushed) queued perception event(s)" : nil
    } catch {
      return "perception sync pending: \(error.localizedDescription)"
    }
  }

  private func reconfigureScreenMemoryForAuthenticatedUserIfNeeded() -> String? {
    let userID = runtimeSession.accountState?.userId
    let sanitizedUserID = DesktopLocalProfile.sanitizedUserID(userID)
    guard sanitizedUserID != screenMemoryProfileUserID else { return nil }

    let newScreenMemory = Self.makeScreenMemoryStore(userID: userID)
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

  private static func makeScreenMemoryStore(userID: String?) -> (store: ScreenMemoryStore, status: String) {
    do {
      let databaseURL = try SQLiteScreenMemoryStore.applicationSupportURL(userID: userID)
      let store = try SQLiteScreenMemoryStore(databaseURL: databaseURL)
      do {
        let importResult = try LegacyScreenMemoryImporter()
          .importFirstAvailableSource(userID: userID, into: store, limit: 2_000)
        let status =
          importResult.importedCount > 0
          ? "Local Screen Memory ready · imported \(importResult.importedCount) local history record(s)"
          : "Local Screen Memory ready"
        return (store, status)
      } catch {
        return (store, "Local Screen Memory ready · legacy import skipped: \(error.localizedDescription)")
      }
    } catch {
      return (InMemoryScreenMemoryStore(), "Screen Memory fallback: \(error.localizedDescription)")
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
  @StateObject private var model = DesktopViewModel()
  @FocusState private var searchFocused: Bool

  var body: some View {
    NavigationSplitView {
      List(selection: $model.selected) {
        Section("Desktop") {
          ForEach(DesktopSection.allCases) { section in
            Label(section.rawValue, systemImage: section.symbol)
              .tag(section)
          }
        }
      }
      .navigationSplitViewColumnWidth(min: 210, ideal: 230, max: 260)
    } detail: {
      VStack(spacing: 0) {
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
    .sheet(isPresented: $model.showOnboarding) {
      DesktopOnboardingSheet(
        progress: model.onboardingProgress,
        requirements: model.onboardingRequirements,
        screenRecordingPermissionGranted: model.screenRecordingPermissionGranted,
        accessibilityPermissionGranted: model.accessibilityPermissionGranted,
        microphonePermissionStatus: model.microphonePermissionStatus,
        markStepReviewed: model.markOnboardingStepReviewed,
        requestScreenRecordingPermission: model.requestOnboardingScreenRecordingPermission,
        openScreenRecordingSettings: model.openOnboardingScreenRecordingSettings,
        requestAccessibilityPermission: model.requestAccessibilityPermission,
        openAccessibilitySettings: model.openAccessibilitySettings,
        requestMicrophonePermission: {
          Task {
            await model.requestMicrophonePermission()
          }
        },
        openMicrophoneSettings: model.openMicrophoneSettings,
        refreshPermissions: model.refreshDesktopPermissions,
        previewNotification: model.triggerEffect,
        openFloatingBar: model.openFloatingBarFromOnboarding,
        reviewVoiceDemo: model.reviewVoiceDemo,
        finishLater: model.finishOnboardingLater,
        finish: model.finishOnboarding
      )
    }
    .task {
      await model.restoreRuntimeSessionIfNeeded()
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
      Button {
        model.presentOnboarding()
      } label: {
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
      .disabled(!model.compilerSettings.captureEnabled || !model.screenRecordingPermissionGranted)
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
        captureEnabled: model.compilerSettings.captureEnabled,
        screenRecordingPermissionGranted: model.screenRecordingPermissionGranted
      )
    case .screenMemory:
      ScreenMemoryView(model: model, searchFocused: $searchFocused)
    case .chat:
      FloatingChatView(model: model)
    case .voice:
      VoiceView(model: model)
    case .effects:
      EffectsView(model: model)
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
    let results = model.searchResults
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        Image(systemName: "magnifyingglass")
          .foregroundStyle(.secondary)
        TextField("Search Screen Memory", text: $model.query)
          .textFieldStyle(.plain)
          .focused(searchFocused)
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
      } else {
        List(results, id: \.record.id) { result in
          VStack(alignment: .leading, spacing: 4) {
            HStack {
              Text(result.record.appName)
                .font(.headline)
              Spacer()
              Text(result.record.capturedAt)
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Text(result.record.summary)
              .foregroundStyle(.secondary)
          }
          .padding(.vertical, 6)
        }
      }
    }
    .padding(18)
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

private struct VoiceView: View {
  @ObservedObject var model: DesktopViewModel

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack(alignment: .center) {
        Label("Push-to-talk", systemImage: "waveform")
          .font(.title2)
        Spacer()
        VStack(alignment: .trailing, spacing: 4) {
          Label(
            model.accessibilityPermissionGranted ? "Shortcut Ready" : "Shortcut Permission Required",
            systemImage: model.accessibilityPermissionGranted
              ? "keyboard.badge.checkmark"
              : "keyboard.badge.exclamationmark"
          )
          .foregroundStyle(model.accessibilityPermissionGranted ? .green : .orange)
          Label(
            model.microphonePermissionStatus.label,
            systemImage: model.microphonePermissionStatus.systemImage
          )
          .foregroundStyle(model.microphonePermissionStatus.isGranted ? .green : .orange)
        }
      }

      VStack(alignment: .leading, spacing: 10) {
        HStack(spacing: 10) {
          Button {
            Task {
              await model.runPushToTalkTurn()
            }
          } label: {
            Label(model.voiceCaptureRunning ? "Listening" : "Record Voice Turn", systemImage: model.voiceCaptureRunning ? "stop.circle" : "mic.circle")
          }
          .buttonStyle(.borderedProminent)
          .disabled(model.voiceCaptureRunning || !model.microphonePermissionStatus.isGranted)

          Button {
            Task {
              await model.requestMicrophonePermission()
            }
          } label: {
            Label("Request Access", systemImage: "mic")
          }
          .disabled(model.microphonePermissionStatus.isGranted)

          Button(action: model.openMicrophoneSettings) {
            Label("Open Settings", systemImage: "gearshape")
          }

          Button(action: model.requestAccessibilityPermission) {
            Label("Enable Shortcut", systemImage: "option")
          }
          .disabled(model.accessibilityPermissionGranted)
        }

        HStack(spacing: 10) {
          ProgressView()
            .controlSize(.small)
            .opacity(model.voiceCaptureRunning ? 1 : 0)
          Text(model.voiceStatus)
            .foregroundStyle(.secondary)
            .lineLimit(2)
            .textSelection(.enabled)
        }

        HStack(spacing: 8) {
          Label("Hold Option to talk", systemImage: "option")
          Text("Double-tap Option to lock")
            .foregroundStyle(.secondary)
          Spacer()
          Text(model.voiceShortcutState == .idle ? "Idle" : "Active")
            .font(.caption)
            .foregroundStyle(model.voiceShortcutState == .idle ? Color.secondary : Color.green)
        }
        .font(.caption)
        .opacity(model.accessibilityPermissionGranted ? 1 : 0.55)
      }

      VStack(alignment: .leading, spacing: 8) {
        Label("Local path", systemImage: "lock.shield")
          .font(.headline)
        Text("Mic audio is captured locally, screened by voice activity detection, transcribed on-device, and sent as a normal Runtime message.")
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
      }

      Spacer()
    }
    .padding(24)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
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
        Button(action: model.presentOnboarding) {
          Label("Open Desktop Setup", systemImage: "checklist")
        }
      }

      Section("Privacy") {
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

        HStack {
          Label("Accessibility", systemImage: "keyboard.badge.checkmark")
          Spacer()
          Label(
            model.accessibilityPermissionGranted ? "Granted" : "Required",
            systemImage: model.accessibilityPermissionGranted ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
          )
          .foregroundStyle(model.accessibilityPermissionGranted ? .green : .orange)
        }

        HStack {
          Button(action: model.requestAccessibilityPermission) {
            Label("Request Access", systemImage: "option")
          }
          Button(action: model.openAccessibilitySettings) {
            Label("Open System Settings", systemImage: "gearshape")
          }
          Button(action: model.refreshDesktopPermissions) {
            Label("Refresh", systemImage: "arrow.clockwise")
          }
        }

        HStack {
          Label("Microphone", systemImage: "mic")
          Spacer()
          Label(
            model.microphonePermissionStatus.label,
            systemImage: model.microphonePermissionStatus.systemImage
          )
          .foregroundStyle(model.microphonePermissionStatus.isGranted ? .green : .orange)
        }

        HStack {
          Button {
            Task {
              await model.requestMicrophonePermission()
            }
          } label: {
            Label("Request Access", systemImage: "mic")
          }
          Button(action: model.openMicrophoneSettings) {
            Label("Open System Settings", systemImage: "gearshape")
          }
          Button(action: model.refreshDesktopPermissions) {
            Label("Refresh", systemImage: "arrow.clockwise")
          }
        }

        TextField(
          "Excluded apps",
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
