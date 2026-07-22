import AppKit
import OmiTheme
import SwiftUI

/// Omi's Settings shell, reduced to the four approved Intentive destinations.
/// Backend ownership stays with the conforming presentation adapter.
public struct OmiSettingsWindow<Model: OmiSettingsPresenting>: View {
  @ObservedObject private var model: Model

  public init(model: Model) { self.model = model }

  public var body: some View {
    HStack(spacing: 0) {
      SettingsSidebar(model: model)
      Divider().background(OmiColors.backgroundTertiary)
      SettingsPage(model: model)
    }
    .frame(minWidth: 900, idealWidth: 1040, minHeight: 620, idealHeight: 720)
    .background(OmiColors.backgroundPrimary)
    .preferredColorScheme(.dark)
    .accessibilityIdentifier("omi-settings-window")
  }
}

private struct SettingsPage<Model: OmiSettingsPresenting>: View {
  @ObservedObject var model: Model

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: OmiSpacing.xxl) {
        Text(model.selectedSettingsSection.rawValue)
          .scaledFont(size: OmiType.title, weight: .bold)
          .foregroundColor(OmiColors.textPrimary)
          .id(model.selectedSettingsSection)
          .transition(.opacity)
          .omiAnimation(.easeInOut(duration: 0.15), value: model.selectedSettingsSection)

        Group {
          switch model.selectedSettingsSection {
          case .general: GeneralSettings(model: model)
          case .rewind: RewindSettings(model: model)
          case .privacy: PrivacySettings(model: model)
          case .about: AboutSettings(model: model)
          }
        }
        .id(model.selectedSettingsSection)
        .transition(.opacity)
        .omiAnimation(.easeInOut(duration: 0.15), value: model.selectedSettingsSection)
      }
      .frame(maxWidth: 760, alignment: .leading)
      .padding(.horizontal, OmiSpacing.section)
      .padding(.vertical, OmiSpacing.section)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(OmiColors.backgroundSecondary.opacity(0.3))
  }
}

private struct GeneralSettings<Model: OmiSettingsPresenting>: View {
  @ObservedObject var model: Model

  var body: some View {
    VStack(spacing: OmiSpacing.xxl) {
      OmiSettingsCard(title: "Screen Capture", subtitle: "Record your screen to build your Rewind.", icon: "display") {
        Toggle("", isOn: binding(\.screenCaptureEnabled))
          .labelsHidden().toggleStyle(OmiToggleStyle())
          .accessibilityIdentifier("general-screen-capture-toggle")
      }
      OmiSettingsCard(title: "Audio Recording", subtitle: "Record microphone audio for local context.", icon: "mic.fill") {
        Toggle("", isOn: binding(\.audioRecordingEnabled))
          .labelsHidden().toggleStyle(OmiToggleStyle())
          .accessibilityIdentifier("general-audio-recording-toggle")
      }
      OmiSettingsCard(title: "System Audio", subtitle: "Choose when Intentive records audio from other apps.", icon: "speaker.wave.2.fill") {
        Picker("", selection: binding(\.systemAudioMode)) {
          ForEach(OmiSystemAudioMode.allCases) { Text($0.rawValue).tag($0) }
        }.labelsHidden().frame(width: 170)
      }
      OmiSettingsCard(
        title: "Notifications",
        subtitle: model.notificationsAuthorized ? "Notifications are enabled." : "Allow Intentive notifications in macOS.",
        icon: "bell.fill"
      ) {
        Toggle("", isOn: Binding(
          get: { model.notificationsAuthorized },
          set: { enabled in if enabled { model.requestNotificationPermission() } }
        )).labelsHidden().toggleStyle(OmiToggleStyle())
      }
      shortcutCard
    }
  }

