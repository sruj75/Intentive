import AppKit
import ApplicationServices
import Combine
import Carbon.HIToolbox.Events
import IntentiveDesktopCore
import IntentiveDesktopNativeAssets
import IntentiveDesktopPresentation
import UserNotifications

@MainActor
final class IntentiveDesktopPresentationAdapter: @preconcurrency ObservableObject {
  let objectWillChange = ObservableObjectPublisher()
  private let model: DesktopViewModel
  private var observation: AnyCancellable?
  @Published private var notificationsAuthorizedState = false
  @Published private var accessibilityGrantedState = AXIsProcessTrusted()
  private var shortcutMonitor: Any?

  init(model: DesktopViewModel) {
    self.model = model
    observation = model.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
    refreshNotificationAuthorization()
  }

  private var notificationCenter: UNUserNotificationCenter? {
    // UserNotifications requires a real application bundle identity. Keep the
    // presentation adapter safe when embedded in tests or other unbundled hosts.
    guard Bundle.main.bundleIdentifier != nil else { return nil }
    return UNUserNotificationCenter.current()
  }

  private func refreshNotificationAuthorization() {
    guard let notificationCenter else {
      notificationsAuthorizedState = false
      return
    }
    notificationCenter.getNotificationSettings { [weak self] settings in
      Task { @MainActor in self?.notificationsAuthorizedState = settings.authorizationStatus == .authorized }
    }
  }
}

extension IntentiveDesktopPresentationAdapter: IntentiveSettingsPresenting {
  var selectedSettingsSection: IntentiveSettingsSection {
    get {
      switch model.selected {
      case .general: .general
      case .rewind: .rewind
      case .privacy: .privacy
      case .about: .about
      }
    }
    set {
      model.selected = switch newValue {
      case .general: .general
      case .rewind: .rewind
      case .privacy: .privacy
      case .about: .about
      }
      model.persistSelectedUtilitySection(model.selected)
    }
  }

  var screenCaptureEnabled: Bool {
    get { model.compilerSettings.captureEnabled }
    set { model.setCaptureEnabled(newValue) }
  }

  var audioRecordingEnabled: Bool {
    get { model.compilerSettings.ambientAudioCaptureEnabled }
    set { model.setAmbientAudioCaptureEnabled(newValue) }
  }

  var systemAudioMode: IntentiveSystemAudioMode {
    get {
      switch model.utilitySettings.systemAudioMode {
      case .never: .never
      case .onlyDuringMeetings: .meetings
      case .always: .always
      }
    }
    set {
      let mode: SystemAudioCaptureMode = switch newValue {
      case .never: .never
      case .meetings: .onlyDuringMeetings
      case .always: .always
      }
      model.setSystemAudioMode(mode)
    }
  }

  var notificationsAuthorized: Bool { notificationsAuthorizedState }
  var launchAtLogin: Bool {
    get { model.utilitySettings.launchAtLogin }
    set { model.setLaunchAtLogin(newValue) }
  }
  func requestNotificationPermission() {
    guard let notificationCenter else { return }
    notificationCenter.requestAuthorization(options: [.alert, .badge, .sound]) { [weak self] _, _ in
      Task { @MainActor in self?.refreshNotificationAuthorization() }
    }
  }

  var floatingBarShortcut: String {
    get { model.utilitySettings.floatingBarShortcut }
    set { model.setFloatingBarShortcut(newValue) }
  }

  var analyticsEnabled: Bool {
    get { model.utilitySettings.analyticsEnabled }
    set { model.setAnalyticsEnabled(newValue) }
  }

