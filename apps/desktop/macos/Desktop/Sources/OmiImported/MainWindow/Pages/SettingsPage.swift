import AppKit
import OmiTheme
import SwiftUI

/// Omi's Settings shell, reduced to the four approved Intentive destinations.
/// Backend ownership stays with the conforming presentation adapter.
public struct IntentiveSettingsWindow<Model: IntentiveSettingsPresenting>: View {
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
    .accessibilityIdentifier("intentive-settings-window")
  }
}

private struct SettingsPage<Model: IntentiveSettingsPresenting>: View {
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

private struct GeneralSettings<Model: IntentiveSettingsPresenting>: View {
  @ObservedObject var model: Model

  var body: some View {
    VStack(spacing: OmiSpacing.xxl) {
      IntentiveSettingsCard(
        title: "Notifications",
        subtitle: model.notificationsAuthorized ? "Notifications are enabled." : "Allow Intentive notifications in macOS.",
        icon: "bell.fill"
      ) {
        Toggle("", isOn: Binding(
          get: { model.notificationsAuthorized },
          set: { enabled in if enabled { model.requestNotificationPermission() } }
        )).labelsHidden().toggleStyle(OmiToggleStyle())
      }
      IntentiveSettingsCard(
        title: "Launch at Login",
        subtitle: "Start Intentive quietly in the menu bar when you sign in.",
        icon: "power"
      ) {
        Toggle("", isOn: binding(\.launchAtLogin))
          .labelsHidden().toggleStyle(OmiToggleStyle())
          .accessibilityIdentifier("general-launch-at-login-toggle")
      }
      shortcutCard
    }
  }