  private var shortcutCard: some View {
    VStack(alignment: .leading, spacing: OmiSpacing.lg) {
      HStack(alignment: .top, spacing: OmiSpacing.md) {
        OmiCardIcon(systemName: "keyboard")
        VStack(alignment: .leading, spacing: OmiSpacing.xxs) {
          Text("Ask Intentive Shortcut").omiCardTitle()
          Text("Open or hide the Floating Bar from anywhere.").omiCardSubtitle()
        }
        Spacer()
      }
      HStack(spacing: OmiSpacing.sm) {
        shortcutButton("command+o", tokens: ["⌘", "O"])
        shortcutButton("command+return", tokens: ["⌘", "↩"])
        shortcutButton("command+shift+return", tokens: ["⇧", "⌘", "↩"])
        shortcutButton("command+j", tokens: ["⌘", "J"])
        Button("Custom", action: model.recordCustomShortcut)
          .buttonStyle(.plain).font(.system(size: 12, weight: .medium))
          .padding(.horizontal, 11).padding(.vertical, 7)
          .background(model.floatingBarShortcut.hasPrefix("custom:") ? OmiColors.accent.opacity(0.18) : OmiColors.backgroundSecondary, in: RoundedRectangle(cornerRadius: 8))
          .overlay(RoundedRectangle(cornerRadius: 8).stroke(model.floatingBarShortcut.hasPrefix("custom:") ? OmiColors.accent : .clear, lineWidth: 1.5))
          .foregroundColor(OmiColors.textSecondary)
        shortcutButton("disabled", tokens: ["Disable"])
      }
    }
    .omiCard()
    .accessibilityIdentifier("general-shortcut")
  }

  private func shortcutButton(_ value: String, tokens: [String]) -> some View {
    Button { model.floatingBarShortcut = value } label: {
      HStack(spacing: 4) {
        ForEach(tokens, id: \.self) { token in
          Text(token).font(.system(size: 11, weight: .medium, design: .rounded))
            .foregroundColor(OmiColors.textPrimary)
        }
      }
      .padding(.horizontal, 10).padding(.vertical, 7)
      .background(model.floatingBarShortcut == value ? OmiColors.accent.opacity(0.18) : OmiColors.backgroundSecondary, in: RoundedRectangle(cornerRadius: 8))
      .overlay(RoundedRectangle(cornerRadius: 8).stroke(model.floatingBarShortcut == value ? OmiColors.accent : .clear, lineWidth: 1.5))
    }.buttonStyle(.plain)
  }

  private func binding<Value>(_ path: ReferenceWritableKeyPath<Model, Value>) -> Binding<Value> {
    Binding(get: { model[keyPath: path] }, set: { model[keyPath: path] = $0 })
  }
}

private struct RewindSettings<Model: OmiSettingsPresenting>: View {
  @ObservedObject var model: Model
  @State private var appToAdd = ""

  var body: some View {
    VStack(spacing: OmiSpacing.xxl) {
      OmiSettingsCard(title: "Storage", subtitle: "Screen recordings are stored locally on this Mac.", icon: "internaldrive.fill") {
        Text(model.storageSummary).foregroundColor(OmiColors.textSecondary).font(.system(size: 13, weight: .medium))
      }
      excludedAppsCard
      OmiSettingsCard(title: "Battery Optimization", subtitle: "Capture frequency adapts automatically to power state.", icon: "battery.75percent") {
        Text("Automatic").foregroundColor(OmiColors.textSecondary).font(.system(size: 13, weight: .medium))
      }
      OmiSettingsCard(title: "Data Retention", subtitle: "Choose how long to keep local screen recordings.", icon: "calendar.badge.clock") {
        Picker("", selection: Binding(get: { model.retentionDays }, set: { model.retentionDays = $0 })) {
          ForEach([3, 7, 14, 30], id: \.self) { Text("\($0) days").tag($0) }
        }.labelsHidden().frame(width: 130)
      }
    }
  }

