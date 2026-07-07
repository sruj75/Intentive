import AppKit
import ApplicationServices
import AVFoundation
import IntentiveDesktopCore
import SwiftUI

enum DesktopMicrophonePermissionStatus: Equatable {
  case notDetermined
  case granted
  case denied
  case restricted
  case unknown

  var isGranted: Bool {
    self == .granted
  }

  var label: String {
    switch self {
    case .notDetermined:
      return "Not Requested"
    case .granted:
      return "Granted"
    case .denied:
      return "Denied"
    case .restricted:
      return "Restricted"
    case .unknown:
      return "Unknown"
    }
  }

  var systemImage: String {
    isGranted ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
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
    case .notDetermined:
      return .notDetermined
    case .authorized:
      return .granted
    case .denied:
      return .denied
    case .restricted:
      return .restricted
    @unknown default:
      return .unknown
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
    guard
      let url = URL(
        string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
      )
    else {
      return
    }
    NSWorkspace.shared.open(url)
  }
}

protocol DesktopAccessibilityPermissionGateway {
  func hasAccessibilityPermission() -> Bool
  func requestAccessibilityPermission() -> Bool
  func openAccessibilitySettings()
}

struct NativeAccessibilityPermissionGateway: DesktopAccessibilityPermissionGateway {
  func hasAccessibilityPermission() -> Bool {
    AXIsProcessTrusted()
  }

  func requestAccessibilityPermission() -> Bool {
    let options = [
      kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true
    ] as CFDictionary
    return AXIsProcessTrustedWithOptions(options)
  }

  func openAccessibilitySettings() {
    guard
      let url = URL(
        string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
      )
    else {
      return
    }
    NSWorkspace.shared.open(url)
  }
}

struct DesktopOnboardingSheet: View {
  let progress: DesktopOnboardingProgress
  let requirements: DesktopOnboardingRequirements
  let screenRecordingPermissionGranted: Bool
  let accessibilityPermissionGranted: Bool
  let microphonePermissionStatus: DesktopMicrophonePermissionStatus
  let markStepReviewed: (DesktopOnboardingStep) -> Void
  let requestScreenRecordingPermission: () -> Void
  let openScreenRecordingSettings: () -> Void
  let requestAccessibilityPermission: () -> Void
  let openAccessibilitySettings: () -> Void
  let requestMicrophonePermission: () -> Void
  let openMicrophoneSettings: () -> Void
  let refreshPermissions: () -> Void
  let previewNotification: () -> Void
  let openFloatingBar: () -> Void
  let reviewVoiceDemo: () -> Void
  let finishLater: () -> Void
  let finish: () -> Void

