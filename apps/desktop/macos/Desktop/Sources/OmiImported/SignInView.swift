import AppKit
import Combine
import OmiTheme
import SwiftUI

public enum IntentiveSetupStep: String, CaseIterable, Identifiable, Sendable {
  case trust
  case screenRecording
  case microphone
  case accessibility
  case floatingBarShortcut
  case floatingBarDemo
  public var id: String { rawValue }
}

@MainActor
public protocol IntentiveSetupPresenting: ObservableObject {
  var isAuthenticated: Bool { get }
  var crossClientSetupComplete: Bool { get }
  var authenticationLoading: Bool { get }
  var authenticationError: String? { get }
  var setupStep: IntentiveSetupStep { get }
  var screenRecordingGranted: Bool { get }
  var microphoneGranted: Bool { get }
  var accessibilityGranted: Bool { get }
  var shortcutLabel: String { get }
  func signIn()
  func cancelSignIn()
  func completeCurrentSetupStep()
  func skipCurrentSetupStep()
  func requestScreenRecording()
  func openScreenRecordingSettings()
  func refreshSetupPermissions()
  func requestMicrophone()
  func openMicrophoneSettings()
  func requestAccessibility()
  func openAccessibilitySettings()
  func openFloatingBar()
}

public extension IntentiveSetupPresenting {
  func startScreenRecordingPermissionFlow() {
    requestScreenRecording()
    guard !screenRecordingGranted else { return }
    openScreenRecordingSettings()
  }

  func refreshSetupPermissionsAfterApplicationActivation() {
    refreshSetupPermissions()
  }
}

public struct IntentiveMacSetupView<Model: IntentiveSetupPresenting>: View {
  @ObservedObject private var model: Model
  @State private var demoTimedOut = false

  public init(model: Model) { self.model = model }