  private var excludedAppsCard: some View {
    VStack(alignment: .leading, spacing: OmiSpacing.lg) {
      HStack(alignment: .top, spacing: OmiSpacing.md) {
        OmiCardIcon(systemName: "eye.slash.fill")
        VStack(alignment: .leading, spacing: OmiSpacing.xxs) {
          Text("Excluded Apps").omiCardTitle()
          Text("Screen capture pauses while these apps are active.").omiCardSubtitle()
        }
        Spacer()
        Button("Reset to Defaults", action: model.resetExcludedApplications)
          .buttonStyle(OmiButtonStyle(.primary, size: .compact))
      }
      Divider().overlay(Color.white.opacity(0.08))
      if model.excludedApplications.isEmpty {
        HStack {
          Spacer()
          Label("No apps excluded", systemImage: "checkmark.shield")
            .font(.system(size: 12)).foregroundColor(OmiColors.textSecondary)
          Spacer()
        }
          .padding(.vertical, OmiSpacing.lg)
      } else {
        LazyVStack(spacing: OmiSpacing.sm) {
          ForEach(model.excludedApplications, id: \.self) { bundleID in
            HStack(spacing: OmiSpacing.md) {
              RoundedRectangle(cornerRadius: 6).fill(Color.white.opacity(0.7)).frame(width: 22, height: 22)
              Text(model.runningApplications.first(where: { $0.id == bundleID })?.name ?? bundleID)
                .font(.system(size: 13, weight: .medium)).foregroundColor(OmiColors.textSecondary)
              Spacer()
              Button { model.removeExcludedApplication(bundleID: bundleID) } label: { Image(systemName: "xmark.circle.fill") }
                .buttonStyle(.plain)
            }
          }
        }
      }
      Divider().overlay(Color.white.opacity(0.08))
      VStack(alignment: .leading, spacing: OmiSpacing.sm) {
        Text("Add App to Exclusion List").font(.system(size: 12, weight: .medium)).foregroundColor(OmiColors.textSecondary)
        HStack {
          TextField("App name (e.g., Passwords)", text: $appToAdd).textFieldStyle(.plain)
            .padding(.horizontal, 10).padding(.vertical, 7)
            .background(OmiColors.backgroundSecondary, in: RoundedRectangle(cornerRadius: 7))
          Button("Add") {
            let value = appToAdd.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !value.isEmpty else { return }
            model.addExcludedApplication(bundleID: value)
            appToAdd = ""
          }.buttonStyle(OmiButtonStyle(.secondary, size: .compact)).disabled(appToAdd.isEmpty)
        }
        Text("Currently Running Apps").font(.system(size: 12, weight: .medium)).foregroundColor(OmiColors.textSecondary)
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: OmiSpacing.sm) {
            ForEach(model.runningApplications.filter { !model.excludedApplications.contains($0.id) }) { app in
              Button { model.addExcludedApplication(bundleID: app.id) } label: {
                HStack(spacing: 5) { Image(systemName: "app"); Text(app.name); Image(systemName: "plus.circle.fill") }
                  .font(.system(size: 11, weight: .medium)).foregroundColor(OmiColors.textSecondary)
                  .padding(.horizontal, 8).padding(.vertical, 6)
                  .background(OmiColors.backgroundSecondary, in: RoundedRectangle(cornerRadius: 7))
              }.buttonStyle(.plain)
            }
          }
        }
      }
    }.omiCard()
  }
}

private struct PrivacySettings<Model: OmiSettingsPresenting>: View {
  @ObservedObject var model: Model
  @State private var trackingExpanded = false