  @State private var selectedStep: DesktopOnboardingStep = .trustPrimer

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 0) {
        stepList
          .frame(width: 248)
        Divider()
        selectedStepDetail
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      }

      Divider()

      HStack {
        Button("Finish Later", action: finishLater)
        Spacer()
        Text(requirements.isComplete ? "Ready" : "Setup in progress")
          .font(.caption)
          .foregroundStyle(.secondary)
        Button("Done", action: finish)
          .buttonStyle(.borderedProminent)
          .disabled(!requirements.isComplete)
      }
      .padding(16)
    }
    .frame(minWidth: 760, minHeight: 520)
    .onAppear {
      selectedStep = requirements.nextIncompleteStep ?? .trustPrimer
      refreshPermissions()
    }
  }

  private var stepList: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Desktop Setup")
        .font(.title2.bold())
        .padding(.horizontal, 18)
        .padding(.top, 18)

      VStack(spacing: 4) {
        ForEach(DesktopOnboardingStep.allCases) { step in
          Button {
            selectedStep = step
          } label: {
            HStack(spacing: 10) {
              Image(systemName: requirements.isSatisfied(step) ? "checkmark.circle.fill" : step.symbol)
                .foregroundStyle(requirements.isSatisfied(step) ? .green : .secondary)
                .frame(width: 20)
              VStack(alignment: .leading, spacing: 2) {
                Text(step.title)
                  .font(.callout.weight(.medium))
                Text(step.subtitle)
                  .font(.caption)
                  .foregroundStyle(.secondary)
                  .lineLimit(2)
              }
              Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(
              selectedStep == step
                ? Color.accentColor.opacity(0.12)
                : Color.clear,
              in: RoundedRectangle(cornerRadius: 8)
            )
          }
          .buttonStyle(.plain)
        }
      }
      .padding(.horizontal, 10)

      Spacer()
    }
  }

  @ViewBuilder
  private var selectedStepDetail: some View {
    switch selectedStep {
    case .trustPrimer:
      TrustPrimerStep(markReviewed: {
        markStepReviewed(.trustPrimer)
        advance()
      })
    case .permissions:
      PermissionsStep(
        screenRecordingPermissionGranted: screenRecordingPermissionGranted,
        accessibilityPermissionGranted: accessibilityPermissionGranted,
        microphonePermissionStatus: microphonePermissionStatus,
        markReviewed: { markStepReviewed(.permissions) },
        requestScreenRecordingPermission: requestScreenRecordingPermission,
        openScreenRecordingSettings: openScreenRecordingSettings,
        requestAccessibilityPermission: requestAccessibilityPermission,
        openAccessibilitySettings: openAccessibilitySettings,
        requestMicrophonePermission: requestMicrophonePermission,
        openMicrophoneSettings: openMicrophoneSettings,
        refreshPermissions: refreshPermissions
      )
    case .notificationPreview:
      NotificationPreviewStep(previewNotification: {
        previewNotification()
        markStepReviewed(.notificationPreview)
        advance()
      })
    case .floatingBarShortcut:
      FloatingBarShortcutStep(markReviewed: {
        markStepReviewed(.floatingBarShortcut)
        advance()
      })
    case .floatingBarDemo:
      FloatingBarDemoStep(openFloatingBar: {
        openFloatingBar()
        markStepReviewed(.floatingBarDemo)
        advance()
      })
    case .voiceShortcut:
      VoiceShortcutStep(markReviewed: {
        markStepReviewed(.voiceShortcut)
        advance()
      })
    case .voiceDemo:
      VoiceDemoStep(
        microphonePermissionStatus: microphonePermissionStatus,
        reviewVoiceDemo: {
          reviewVoiceDemo()
          markStepReviewed(.voiceDemo)
        }
      )
    }
  }

  private func advance() {
    guard let currentIndex = DesktopOnboardingStep.allCases.firstIndex(of: selectedStep) else {
      return
    }
    let nextIndex = DesktopOnboardingStep.allCases.index(after: currentIndex)
    if nextIndex < DesktopOnboardingStep.allCases.endIndex {
      selectedStep = DesktopOnboardingStep.allCases[nextIndex]
    }
  }
}

private struct TrustPrimerStep: View {
  let markReviewed: () -> Void

  var body: some View {
    StepPane(title: "Trust and Privacy", systemImage: "hand.raised") {
      VStack(alignment: .leading, spacing: 12) {
        OnboardingPoint(
          systemImage: "desktopcomputer",
          title: "Raw screen and audio stay local by default",
          detail: "Intentive builds Screen Memory on the Mac and sends compact perception events over the shared Protocol."
        )
        OnboardingPoint(
          systemImage: "person.crop.circle.badge.checkmark",
          title: "The Mac joins your existing Companion",
          detail: "Floating chat and voice turns enter the same Companion conversation as mobile."
        )
        OnboardingPoint(
          systemImage: "lock.shield",
          title: "Permissions stay visible",
          detail: "Screen Recording, Accessibility, and microphone access are macOS grants you can revoke in System Settings."
        )
      }
    } footer: {
      Button {
        markReviewed()
      } label: {
        Label("I Understand", systemImage: "checkmark")
      }
      .buttonStyle(.borderedProminent)
    }
  }
}

private struct PermissionsStep: View {
  let screenRecordingPermissionGranted: Bool
  let accessibilityPermissionGranted: Bool
  let microphonePermissionStatus: DesktopMicrophonePermissionStatus
  let markReviewed: () -> Void
  let requestScreenRecordingPermission: () -> Void
  let openScreenRecordingSettings: () -> Void
  let requestAccessibilityPermission: () -> Void
  let openAccessibilitySettings: () -> Void
  let requestMicrophonePermission: () -> Void
  let openMicrophoneSettings: () -> Void
  let refreshPermissions: () -> Void