  private var shortcutCard: some View {
    VStack(alignment: .leading, spacing: OmiSpacing.lg) {
      HStack(alignment: .top, spacing: OmiSpacing.md) {
        IntentiveCardIcon(systemName: "keyboard")
        VStack(alignment: .leading, spacing: OmiSpacing.xxs) {
          Text("Ask Intentive Shortcut").intentiveCardTitle()
          Text("Open or hide the Floating Bar from anywhere.").intentiveCardSubtitle()
        }
        Spacer()
      }
      HStack(spacing: OmiSpacing.sm) {
        shortcutButton("command+shift+return", tokens: ["⇧", "⌘", "↩"])
        shortcutButton("command+shift+space", tokens: ["⌘", "⇧", "Space"])
        Button("Custom", action: model.recordCustomShortcut)
          .buttonStyle(.plain).font(.system(size: 12, weight: .medium))
          .padding(.horizontal, 11).padding(.vertical, 7)
          .background(model.floatingBarShortcut.hasPrefix("custom:") ? OmiColors.accent.opacity(0.18) : OmiColors.backgroundSecondary, in: RoundedRectangle(cornerRadius: 8))
          .overlay(RoundedRectangle(cornerRadius: 8).stroke(model.floatingBarShortcut.hasPrefix("custom:") ? OmiColors.accent : .clear, lineWidth: 1.5))
          .foregroundColor(OmiColors.textSecondary)
        shortcutButton("disabled", tokens: ["Disable"])
      }
    }
    .intentiveCard()
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

private struct RewindSettings<Model: IntentiveSettingsPresenting>: View {
  @ObservedObject var model: Model
  @State private var appToAdd = ""
  @State private var pendingDestructiveAction: RewindDestructiveAction?

  var body: some View {
    VStack(spacing: OmiSpacing.xxl) {
      timelineBrowser
      IntentiveSettingsCard(title: "Storage", subtitle: "Screen recordings are stored locally on this Mac.", icon: "internaldrive.fill") {
        Text(model.storageSummary).foregroundColor(OmiColors.textSecondary).font(.system(size: 13, weight: .medium))
          .accessibilityIdentifier("screen_memory_storage_label")
      }
      excludedAppsCard
      IntentiveSettingsCard(title: "Battery Optimization", subtitle: "Capture frequency adapts automatically to power state.", icon: "battery.75percent") {
        Text("Automatic").foregroundColor(OmiColors.textSecondary).font(.system(size: 13, weight: .medium))
      }
      IntentiveSettingsCard(title: "Data Retention", subtitle: "Choose how long to keep local screen recordings.", icon: "calendar.badge.clock") {
        Picker("", selection: Binding(get: { model.retentionDays }, set: { model.retentionDays = $0 })) {
          ForEach([3, 7, 14, 30], id: \.self) { Text("\($0) days").tag($0) }
        }
        .labelsHidden().frame(width: 130)
        .accessibilityIdentifier("rewind-retention-picker")
      }
      Button("Clear Local Data", role: .destructive) {
        pendingDestructiveAction = .clearLocalData
      }
      .buttonStyle(OmiButtonStyle(.secondary))
      .accessibilityIdentifier("screen_memory_clear_local_data")
    }
    .accessibilityIdentifier("screen_memory")
    .alert(item: $pendingDestructiveAction) { action in
      switch action {
      case .deleteFrame:
        Alert(
          title: Text("Delete this frame?"),
          message: Text("The selected local frame and its associated recording chunk will be removed."),
          primaryButton: .destructive(Text("Delete")) { model.deleteSelectedRewindFrame() },
          secondaryButton: .cancel()
        )
      case .clearLocalData:
        Alert(
          title: Text("Clear all local Rewind data?"),
          message: Text("All locally stored screen records and recording media will be permanently removed."),
          primaryButton: .destructive(Text("Clear Local Data")) { model.clearRewindLocalData() },
          secondaryButton: .cancel()
        )
      }
    }
  }

  private var timelineBrowser: some View {
    VStack(alignment: .leading, spacing: OmiSpacing.lg) {
      HStack(spacing: OmiSpacing.sm) {
        Image(systemName: "magnifyingglass").foregroundColor(OmiColors.textTertiary)
        TextField(
          "Search captured text, apps, and windows",
          text: Binding(get: { model.rewindQuery }, set: { model.rewindQuery = $0 })
        )
        .textFieldStyle(.plain)
        .onSubmit(model.submitRewindSearch)
        .accessibilityIdentifier("screen_memory_search_field")
        Button("Search", action: model.submitRewindSearch)
          .buttonStyle(OmiButtonStyle(.secondary, size: .compact))
          .accessibilityIdentifier("screen_memory_search_submit")
      }
      .padding(.horizontal, OmiSpacing.md).padding(.vertical, OmiSpacing.sm)
      .background(OmiColors.backgroundSecondary, in: RoundedRectangle(cornerRadius: OmiChrome.elementRadius))

      HStack {
        Button(action: { model.moveRewindDay(-1) }) { Image(systemName: "chevron.left") }
          .buttonStyle(.plain).accessibilityIdentifier("screen_memory_previous_day")
        Spacer()
        Text(model.rewindSelectedDate)
          .font(.system(size: 13, weight: .semibold)).foregroundColor(OmiColors.textPrimary)
        Spacer()
        Button(action: { model.moveRewindDay(1) }) { Image(systemName: "chevron.right") }
          .buttonStyle(.plain).accessibilityIdentifier("screen_memory_next_day")
      }

      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: OmiSpacing.sm) {
          appFilterButton("All Apps", app: nil)
          ForEach(model.rewindAvailableApps, id: \.self) { app in appFilterButton(app, app: app) }
        }
      }

      if model.rewindFrames.isEmpty {
        VStack(spacing: OmiSpacing.sm) {
          Image(systemName: "clock.badge.questionmark").font(.system(size: 28))
          Text("No captured frames for this view").font(.system(size: 13, weight: .medium))
        }
        .foregroundColor(OmiColors.textTertiary)
        .frame(maxWidth: .infinity, minHeight: 180)
        .accessibilityIdentifier("screen_memory_empty_state")
      } else {
        currentFrame
        playbackControls
        filmstrip
        ocrCard
      }
    }
    .intentiveCard()
  }