  public var body: some View {
    Group {
      if !model.isAuthenticated { signIn }
      else if !model.crossClientSetupComplete { finishOnPhone }
      else { setup }
    }
    .frame(minWidth: 920, minHeight: 620)
    .background(OmiColors.backgroundPrimary)
    .preferredColorScheme(.dark)
    .accessibilityIdentifier("setup-\(model.setupStep.rawValue)")
    .onReceive(
      NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)
    ) { _ in
      model.refreshSetupPermissionsAfterApplicationActivation()
    }
  }

  private var signIn: some View {
    ZStack {
      OmiColors.backgroundPrimary.ignoresSafeArea()
      VStack(spacing: OmiSpacing.section) {
        Spacer()
        VStack(spacing: OmiSpacing.lg) {
          if let icon = NSApp.applicationIconImage {
            Image(nsImage: icon).resizable().aspectRatio(contentMode: .fit).frame(width: 64, height: 64)
          }
          Text("Intentive").scaledFont(size: 48, weight: .bold).foregroundColor(OmiColors.textPrimary)
          Text("Sign in to continue").font(.title3).foregroundColor(OmiColors.textTertiary)
        }
        Spacer()
        VStack(spacing: OmiSpacing.md) {
          googleSignInButton
          if model.authenticationLoading {
            ProgressView().tint(.white).padding(.top, OmiSpacing.sm)
            Button("Cancel", action: model.cancelSignIn).buttonStyle(.plain).foregroundColor(OmiColors.textTertiary)
          }
          if let error = model.authenticationError {
            Text(error).font(.caption).foregroundColor(OmiColors.error).multilineTextAlignment(.center)
          }
        }.frame(width: 320)
        Spacer().frame(height: 60)
      }
    }
  }

  private var googleSignInButton: some View {
    Button(action: model.signIn) {
      Text("Continue with Google").scaledFont(size: OmiType.subheading, weight: .medium)
        .foregroundColor(.black).frame(maxWidth: .infinity).frame(height: 50)
        .background(Color.white, in: Capsule())
    }
    .buttonStyle(.plain)
    .disabled(model.authenticationLoading)
    .accessibilityIdentifier("sign-in-with-google")
  }

  private var finishOnPhone: some View {
    VStack(spacing: OmiSpacing.xl) {
      Image(systemName: "iphone.gen3").font(.system(size: 52)).foregroundColor(OmiColors.textSecondary)
      Text("Finish setup on your phone").font(.system(size: 32, weight: .bold)).foregroundColor(OmiColors.textPrimary)
      Text("Complete the remaining account setup in Intentive Mobile, then return here.")
        .font(.system(size: 15)).foregroundColor(OmiColors.textSecondary).multilineTextAlignment(.center)
    }.frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private var setup: some View {
    VStack(spacing: 0) {
      HStack {
        Text("Intentive").font(.system(size: 18, weight: .semibold)).foregroundColor(.white)
        Spacer()
      }.padding(.horizontal, OmiSpacing.xxl).padding(.vertical, OmiSpacing.lg)
      Divider().background(OmiColors.backgroundTertiary)
      GeometryReader { geometry in
        ScrollView(showsIndicators: false) {
          VStack(spacing: OmiSpacing.xxl) {
            progressRail
            titleBlock
            setupContent
          }
          .frame(maxWidth: 600)
          .frame(minHeight: geometry.size.height, alignment: .center)
          .frame(maxWidth: .infinity)
          .padding(.horizontal, OmiSpacing.page).padding(.vertical, OmiSpacing.section)
        }
      }
    }
  }

  private var progressRail: some View {
    HStack(spacing: OmiSpacing.sm) {
      ForEach(Array(IntentiveSetupStep.allCases.enumerated()), id: \.element) { index, _ in
        Capsule().fill(index <= stepIndex ? Color.white : Color.white.opacity(0.1))
          .frame(width: index == stepIndex ? 28 : 8, height: 6)
      }
    }
  }

  private var titleBlock: some View {
    VStack(spacing: OmiSpacing.md) {
      Text(stepCopy.eyebrow.uppercased()).font(.system(size: 12, weight: .semibold)).tracking(1.2)
        .foregroundColor(OmiColors.textTertiary)
      Text(stepCopy.title).font(.system(size: 40, weight: .bold)).foregroundColor(OmiColors.textPrimary)
        .multilineTextAlignment(.center)
      Text(stepCopy.detail).font(.system(size: 16)).foregroundColor(OmiColors.textSecondary).lineSpacing(4)
        .multilineTextAlignment(.center).frame(maxWidth: 520)
    }
  }

  @ViewBuilder private var setupContent: some View {
    switch model.setupStep {
    case .trust:
      VStack(spacing: OmiSpacing.lg) {
        permissionRow(icon: "display", title: "Screen Recording", detail: "Build local context from what you're working on.")
        permissionRow(icon: "mic.fill", title: "Microphone", detail: "Capture voice notes and meeting context locally.")
        permissionRow(icon: "accessibility", title: "Accessibility", detail: "Know the active app and summon the Floating Bar.")
        primary("Continue", id: "setup-continue", action: model.completeCurrentSetupStep)
      }
    case .screenRecording:
      permissionCard(
        icon: "display",
        title: "Screen Recording",
        detail: "Screen Recording lets Intentive see what you're working on.",
        granted: model.screenRecordingGranted,
        request: model.startScreenRecordingPermissionFlow
      )
    case .microphone:
      permissionCard(icon: "mic.fill", title: "Microphone", detail: "Microphone access lets Intentive understand local audio context while coaching is active.", granted: model.microphoneGranted, request: model.requestMicrophone)
    case .accessibility:
      permissionCard(icon: "accessibility", title: "Accessibility", detail: "Accessibility lets Intentive detect the active app and respond to your shortcut.", granted: model.accessibilityGranted, request: model.requestAccessibility)
    case .floatingBarShortcut:
      VStack(spacing: OmiSpacing.xl) {
        Text("Press").foregroundColor(OmiColors.textSecondary)
        Text(model.shortcutLabel).font(.system(size: 28, weight: .semibold, design: .rounded)).foregroundColor(.black)
          .padding(.horizontal, 24).padding(.vertical, 14).background(Color.white, in: RoundedRectangle(cornerRadius: 14))
        Text("Use this shortcut from anywhere to open the Floating Bar.").intentiveSetupDetail()
        primary("Continue", id: "setup-continue", action: model.completeCurrentSetupStep)
      }.intentiveSetupCard()
    case .floatingBarDemo:
      VStack(spacing: OmiSpacing.xl) {
        Image(systemName: "text.bubble.fill").font(.system(size: 40)).foregroundColor(.white)
        Text("Try the real Floating Bar").font(.system(size: 20, weight: .semibold)).foregroundColor(.white)
        Text(demoTimedOut ? "You can continue now and try again later." : "Open the text-only bar and send a message before finishing setup.").intentiveSetupDetail()
        HStack {
          primary("Open Floating Bar", id: "setup-open-floating-bar", action: model.openFloatingBar)
          Button("Finish", action: model.completeCurrentSetupStep)
            .buttonStyle(OmiButtonStyle(.secondary))
            .accessibilityIdentifier("setup-finish")
        }
      }.intentiveSetupCard()
      .task {
        try? await Task.sleep(for: .seconds(12))
        guard !Task.isCancelled else { return }
        demoTimedOut = true
      }
    }
  }

  private func permissionCard(icon: String, title: String, detail: String, granted: Bool, request: @escaping () -> Void) -> some View {
    VStack(alignment: .leading, spacing: OmiSpacing.lg) {
      permissionRow(icon: icon, title: title, detail: detail)
      Label(granted ? "Granted" : "Not granted yet", systemImage: granted ? "checkmark.circle.fill" : "circle.dashed")
        .font(.system(size: 13, weight: .medium)).foregroundColor(granted ? .green : OmiColors.textTertiary)
      if granted {
        primary("Continue", id: "setup-continue", action: model.completeCurrentSetupStep)
      } else {
        primary(
          "Open \(title) settings",
          id: "setup-open-\(title.lowercased().replacingOccurrences(of: " ", with: "-"))",
          action: request
        )
      }
    }.intentiveSetupCard()
  }

  private func permissionRow(icon: String, title: String, detail: String) -> some View {
    HStack(alignment: .top, spacing: OmiSpacing.md) {
      Image(systemName: icon).font(.system(size: 14, weight: .semibold)).foregroundColor(.white.opacity(0.85))
        .frame(width: 32, height: 32).background(OmiColors.backgroundSecondary, in: RoundedRectangle(cornerRadius: OmiChrome.elementRadius))
      VStack(alignment: .leading, spacing: OmiSpacing.xxs) {
        Text(title).font(.system(size: 14, weight: .semibold)).foregroundColor(OmiColors.textPrimary)
        Text(detail).font(.system(size: 13)).foregroundColor(OmiColors.textSecondary)
      }
      Spacer()
    }
  }

  private func primary(
    _ title: String,
    id: String? = nil,
    action: @escaping () -> Void
  ) -> some View {
    Button(title, action: action)
      .buttonStyle(OmiButtonStyle(.primary))
      .keyboardShortcut(.defaultAction)
      .accessibilityIdentifier(id ?? "setup-primary")
  }

  private var stepIndex: Int { IntentiveSetupStep.allCases.firstIndex(of: model.setupStep) ?? 0 }
  private var stepCopy: (eyebrow: String, title: String, detail: String) {
    switch model.setupStep {
    case .trust: ("Before we continue", "I’m going to ask for a few permissions.", "Intentive is private by design. These permissions help it understand your work and help in the right places.")
    case .screenRecording: ("Permission", "Let Intentive read your screen.", "Screen Recording lets Intentive see what you're working on.")
    case .microphone: ("Permission", "Let Intentive hear work context.", "Microphone access is required for local sensing while Coaching is active, never to fill the composer.")
    case .accessibility: ("Permission", "Let Intentive work across your Mac.", "Accessibility identifies the active app and supports the global Floating Bar shortcut.")
    case .floatingBarShortcut: ("Shortcut", "Intentive is one shortcut away.", "Learn the shortcut you'll use to reach your Companion from anywhere.")
    case .floatingBarDemo: ("Try it", "Meet your Floating Bar.", "Open the real text-only conversation surface before finishing setup.")
    }
  }
}

private extension View {
  func intentiveSetupCard() -> some View {
    padding(OmiSpacing.xl).background(RoundedRectangle(cornerRadius: OmiChrome.cardRadius)
      .fill(OmiColors.backgroundTertiary.opacity(0.55)))
  }
  func intentiveSetupDetail() -> some View {
    font(.system(size: 14)).foregroundColor(OmiColors.textSecondary).multilineTextAlignment(.center)
  }
}