  var body: some View {
    StepPane(title: "Mac Permissions", systemImage: "switch.2") {
      VStack(alignment: .leading, spacing: 14) {
        PermissionRow(
          title: "Screen Recording",
          detail: "Required for Screen Memory and capture-aware perception.",
          isGranted: screenRecordingPermissionGranted,
          status: screenRecordingPermissionGranted ? "Granted" : "Required",
          requestTitle: "Request Access",
          requestImage: "rectangle.on.rectangle",
          request: {
            markReviewed()
            requestScreenRecordingPermission()
          },
          openSettings: {
            markReviewed()
            openScreenRecordingSettings()
          }
        )

        PermissionRow(
          title: "Accessibility",
          detail: "Required for the global Option push-to-talk shortcut while other apps are focused.",
          isGranted: accessibilityPermissionGranted,
          status: accessibilityPermissionGranted ? "Granted" : "Required",
          requestTitle: "Request Access",
          requestImage: "option",
          request: {
            markReviewed()
            requestAccessibilityPermission()
          },
          openSettings: {
            markReviewed()
            openAccessibilitySettings()
          }
        )

        PermissionRow(
          title: "Microphone",
          detail: "Required for push-to-talk voice turns.",
          isGranted: microphonePermissionStatus.isGranted,
          status: microphonePermissionStatus.label,
          requestTitle: "Request Access",
          requestImage: "mic",
          request: {
            markReviewed()
            requestMicrophonePermission()
          },
          openSettings: {
            markReviewed()
            openMicrophoneSettings()
          }
        )
      }
    } footer: {
      Button {
        markReviewed()
        refreshPermissions()
      } label: {
        Label("Refresh", systemImage: "arrow.clockwise")
      }
    }
  }
}

private struct NotificationPreviewStep: View {
  let previewNotification: () -> Void

  var body: some View {
    StepPane(title: "Proactive Preview", systemImage: "bell.badge") {
      VStack(alignment: .leading, spacing: 12) {
        OnboardingPoint(
          systemImage: "bell.badge",
          title: "Local effect surface",
          detail: "Intentive can show Runtime-approved desktop nudges without creating a second conversation."
        )
        OnboardingPoint(
          systemImage: "checkmark.message",
          title: "Acknowledged once",
          detail: "Desktop effects acknowledge delivery through the Runtime Bridge and keep perception out of chat history."
        )
      }
    } footer: {
      Button {
        previewNotification()
      } label: {
        Label("Preview Nudge", systemImage: "bell")
      }
      .buttonStyle(.borderedProminent)
    }
  }
}

private struct FloatingBarShortcutStep: View {
  let markReviewed: () -> Void

  var body: some View {
    StepPane(title: "Floating Bar Shortcut", systemImage: "keyboard") {
      VStack(alignment: .leading, spacing: 12) {
        OnboardingPoint(
          systemImage: "command",
          title: "Global entry point",
          detail: "Use the configured chat shortcut to summon the Floating Bar over the active app."
        )
        OnboardingPoint(
          systemImage: "cursorarrow.click.2",
          title: "No context switch",
          detail: "The bar stays lightweight so a desktop question can become a normal Companion turn."
        )
      }
    } footer: {
      Button {
        markReviewed()
      } label: {
        Label("Shortcut Reviewed", systemImage: "checkmark")
      }
      .buttonStyle(.borderedProminent)
    }
  }
}

private struct FloatingBarDemoStep: View {
  let openFloatingBar: () -> Void

  var body: some View {
    StepPane(title: "Floating Bar Demo", systemImage: "text.bubble") {
      VStack(alignment: .leading, spacing: 12) {
        OnboardingPoint(
          systemImage: "bubble.left.and.bubble.right",
          title: "Compact chat",
          detail: "The Floating Bar is the desktop entry point into the same Companion conversation."
        )
        OnboardingPoint(
          systemImage: "dock.arrow.up.rectangle",
          title: "Desktop-local effects",
          detail: "Runtime-approved nudges can show locally without turning the Mac into a separate agent."
        )
      }
    } footer: {
      Button {
        openFloatingBar()
      } label: {
        Label("Open Floating Bar", systemImage: "text.bubble")
      }
      .buttonStyle(.borderedProminent)
    }
  }
}

private struct VoiceShortcutStep: View {
  let markReviewed: () -> Void

  var body: some View {
    StepPane(title: "Voice Shortcut", systemImage: "keyboard.badge.waveform") {
      VStack(alignment: .leading, spacing: 12) {
        OnboardingPoint(
          systemImage: "mic.badge.plus",
          title: "Push-to-talk",
          detail: "Hold Option to talk. Double-tap Option to lock the voice turn until the next tap."
        )
        OnboardingPoint(
          systemImage: "waveform.path.ecg",
          title: "Voice is not capture",
          detail: "Voice turns enter the same Companion path as typed chat after local speech gates pass."
        )
      }
    } footer: {
      Button {
        markReviewed()
      } label: {
        Label("Shortcut Reviewed", systemImage: "checkmark")
      }
      .buttonStyle(.borderedProminent)
    }
  }
}