  @ViewBuilder private var currentFrame: some View {
    ZStack {
      RoundedRectangle(cornerRadius: OmiChrome.elementRadius).fill(Color.black.opacity(0.7))
      if let data = model.rewindSelectedFrameData, let image = NSImage(data: data) {
        Image(nsImage: image).resizable().scaledToFit()
      } else {
        ProgressView().controlSize(.small)
      }
    }
    .frame(maxWidth: .infinity).aspectRatio(16 / 9, contentMode: .fit)
    .clipShape(RoundedRectangle(cornerRadius: OmiChrome.elementRadius))
    .accessibilityIdentifier("screen_memory_current_frame")
  }

  private var playbackControls: some View {
    HStack {
      Button(action: { model.stepRewind(-1) }) { Image(systemName: "backward.frame.fill") }
        .buttonStyle(.plain).accessibilityIdentifier("screen_memory_scrub_backward")
      Button(action: model.toggleRewindPlayback) {
        Image(systemName: model.rewindIsPlaying ? "pause.fill" : "play.fill")
      }
      .buttonStyle(.plain).accessibilityIdentifier("screen_memory_play_pause")
      Button(action: { model.stepRewind(1) }) { Image(systemName: "forward.frame.fill") }
        .buttonStyle(.plain).accessibilityIdentifier("screen_memory_scrub_forward")
      Spacer()
      Button(role: .destructive) { pendingDestructiveAction = .deleteFrame } label: {
        Label("Delete Frame", systemImage: "trash")
      }
      .buttonStyle(.plain).foregroundColor(.red)
      .accessibilityIdentifier("screen_memory_delete_frame")
    }
  }

