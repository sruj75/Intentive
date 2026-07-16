import AppKit
import ApplicationServices
import AVFoundation
import IntentiveDesktopCore
import IntentiveDesktopNativeAssets
import SwiftUI

enum DesktopMicrophonePermissionStatus: Equatable {
  case notDetermined, granted, denied, restricted, unknown

  var isGranted: Bool { self == .granted }
  var label: String {
    switch self {
    case .notDetermined: "Not requested"
    case .granted: "Granted"
    case .denied: "Denied"
    case .restricted: "Restricted"
    case .unknown: "Unknown"
    }
  }
}

protocol DesktopMicrophonePermissionGateway {
  func authorizationStatus() -> DesktopMicrophonePermissionStatus
  func requestAccess() async -> DesktopMicrophonePermissionStatus
  func openMicrophoneSettings()
}

struct NativeMicrophonePermissionGateway: DesktopMicrophonePermissionGateway {
  func authorizationStatus() -> DesktopMicrophonePermissionStatus {
    switch AVCaptureDevice.authorizationStatus(for: .audio) {
    case .notDetermined: .notDetermined
    case .authorized: .granted
    case .denied: .denied
    case .restricted: .restricted
    @unknown default: .unknown
    }
  }

  func requestAccess() async -> DesktopMicrophonePermissionStatus {
    await withCheckedContinuation { continuation in
      AVCaptureDevice.requestAccess(for: .audio) { granted in
        continuation.resume(returning: granted ? .granted : authorizationStatus())
      }
    }
  }

  func openMicrophoneSettings() {
    guard let url = URL(
      string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")
    else { return }
    NSWorkspace.shared.open(url)
  }
}

protocol DesktopAccessibilityPermissionGateway {
  func hasAccessibilityPermission() -> Bool
  func requestAccessibilityPermission() -> Bool
  func openAccessibilitySettings()
}

struct NativeAccessibilityPermissionGateway: DesktopAccessibilityPermissionGateway {
  func hasAccessibilityPermission() -> Bool { AXIsProcessTrusted() }

  func requestAccessibilityPermission() -> Bool {
    let options = [
      kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true
    ] as CFDictionary
    return AXIsProcessTrustedWithOptions(options)
  }

  func openAccessibilitySettings() {
    guard let url = URL(
      string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
    else { return }
    NSWorkspace.shared.open(url)
  }
}

/// Intentive's bounded adaptation of Omi's ordered onboarding scaffold. The
/// progress rail, focused page, explicit skip actions, and resumable state are
/// preserved; Omi's provider, notification, voice, PTT, import, and paid steps
/// are deliberately absent.
struct DesktopOnboardingSheet: View {
  @ObservedObject var model: DesktopViewModel
  @State private var selectedStep: DesktopOnboardingStep = .valuePrivacy

  var body: some View {
    page
    .frame(minWidth: 920, minHeight: 620)
    .interactiveDismissDisabled()
    .onAppear {
      selectedStep = model.onboardingRequirements.nextIncompleteStep ?? .ready
      model.refreshOnboardingPermissions()
    }
  }

  private var page: some View {
    OnboardingStepScaffold(
      stepIndex: stepIndex,
      totalSteps: DesktopOnboardingStep.allCases.count,
      eyebrow: selectedStep.eyebrow,
      title: selectedStep.title,
      description: selectedStep.detail,
      layoutMode: selectedStep == .valuePrivacy || selectedStep == .ready ? .centered : .split,
      showsSkip: selectedStep == .screenRecording || selectedStep == .audioConsent,
      onSkip: skipSelectedStep
    ) {
      VStack(alignment: .leading, spacing: 22) { stepContent }
        .frame(maxWidth: 560, alignment: .leading)
    }
  }