  func recordCustomShortcut() {
    if let shortcutMonitor { NSEvent.removeMonitor(shortcutMonitor); self.shortcutMonitor = nil }
    model.status = "Press your custom shortcut"
    shortcutMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
      guard let self else { return event }
      var carbon: UInt32 = 0
      var tokens: [String] = []
      if event.modifierFlags.contains(.shift) { carbon |= UInt32(shiftKey); tokens.append("⇧") }
      if event.modifierFlags.contains(.control) { carbon |= UInt32(controlKey); tokens.append("⌃") }
      if event.modifierFlags.contains(.option) { carbon |= UInt32(optionKey); tokens.append("⌥") }
      if event.modifierFlags.contains(.command) { carbon |= UInt32(cmdKey); tokens.append("⌘") }
      let key = switch Int(event.keyCode) {
      case kVK_Return: "↩"
      case kVK_Space: "Space"
      default: event.charactersIgnoringModifiers?.uppercased() ?? "Key"
      }
      tokens.append(key)
      Task { @MainActor in
        guard GlobalShortcutSafety.isSafe(
          keyCode: UInt32(event.keyCode), carbonModifiers: carbon)
        else {
          self.model.status = "Global shortcuts need at least two modifiers. Try ⌘ ⇧ Return."
          if let monitor = self.shortcutMonitor {
            NSEvent.removeMonitor(monitor)
            self.shortcutMonitor = nil
          }
          return
        }
        self.model.setFloatingBarShortcut("custom:\(event.keyCode):\(carbon):\(tokens.joined(separator: ","))")
        if let monitor = self.shortcutMonitor { NSEvent.removeMonitor(monitor); self.shortcutMonitor = nil }
      }
      return nil
    }
  }

  var storageSummary: String {
    guard let storage = model.timelineState?.storage else { return "Local storage" }
    return "\(model.timelineState?.frames.count ?? 0) records · \(ByteCountFormatter.string(fromByteCount: storage.totalBytes, countStyle: .file))"
  }

  var rewindQuery: String {
    get { model.query }
    set { model.query = newValue }
  }

  var rewindSelectedDate: String {
    guard let date = model.timelineState?.selectedDate else { return "Today" }
    let formatter = DateFormatter()
    formatter.dateStyle = .medium
    formatter.timeStyle = .none
    return formatter.string(from: date)
  }

  var rewindFrames: [IntentiveRewindFrame] {
    (model.timelineState?.frames ?? []).map {
      IntentiveRewindFrame(
        id: $0.id,
        appName: $0.appName,
        windowTitle: $0.windowTitle,
        capturedAt: $0.capturedAt
      )
    }
  }

  var rewindSelectedFrameID: String? {
    model.timelineState?.selectedRecordID?.value.uuidString
  }

  var rewindSelectedFrameData: Data? { model.currentFrameData }
  var rewindSelectedOCRText: String { model.selectedTimelineRecord?.ocrText ?? "" }
  var rewindSelectedOCRMatches: [String] { model.selectedOCRMatches.map(\.text) }
  var rewindAvailableApps: [String] { model.timelineState?.availableApps ?? [] }
  var rewindSelectedApp: String? { model.timelineState?.selectedApp }
  var rewindIsPlaying: Bool { model.screenMemoryPlaying }

  func submitRewindSearch() { model.refreshScreenMemorySearch() }
  func moveRewindDay(_ offset: Int) { model.moveScreenMemoryDay(offset) }
  func filterRewind(app: String?) { model.filterScreenMemory(app: app) }
  func selectRewindFrame(id: String) {
    guard let record = model.timelineState?.frames.first(where: { $0.id == id }) else { return }
    model.selectScreenMemory(record)
  }
  func stepRewind(_ direction: Int) { model.stepScreenMemory(direction) }
  func toggleRewindPlayback() { model.toggleScreenMemoryPlayback() }
  func deleteSelectedRewindFrame() {
    Task { @MainActor [weak self] in
      _ = await self?.model.deleteSelectedScreenMemory(confirmChunkDeletion: true)
    }
  }
  func clearRewindLocalData() { model.clearLocalData() }

  var excludedApplications: [IntentiveRunningApplication] {
    model.privacySnapshot.excludedApplications.map {
      IntentiveRunningApplication(bundleID: $0.bundleID, name: $0.displayName)
    }.sorted {
      $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
    }
  }

  var runningApplications: [IntentiveRunningApplication] {
    var seen = Set<String>()
    return NSWorkspace.shared.runningApplications.compactMap { app in
      guard let name = app.localizedName, !name.isEmpty else { return nil }
      let application = IntentiveRunningApplication(bundleID: app.bundleIdentifier, name: name)
      guard seen.insert(application.id).inserted else { return nil }
      return application
    }.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
  }

  func addExcludedApplication(_ application: IntentiveRunningApplication) {
    model.excludeApplication(bundleID: application.bundleID, displayName: application.name)
  }

  func addExcludedApplication(displayName: String) {
    model.excludeApplication(bundleID: nil, displayName: displayName)
  }

  func removeExcludedApplication(_ application: IntentiveRunningApplication) {
    model.includeApplication(bundleID: application.bundleID, displayName: application.name)
  }

  func resetExcludedApplications() {
    model.resetExcludedApplications()
  }

  var retentionDays: Int {
    get { model.utilitySettings.retentionDays }
    set { model.setRetentionDays(newValue) }
  }

  var storeRecordings: Bool {
    get { model.utilitySettings.storeRecordings }
    set { model.setStoreRecordings(newValue) }
  }

  var updateStatus: String { model.status }
  var automaticallyChecksForUpdates: Bool {
    get { model.utilitySettings.automaticallyChecksForUpdates }
    set { model.setAutomaticUpdateChecks(newValue) }
  }
  var automaticallyDownloadsUpdates: Bool {
    get { model.utilitySettings.automaticallyDownloadsUpdates }
    set { model.setAutomaticUpdateDownloads(newValue) }
  }
  var versionText: String {
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "Development"
    let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
    return build.map { "Version \(version) (\($0))" } ?? "Version \(version)"
  }
  var reportIssueAvailable: Bool { true }
  func checkForUpdates() { model.checkForUpdates() }
  func reportIssue() { FeedbackWindow.show(model: model) }
}