  private var filmstrip: some View {
    ScrollView(.horizontal, showsIndicators: true) {
      HStack(spacing: OmiSpacing.sm) {
        ForEach(model.rewindFrames) { frame in
          Button { model.selectRewindFrame(id: frame.id) } label: {
            VStack(alignment: .leading, spacing: 3) {
              Text(frame.appName).font(.system(size: 11, weight: .semibold)).lineLimit(1)
              Text(frame.windowTitle.isEmpty ? frame.capturedAt : frame.windowTitle)
                .font(.system(size: 10)).lineLimit(1)
            }
            .foregroundColor(OmiColors.textPrimary)
            .frame(width: 132, alignment: .leading)
            .padding(OmiSpacing.sm)
            .background(
              RoundedRectangle(cornerRadius: 7)
                .fill(model.rewindSelectedFrameID == frame.id ? OmiColors.accent.opacity(0.28) : OmiColors.backgroundSecondary)
            )
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("screen_memory_frame_\(frame.id)")
        }
      }
    }
    .accessibilityIdentifier("screen_memory_filmstrip")
  }

  @ViewBuilder private var ocrCard: some View {
    if !model.rewindSelectedOCRText.isEmpty {
      VStack(alignment: .leading, spacing: OmiSpacing.sm) {
        Text("Captured Text").font(.system(size: 13, weight: .semibold)).foregroundColor(OmiColors.textPrimary)
        Text(model.rewindSelectedOCRText)
          .font(.system(size: 12)).foregroundColor(OmiColors.textSecondary)
          .textSelection(.enabled)
        ForEach(Array(model.rewindSelectedOCRMatches.enumerated()), id: \.offset) { index, match in
          Text(match)
            .font(.system(size: 12, weight: .medium)).foregroundColor(OmiColors.textPrimary)
            .padding(OmiSpacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(OmiColors.accent.opacity(0.14), in: RoundedRectangle(cornerRadius: 6))
            .accessibilityIdentifier("screen_memory_ocr_highlight_\(index)")
        }
      }
      .padding(OmiSpacing.md)
      .background(OmiColors.backgroundSecondary, in: RoundedRectangle(cornerRadius: OmiChrome.elementRadius))
    }
  }

  private func appFilterButton(_ title: String, app: String?) -> some View {
    let selected = model.rewindSelectedApp == app
    return Button { model.filterRewind(app: app) } label: {
      Text(title).font(.system(size: 11, weight: .medium))
        .padding(.horizontal, 9).padding(.vertical, 6)
        .foregroundColor(selected ? OmiColors.textPrimary : OmiColors.textSecondary)
        .background(selected ? OmiColors.accent.opacity(0.22) : OmiColors.backgroundSecondary, in: Capsule())
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier(app.map { "screen_memory_app_filter_\($0)" } ?? "screen_memory_app_filter_all")
  }

  private var excludedAppsCard: some View {
    VStack(alignment: .leading, spacing: OmiSpacing.lg) {
      HStack(alignment: .top, spacing: OmiSpacing.md) {
        IntentiveCardIcon(systemName: "eye.slash.fill")
        VStack(alignment: .leading, spacing: OmiSpacing.xxs) {
          Text("Excluded Apps").intentiveCardTitle()
          Text("Screen capture pauses while these apps are active.").intentiveCardSubtitle()
        }
        Spacer()
        Button("Reset to Defaults", action: model.resetExcludedApplications)
          .buttonStyle(OmiButtonStyle(.primary, size: .compact))
          .accessibilityIdentifier("rewind-exclusions-reset")
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
          ForEach(model.excludedApplications) { application in
            HStack(spacing: OmiSpacing.md) {
              RoundedRectangle(cornerRadius: 6).fill(Color.white.opacity(0.7)).frame(width: 22, height: 22)
              Text(application.name)
                .font(.system(size: 13, weight: .medium)).foregroundColor(OmiColors.textSecondary)
              Spacer()
              Button { model.removeExcludedApplication(application) } label: { Image(systemName: "xmark.circle.fill") }
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
            .accessibilityIdentifier("rewind-exclusion-input")
          Button("Add") {
            let value = appToAdd.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !value.isEmpty else { return }
            model.addExcludedApplication(displayName: value)
            appToAdd = ""
          }
          .buttonStyle(OmiButtonStyle(.secondary, size: .compact)).disabled(appToAdd.isEmpty)
          .accessibilityIdentifier("rewind-exclusion-add")
        }
        Text("Currently Running Apps").font(.system(size: 12, weight: .medium)).foregroundColor(OmiColors.textSecondary)
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: OmiSpacing.sm) {
            ForEach(model.runningApplications.filter { !model.excludedApplications.contains($0) }) { app in
              Button { model.addExcludedApplication(app) } label: {
                HStack(spacing: 5) { Image(systemName: "app"); Text(app.name); Image(systemName: "plus.circle.fill") }
                  .font(.system(size: 11, weight: .medium)).foregroundColor(OmiColors.textSecondary)
                  .padding(.horizontal, 8).padding(.vertical, 6)
                  .background(OmiColors.backgroundSecondary, in: RoundedRectangle(cornerRadius: 7))
              }.buttonStyle(.plain)
            }
          }
        }
      }
    }.intentiveCard()
  }
}

private enum RewindDestructiveAction: String, Identifiable {
  case deleteFrame
  case clearLocalData
  var id: String { rawValue }
}

private struct PrivacySettings<Model: IntentiveSettingsPresenting>: View {
  @ObservedObject var model: Model
  @State private var trackingExpanded = false

  var body: some View {
    VStack(spacing: OmiSpacing.xxl) {
      VStack(alignment: .leading, spacing: OmiSpacing.lg) {
        Text("Data Controls").font(.system(size: 15, weight: .semibold)).foregroundColor(OmiColors.textPrimary)
        IntentiveControlRow(title: "Store Recordings", subtitle: "Keep future audio recordings locally on this Mac.", icon: "waveform") {
          Toggle("", isOn: Binding(get: { model.storeRecordings }, set: { model.storeRecordings = $0 }))
            .labelsHidden().toggleStyle(OmiToggleStyle())
            .accessibilityIdentifier("privacy-store-recordings-toggle")
        }
        Divider().overlay(Color.white.opacity(0.08))
        IntentiveControlRow(
          title: "Anonymous Analytics",
          subtitle: "Off until you choose to share anonymous product usage. Screenshots, captured text, audio, and conversations are never included.",
          icon: "chart.bar.xaxis"
        ) {
          Toggle("", isOn: Binding(get: { model.analyticsEnabled }, set: { model.analyticsEnabled = $0 }))
            .labelsHidden().toggleStyle(OmiToggleStyle())
            .accessibilityLabel("Share anonymous product analytics")
            .accessibilityIdentifier("privacy-analytics-toggle")
        }
        Divider().overlay(Color.white.opacity(0.08))
        IntentiveControlRow(title: "Private Cloud Sync", subtitle: "Securely sync your private data across devices.", icon: "icloud") {
          HStack(spacing: 8) {
            Text("Coming Soon").font(.system(size: 11, weight: .semibold)).foregroundColor(OmiColors.textTertiary)
            Toggle("", isOn: .constant(false)).labelsHidden().toggleStyle(OmiToggleStyle()).disabled(true)
          }
        }
      }.intentiveCard()
      VStack(alignment: .leading, spacing: OmiSpacing.md) {
        HStack(spacing: OmiSpacing.md) { IntentiveCardIcon(systemName: "shield.lefthalf.filled"); Text("Encryption").intentiveCardTitle(); Spacer() }
        HStack(spacing: OmiSpacing.sm) {
          Image(systemName: "checkmark.circle.fill").foregroundColor(.green)
          Text("On-device protection").font(.system(size: 13, weight: .medium)).foregroundColor(OmiColors.textPrimary)
          Text("Active").font(.system(size: 11, weight: .semibold)).foregroundColor(.green)
            .padding(.horizontal, 6).padding(.vertical, 2).background(Color.green.opacity(0.12), in: RoundedRectangle(cornerRadius: 4))
        }
        Text("Your data is stored locally and protected by macOS and your signed-in user account.").intentiveCardSubtitle()
      }.intentiveCard()

      Button { trackingExpanded.toggle() } label: {
        VStack(alignment: .leading, spacing: OmiSpacing.md) {
          HStack(spacing: OmiSpacing.md) {
            IntentiveCardIcon(systemName: "list.bullet")
            Text("What We Track").intentiveCardTitle()
            Spacer()
            Image(systemName: trackingExpanded ? "chevron.down" : "chevron.right").foregroundColor(OmiColors.textTertiary)
          }
          if trackingExpanded {
            Text("Local screen records, permitted audio context, app identity, and diagnostic metadata. Raw media does not leave this Mac in V1.").intentiveCardSubtitle()
          }
        }.intentiveCard()
      }.buttonStyle(.plain)

      VStack(alignment: .leading, spacing: OmiSpacing.md) {
        HStack(spacing: OmiSpacing.md) { IntentiveCardIcon(systemName: "hand.raised.fill"); Text("Privacy Guarantees").intentiveCardTitle(); Spacer() }
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
      }.intentiveCard()
    }
  }
}

private struct AboutSettings<Model: IntentiveSettingsPresenting>: View {
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
            Text(model.versionText).intentiveCardSubtitle()
          }
          Spacer()
        }
        Divider().overlay(Color.white.opacity(0.08))
        ForEach(["What's New", "Visit Website", "Help Center", "Privacy Policy", "Terms of Service"], id: \.self) { title in
          HStack { Text(title); Spacer(); Image(systemName: "arrow.up.right") }
            .font(.system(size: 13, weight: .medium)).foregroundColor(OmiColors.textTertiary)
            .padding(.vertical, 4)
        }
      }.intentiveCard().opacity(0.65).accessibilityHint("Links will be enabled when Intentive destinations are configured")