  var body: some View {
    VStack(spacing: OmiSpacing.xxl) {
      VStack(alignment: .leading, spacing: OmiSpacing.lg) {
        Text("Data Controls").font(.system(size: 15, weight: .semibold)).foregroundColor(OmiColors.textPrimary)
        OmiControlRow(title: "Store Recordings", subtitle: "Keep future audio recordings locally on this Mac.", icon: "waveform") {
          Toggle("", isOn: Binding(get: { model.storeRecordings }, set: { model.storeRecordings = $0 }))
            .labelsHidden().toggleStyle(OmiToggleStyle())
        }
        Divider().overlay(Color.white.opacity(0.08))
        OmiControlRow(title: "Private Cloud Sync", subtitle: "Securely sync your private data across devices.", icon: "icloud") {
          HStack(spacing: 8) {
            Text("Coming Soon").font(.system(size: 11, weight: .semibold)).foregroundColor(OmiColors.textTertiary)
            Toggle("", isOn: .constant(false)).labelsHidden().toggleStyle(OmiToggleStyle()).disabled(true)
          }
        }
      }.omiCard()
      VStack(alignment: .leading, spacing: OmiSpacing.md) {
        HStack(spacing: OmiSpacing.md) { OmiCardIcon(systemName: "shield.lefthalf.filled"); Text("Encryption").omiCardTitle(); Spacer() }
        HStack(spacing: OmiSpacing.sm) {
          Image(systemName: "checkmark.circle.fill").foregroundColor(.green)
          Text("On-device protection").font(.system(size: 13, weight: .medium)).foregroundColor(OmiColors.textPrimary)
          Text("Active").font(.system(size: 11, weight: .semibold)).foregroundColor(.green)
            .padding(.horizontal, 6).padding(.vertical, 2).background(Color.green.opacity(0.12), in: RoundedRectangle(cornerRadius: 4))
        }
        Text("Your data is stored locally and protected by macOS and your signed-in user account.").omiCardSubtitle()
      }.omiCard()

      Button { trackingExpanded.toggle() } label: {
        VStack(alignment: .leading, spacing: OmiSpacing.md) {
          HStack(spacing: OmiSpacing.md) {
            OmiCardIcon(systemName: "list.bullet")
            Text("What We Track").omiCardTitle()
            Spacer()
            Image(systemName: trackingExpanded ? "chevron.down" : "chevron.right").foregroundColor(OmiColors.textTertiary)
          }
          if trackingExpanded {
            Text("Local screen records, permitted audio context, app identity, and diagnostic metadata. Raw media does not leave this Mac in V1.").omiCardSubtitle()
          }
        }.omiCard()
      }.buttonStyle(.plain)

      VStack(alignment: .leading, spacing: OmiSpacing.md) {
        HStack(spacing: OmiSpacing.md) { OmiCardIcon(systemName: "hand.raised.fill"); Text("Privacy Guarantees").omiCardTitle(); Spacer() }
        ForEach([
          "Existing recordings remain when storage is turned off",
          "No personal content is stored in analytics",
          "Raw media stays on this Mac in V1",
          "Screen capture and audio recording toggle independently",
        ], id: \.self) { guarantee in
          HStack(alignment: .top, spacing: OmiSpacing.sm) {
            Image(systemName: "checkmark").foregroundColor(.green)
            Text(guarantee).font(.system(size: 13)).foregroundColor(OmiColors.textSecondary)
          }
        }
      }.omiCard()
    }
  }
}

private struct AboutSettings<Model: OmiSettingsPresenting>: View {
  @ObservedObject var model: Model