extension IntentiveDesktopPresentationAdapter: IntentiveSetupPresenting {
  var isAuthenticated: Bool { model.onboardingRequirements.isAuthenticated }
  var crossClientSetupComplete: Bool { model.onboardingRequirements.crossClientSetupComplete }
  var authenticationLoading: Bool {
    switch model.runtimeState {
    case .checkingAccount, .registeringDevice, .routing, .connecting: true
    default: false
    }
  }
  var authenticationError: String? {
    if case .failed(let message) = model.runtimeState { return message }
    return nil
  }
  var setupStep: IntentiveSetupStep {
    switch model.onboardingRequirements.nextIncompleteStep ?? .floatingBarDemo {
    case .trust: .trust
    case .screenRecording: .screenRecording
    case .microphone: .microphone
    case .accessibility: .accessibility
    case .floatingBarShortcut: .floatingBarShortcut
    case .floatingBarDemo: .floatingBarDemo
    }
  }
  var screenRecordingGranted: Bool { model.screenRecordingPermissionGranted }
  var microphoneGranted: Bool { model.microphonePermissionStatus.isGranted }
  var accessibilityGranted: Bool { accessibilityGrantedState }
  var shortcutLabel: String {
    switch model.utilitySettings.floatingBarShortcut {
    case "command+shift+return": "⇧ ⌘ ↩"
    case "command+shift+space": "⌘ ⇧ Space"
    case "disabled": "Disabled"
    default: "⇧ ⌘ ↩"
    }
  }

  func signIn() {
    Task { await model.signInAndConnectRuntime() }
  }
  func cancelSignIn() { model.cancelSignIn() }

  func completeCurrentSetupStep() {
    switch setupStep {
    case .trust: model.markOnboardingStepReviewed(.trust)
    case .screenRecording: model.decideScreenRecording(.granted)
    case .microphone: model.decideAudio(.granted)
    case .accessibility: model.markOnboardingStepReviewed(.accessibility)
    case .floatingBarShortcut: model.markOnboardingStepReviewed(.floatingBarShortcut)
    case .floatingBarDemo:
      model.markOnboardingStepReviewed(.floatingBarDemo)
      model.finishOnboarding()
    }
  }

  func skipCurrentSetupStep() {
    switch setupStep {
    case .screenRecording: model.decideScreenRecording(.deferred)
    case .microphone: model.decideAudio(.deferred)
    case .accessibility: model.markOnboardingStepReviewed(.accessibility)
    case .floatingBarShortcut: model.markOnboardingStepReviewed(.floatingBarShortcut)
    case .floatingBarDemo:
      model.markOnboardingStepReviewed(.floatingBarDemo)
      model.finishOnboarding()
    case .trust: break
    }
  }

  func requestScreenRecording() { model.requestOnboardingScreenRecordingPermission() }
  func openScreenRecordingSettings() { model.openOnboardingScreenRecordingSettings() }
  func refreshSetupPermissions() {
    model.refreshOnboardingPermissions()
    accessibilityGrantedState = AXIsProcessTrusted()
  }
  func requestMicrophone() { Task { await model.requestMicrophonePermission() } }
  func openMicrophoneSettings() { model.openMicrophoneSettings() }
  func requestAccessibility() {
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    accessibilityGrantedState = AXIsProcessTrustedWithOptions(options)
  }
  func openAccessibilitySettings() {
    guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") else { return }
    NSWorkspace.shared.open(url)
  }
  func openFloatingBar() { model.openFloatingBarFromOnboarding() }
}