      VStack(alignment: .leading, spacing: OmiSpacing.lg) {
        IntentiveControlRow(title: "Software Updates", subtitle: model.updateStatus, icon: "arrow.triangle.2.circlepath") {
          Button("Check Now", action: model.checkForUpdates)
            .buttonStyle(OmiButtonStyle(.secondary))
            .accessibilityIdentifier("about-check-updates")
        }
        Divider().overlay(Color.white.opacity(0.08))
        IntentiveControlRow(title: "Automatic Updates", subtitle: "Check for updates automatically.", icon: "clock.arrow.circlepath") {
          Toggle("", isOn: Binding(get: { model.automaticallyChecksForUpdates }, set: { model.automaticallyChecksForUpdates = $0 }))
            .labelsHidden().toggleStyle(OmiToggleStyle())
            .accessibilityIdentifier("about-automatic-update-check-toggle")
        }
        IntentiveControlRow(title: "Auto-Install Updates", subtitle: "Download updates automatically when available.", icon: "arrow.down.circle") {
          Toggle("", isOn: Binding(get: { model.automaticallyDownloadsUpdates }, set: { model.automaticallyDownloadsUpdates = $0 }))
            .labelsHidden().toggleStyle(OmiToggleStyle())
            .accessibilityIdentifier("about-auto-install-updates-toggle")
        }
        IntentiveControlRow(title: "Update Channel", subtitle: "Choose which releases to receive.", icon: "point.3.connected.trianglepath.dotted") {
          Picker("", selection: .constant("Stable")) {
            Text("Stable").tag("Stable")
            Text("Beta — Coming Soon").tag("Beta")
          }.labelsHidden().frame(width: 170)
        }
      }.intentiveCard()