  @ViewBuilder private var stepContent: some View {
    switch selectedStep {
    case .valuePrivacy:
      points([
        ("lock.shield", "Raw screenshots, video, thumbnails, and audio stay on this Mac."),
        ("brain.head.profile", "Only permitted text, metadata, and compact summaries reach your Companion."),
        ("hand.raised", "Private Mode stops screen, microphone, and system-audio sensing immediately."),
      ])
      primary("Continue") { completeAndAdvance(.valuePrivacy) }

    case .authentication:
      points([("person.crop.circle.badge.checkmark", "Sign in to join the same Runtime-owned Companion conversation used by your other devices.")])
      if model.onboardingRequirements.isAuthenticated {
        primary("Continue") { advance() }
      } else {
        primary("Sign In") { Task { await model.signInAndConnectRuntime() } }
      }

    case .screenRecording:
      permissionStatus("Screen Recording", granted: model.screenRecordingPermissionGranted)
      HStack {
        primary("Request Access") { model.requestOnboardingScreenRecordingPermission() }
        Button("System Settings", action: model.openOnboardingScreenRecordingSettings)
        Button("Refresh", action: model.refreshOnboardingPermissions)
      }
      decisionButtons(
        granted: model.screenRecordingPermissionGranted,
        grant: { model.decideScreenRecording(.granted); advance() },
        deny: { model.decideScreenRecording(.denied); advance() },
        deferAction: { model.decideScreenRecording(.deferred); advance() }
      )

    case .audioConsent:
      points([
        ("mic", "Passive microphone context is optional and never fills the composer."),
        ("speaker.wave.2", "System audio is used only for meeting/activity context; raw audio is not retained."),
      ])
      permissionStatus("Microphone", granted: model.microphonePermissionStatus.isGranted)
      HStack {
        primary("Request Microphone") { Task { await model.requestMicrophonePermission() } }
        Button("System Settings", action: model.openMicrophoneSettings)
      }
      decisionButtons(
        granted: model.microphonePermissionStatus.isGranted,
        grant: { model.decideAudio(.granted); advance() },
        deny: { model.decideAudio(.denied); advance() },
        deferAction: { model.decideAudio(.deferred); advance() }
      )

    case .privacyControls:
      Picker("Keep Screen Memory", selection: Binding(
        get: { model.onboardingRetentionPeriod.rawValue },
        set: model.setOnboardingRetentionDays
      )) {
        ForEach([3, 7, 14, 30], id: \.self) { Text("\($0) days").tag($0) }
      }
      TextField("Excluded apps (comma separated)", text: Binding(
        get: { model.excludedAppsText }, set: model.updateExcludedAppsText))
        .textFieldStyle(.roundedBorder)
      points([("eye.slash", "You can enter Private Mode at any time from Intentive's privacy controls.")])
      primary("Save Privacy Choices") { completeAndAdvance(.privacyControls) }

    case .textChatShortcut:
      points([
        ("keyboard", "Use the configured global shortcut or menu bar to open the text-only Floating Bar."),
        ("text.bubble", "There is no dictation, voice response, tool-call UI, or second chat window."),
      ])
      primary("Try Floating Bar") { model.openFloatingBarFromOnboarding(); advance() }

    case .ready:
      points([
        ("checkmark.seal.fill", "Intentive is ready."),
        ("camera.viewfinder", model.onboardingRequirements.captureReady
          ? "Screen Memory will follow your saved capture preference."
          : "Text chat is ready. Screen Memory will remain paused until Screen Recording is granted."),
      ])
      primary("Finish Setup", action: model.finishOnboarding)
    }
  }

  private var stepIndex: Int {
    DesktopOnboardingStep.allCases.firstIndex(of: selectedStep) ?? 0
  }

  private func advance() {
    selectedStep = model.onboardingRequirements.nextIncompleteStep ?? .ready
  }

  private func completeAndAdvance(_ step: DesktopOnboardingStep) {
    model.markOnboardingStepReviewed(step)
    advance()
  }

  private func skipSelectedStep() {
    switch selectedStep {
    case .screenRecording: model.decideScreenRecording(.deferred)
    case .audioConsent: model.decideAudio(.deferred)
    default: return
    }
    advance()
  }

  private func permissionStatus(_ title: String, granted: Bool) -> some View {
    Label(granted ? "\(title) granted" : "\(title) not granted",
          systemImage: granted ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
      .foregroundStyle(granted ? .green : .orange)
  }

  private func primary(_ title: String, action: @escaping () -> Void) -> some View {
    Button(title, action: action).buttonStyle(.borderedProminent)
  }

  private func decisionButtons(
    granted: Bool,
    grant: @escaping () -> Void,
    deny: @escaping () -> Void,
    deferAction: @escaping () -> Void
  ) -> some View {
    HStack {
      if granted { Button("Continue", action: grant).buttonStyle(.borderedProminent) }
      else {
        Button("Continue Without It", action: deny)
        Button("Decide Later", action: deferAction)
      }
    }
  }

  private func points(_ items: [(String, String)]) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      ForEach(Array(items.enumerated()), id: \.offset) { _, item in
        Label { Text(item.1).fixedSize(horizontal: false, vertical: true) } icon: {
          Image(systemName: item.0).frame(width: 24)
        }
      }
    }
  }
}

private extension DesktopOnboardingStep {
  var eyebrow: String {
    switch self {
    case .valuePrivacy: "Welcome"
    case .authentication: "Your Companion"
    case .screenRecording: "Essential sensing"
    case .audioConsent: "Optional sensing"
    case .privacyControls: "Your controls"
    case .textChatShortcut: "Conversation"
    case .ready: "Complete"
    }
  }

  var title: String {
    switch self {
    case .valuePrivacy: "Understand your work, privately."
    case .authentication: "Join your Companion."
    case .screenRecording: "Build Screen Memory."
    case .audioConsent: "Add ambient context?"
    case .privacyControls: "Choose what Intentive remembers."
    case .textChatShortcut: "Chat without changing context."
    case .ready: "You're ready."
    }
  }

  var detail: String {
    switch self {
    case .valuePrivacy: "Your Mac is Intentive's private sensing body. The Agent Runtime remains the only brain."
    case .authentication: "Authentication connects this Mac to one eternal conversation without storing chat history locally."
    case .screenRecording: "Screen Recording enables the local screenshot/video archive, OCR timeline, and search."
    case .audioConsent: "Microphone and system-audio sensing are optional, local, and separate from conversation input."
    case .privacyControls: "Set retention and exclusions before sensing begins."
    case .textChatShortcut: "Summon the same conversation over whatever you're doing."
    case .ready: "You can change every sensing choice later."
    }
  }
}