private struct VoiceDemoStep: View {
  let microphonePermissionStatus: DesktopMicrophonePermissionStatus
  let reviewVoiceDemo: () -> Void

  var body: some View {
    StepPane(title: "Voice Demo", systemImage: "waveform") {
      VStack(alignment: .leading, spacing: 12) {
        OnboardingPoint(
          systemImage: "mic",
          title: microphonePermissionStatus.isGranted ? "Microphone ready" : "Microphone needed",
          detail: microphonePermissionStatus.isGranted
            ? "Push-to-talk captures audio locally before a normal user message is sent."
            : "Grant microphone access before using push-to-talk."
        )
        OnboardingPoint(
          systemImage: "waveform.badge.magnifyingglass",
          title: "Speech gate first",
          detail: "Silent turns are dropped before they reach the Runtime Bridge."
        )
        OnboardingPoint(
          systemImage: "checkmark.shield",
          title: "No fabricated transcript",
          detail: "Voice fails closed unless a real local transcription adapter is configured."
        )
      }
    } footer: {
      Button {
        reviewVoiceDemo()
      } label: {
        Label("Open Voice", systemImage: "waveform")
      }
      .buttonStyle(.borderedProminent)
    }
  }
}

private struct StepPane<Content: View, Footer: View>: View {
  let title: String
  let systemImage: String
  @ViewBuilder let content: () -> Content
  @ViewBuilder let footer: () -> Footer

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      Label(title, systemImage: systemImage)
        .font(.title.bold())
        .labelStyle(.titleAndIcon)

      content()

      Spacer()

      HStack {
        Spacer()
        footer()
      }
    }
    .padding(28)
  }
}

private struct OnboardingPoint: View {
  let systemImage: String
  let title: String
  let detail: String

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: systemImage)
        .foregroundStyle(.secondary)
        .frame(width: 22)
      VStack(alignment: .leading, spacing: 3) {
        Text(title)
          .font(.headline)
        Text(detail)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
  }
}

private struct PermissionRow: View {
  let title: String
  let detail: String
  let isGranted: Bool
  let status: String
  let requestTitle: String
  let requestImage: String
  let request: () -> Void
  let openSettings: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 3) {
          Text(title)
            .font(.headline)
          Text(detail)
            .foregroundStyle(.secondary)
        }
        Spacer()
        Label(status, systemImage: isGranted ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
          .foregroundStyle(isGranted ? .green : .orange)
      }

      HStack {
        Button(action: request) {
          Label(requestTitle, systemImage: requestImage)
        }
        Button(action: openSettings) {
          Label("System Settings", systemImage: "gearshape")
        }
      }
    }
    .padding(14)
    .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 8))
  }
}

private extension DesktopOnboardingStep {
  var title: String {
    switch self {
    case .trustPrimer:
      return "Trust"
    case .permissions:
      return "Permissions"
    case .notificationPreview:
      return "Notifications"
    case .floatingBarShortcut:
      return "Bar Shortcut"
    case .floatingBarDemo:
      return "Bar Demo"
    case .voiceShortcut:
      return "Voice Shortcut"
    case .voiceDemo:
      return "Voice Demo"
    }
  }

  var subtitle: String {
    switch self {
    case .trustPrimer:
      return "Local-first capture"
    case .permissions:
      return "Screen, shortcut, and voice"
    case .notificationPreview:
      return "Proactive nudge"
    case .floatingBarShortcut:
      return "Open from anywhere"
    case .floatingBarDemo:
      return "Desktop chat surface"
    case .voiceShortcut:
      return "Push-to-talk"
    case .voiceDemo:
      return "Push-to-talk path"
    }
  }

  var symbol: String {
    switch self {
    case .trustPrimer:
      return "hand.raised"
    case .permissions:
      return "switch.2"
    case .notificationPreview:
      return "bell.badge"
    case .floatingBarShortcut:
      return "keyboard"
    case .floatingBarDemo:
      return "text.bubble"
    case .voiceShortcut:
      return "keyboard.badge.waveform"
    case .voiceDemo:
      return "waveform"
    }
  }
}