      IntentiveSettingsCard(title: "Report an Issue", subtitle: "Send feedback with local diagnostics to help us improve Intentive.", icon: "exclamationmark.bubble.fill") {
        Button("Report Issue", action: model.reportIssue)
          .buttonStyle(OmiButtonStyle(.secondary)).disabled(!model.reportIssueAvailable)
          .accessibilityIdentifier("about-report-issue")
      }
    }
  }
}

private struct IntentiveSettingsCard<Accessory: View>: View {
  let title: String, subtitle: String, icon: String
  @ViewBuilder let accessory: Accessory
  var body: some View {
    HStack(alignment: .center, spacing: OmiSpacing.md) {
      IntentiveCardIcon(systemName: icon)
      VStack(alignment: .leading, spacing: OmiSpacing.xxs) {
        Text(title).intentiveCardTitle(); Text(subtitle).intentiveCardSubtitle()
      }
      Spacer(minLength: OmiSpacing.lg); accessory
    }.intentiveCard()
  }
}

private struct IntentiveControlRow<Accessory: View>: View {
  let title: String, subtitle: String, icon: String
  @ViewBuilder let accessory: Accessory
  var body: some View {
    HStack(spacing: OmiSpacing.md) {
      IntentiveCardIcon(systemName: icon)
      VStack(alignment: .leading, spacing: OmiSpacing.xxs) { Text(title).intentiveCardTitle(); Text(subtitle).intentiveCardSubtitle() }
      Spacer(); accessory
    }
  }
}

private struct IntentiveCardIcon: View {
  let systemName: String
  var body: some View {
    Image(systemName: systemName).font(.system(size: 14, weight: .semibold)).foregroundColor(.white.opacity(0.9))
      .frame(width: 32, height: 32)
      .background(RoundedRectangle(cornerRadius: OmiChrome.elementRadius).fill(OmiColors.backgroundSecondary))
  }
}

private extension View {
  func intentiveCard() -> some View {
    self.padding(OmiSpacing.lg).background(
      RoundedRectangle(cornerRadius: OmiChrome.cardRadius, style: .continuous)
        .fill(OmiColors.backgroundTertiary.opacity(0.55))
        .overlay(RoundedRectangle(cornerRadius: OmiChrome.cardRadius).stroke(Color.white.opacity(0.06), lineWidth: 1)))
  }
}

private extension Text {
  func intentiveCardTitle() -> some View { font(.system(size: 14, weight: .semibold)).foregroundColor(OmiColors.textPrimary) }
  func intentiveCardSubtitle() -> some View { font(.system(size: 12)).foregroundColor(OmiColors.textSecondary).lineSpacing(2) }
}