  var body: some View {
    VStack(spacing: OmiSpacing.xxl) {
      VStack(alignment: .leading, spacing: OmiSpacing.lg) {
        HStack(spacing: OmiSpacing.lg) {
          if let icon = NSApp.applicationIconImage {
            Image(nsImage: icon).resizable().scaledToFit().frame(width: 54, height: 54)
          }
          VStack(alignment: .leading, spacing: OmiSpacing.xxs) {
            Text("Intentive").font(.system(size: 20, weight: .bold)).foregroundColor(OmiColors.textPrimary)
            Text(model.versionText).omiCardSubtitle()
          }
          Spacer()
        }
        Divider().overlay(Color.white.opacity(0.08))
        ForEach(["What's New", "Visit Website", "Help Center", "Privacy Policy", "Terms of Service"], id: \.self) { title in
          HStack { Text(title); Spacer(); Image(systemName: "arrow.up.right") }
            .font(.system(size: 13, weight: .medium)).foregroundColor(OmiColors.textTertiary)
            .padding(.vertical, 4)
        }
      }.omiCard().opacity(0.65).accessibilityHint("Links will be enabled when Intentive destinations are configured")

      VStack(alignment: .leading, spacing: OmiSpacing.lg) {
        OmiControlRow(title: "Software Updates", subtitle: model.updateStatus, icon: "arrow.triangle.2.circlepath") {
          Button("Check Now", action: model.checkForUpdates).buttonStyle(OmiButtonStyle(.secondary))
        }
        Divider().overlay(Color.white.opacity(0.08))
        OmiControlRow(title: "Automatic Updates", subtitle: "Check for updates automatically.", icon: "clock.arrow.circlepath") {
          Toggle("", isOn: Binding(get: { model.automaticallyChecksForUpdates }, set: { model.automaticallyChecksForUpdates = $0 }))
            .labelsHidden().toggleStyle(OmiToggleStyle())
        }
        OmiControlRow(title: "Auto-Install Updates", subtitle: "Download updates automatically when available.", icon: "arrow.down.circle") {
          Toggle("", isOn: Binding(get: { model.automaticallyDownloadsUpdates }, set: { model.automaticallyDownloadsUpdates = $0 }))
            .labelsHidden().toggleStyle(OmiToggleStyle())
        }
        OmiControlRow(title: "Update Channel", subtitle: "Choose which releases to receive.", icon: "point.3.connected.trianglepath.dotted") {
          Picker("", selection: .constant("Stable")) {
            Text("Stable").tag("Stable")
            Text("Beta — Coming Soon").tag("Beta")
          }.labelsHidden().frame(width: 170)
        }
      }.omiCard()

      OmiSettingsCard(title: "Report an Issue", subtitle: "Send feedback with local diagnostics to help us improve Intentive.", icon: "exclamationmark.bubble.fill") {
        Button("Report Issue", action: model.reportIssue)
          .buttonStyle(OmiButtonStyle(.secondary)).disabled(!model.reportIssueAvailable)
          .accessibilityIdentifier("about-report-issue")
      }
    }
  }
}

private struct OmiSettingsCard<Accessory: View>: View {
  let title: String, subtitle: String, icon: String
  @ViewBuilder let accessory: Accessory
  var body: some View {
    HStack(alignment: .center, spacing: OmiSpacing.md) {
      OmiCardIcon(systemName: icon)
      VStack(alignment: .leading, spacing: OmiSpacing.xxs) {
        Text(title).omiCardTitle(); Text(subtitle).omiCardSubtitle()
      }
      Spacer(minLength: OmiSpacing.lg); accessory
    }.omiCard()
  }
}

private struct OmiControlRow<Accessory: View>: View {
  let title: String, subtitle: String, icon: String
  @ViewBuilder let accessory: Accessory
  var body: some View {
    HStack(spacing: OmiSpacing.md) {
      OmiCardIcon(systemName: icon)
      VStack(alignment: .leading, spacing: OmiSpacing.xxs) { Text(title).omiCardTitle(); Text(subtitle).omiCardSubtitle() }
      Spacer(); accessory
    }
  }
}

private struct OmiCardIcon: View {
  let systemName: String
  var body: some View {
    Image(systemName: systemName).font(.system(size: 14, weight: .semibold)).foregroundColor(.white.opacity(0.9))
      .frame(width: 32, height: 32)
      .background(RoundedRectangle(cornerRadius: OmiChrome.elementRadius).fill(OmiColors.backgroundSecondary))
  }
}

private extension View {
  func omiCard() -> some View {
    self.padding(OmiSpacing.lg).background(
      RoundedRectangle(cornerRadius: OmiChrome.cardRadius, style: .continuous)
        .fill(OmiColors.backgroundTertiary.opacity(0.55))
        .overlay(RoundedRectangle(cornerRadius: OmiChrome.cardRadius).stroke(Color.white.opacity(0.06), lineWidth: 1)))
  }
}

private extension Text {
  func omiCardTitle() -> some View { font(.system(size: 14, weight: .semibold)).foregroundColor(OmiColors.textPrimary) }
  func omiCardSubtitle() -> some View { font(.system(size: 12)).foregroundColor(OmiColors.textSecondary).lineSpacing(2) }
}
