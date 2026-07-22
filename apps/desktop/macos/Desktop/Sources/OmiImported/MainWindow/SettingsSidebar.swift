import OmiTheme
import SwiftUI

public enum IntentiveSettingsSection: String, CaseIterable, Identifiable, Sendable {
  case general = "General"
  case rewind = "Rewind"
  case privacy = "Privacy"
  case about = "About"

  public var id: String { rawValue }

  var icon: String {
    switch self {
    case .general: "gearshape"
    case .rewind: "clock.arrow.circlepath"
    case .privacy: "lock.shield"
    case .about: "info.circle"
    }
  }
}

public enum IntentiveSystemAudioMode: String, CaseIterable, Identifiable, Sendable {
  case never = "Never"
  case meetings = "Meetings Only"
  case always = "Always"
  public var id: String { rawValue }
}

public struct IntentiveRunningApplication: Identifiable, Hashable, Sendable {
  public let id: String
  public let name: String
  public init(id: String, name: String) { self.id = id; self.name = name }
}

@MainActor
public protocol IntentiveSettingsPresenting: ObservableObject {
  var selectedSettingsSection: IntentiveSettingsSection { get set }
  var screenCaptureEnabled: Bool { get set }
  var audioRecordingEnabled: Bool { get set }
  var systemAudioMode: IntentiveSystemAudioMode { get set }
  var notificationsAuthorized: Bool { get }
  var floatingBarShortcut: String { get set }
  var storageSummary: String { get }
  var excludedApplications: [String] { get }
  var runningApplications: [IntentiveRunningApplication] { get }
  var retentionDays: Int { get set }
  var storeRecordings: Bool { get set }
  var updateStatus: String { get }
  var automaticallyChecksForUpdates: Bool { get set }
  var automaticallyDownloadsUpdates: Bool { get set }
  var versionText: String { get }
  var reportIssueAvailable: Bool { get }
  func requestNotificationPermission()
  func recordCustomShortcut()
  func addExcludedApplication(bundleID: String)
  func removeExcludedApplication(bundleID: String)
  func resetExcludedApplications()
  func checkForUpdates()
  func reportIssue()
}

struct SettingsSearchItem: Identifiable {
  let id: String
  let name: String
  let subtitle: String
  let keywords: [String]
  let section: IntentiveSettingsSection

  static let all: [SettingsSearchItem] = [
    .init(id: "general.capture", name: "Screen Capture", subtitle: "Record your screen locally", keywords: ["monitor", "recording"], section: .general),
    .init(id: "general.audio", name: "Audio Recording", subtitle: "Capture microphone context", keywords: ["microphone", "recording"], section: .general),
    .init(id: "general.system-audio", name: "System Audio", subtitle: "Choose when other apps are recorded", keywords: ["meetings", "speaker"], section: .general),
    .init(id: "general.notifications", name: "Notifications", subtitle: "macOS notification permission", keywords: ["alerts", "permission"], section: .general),
    .init(id: "general.shortcut", name: "Ask Intentive Shortcut", subtitle: "Show the Floating Bar", keywords: ["keyboard", "hotkey"], section: .general),
    .init(id: "rewind.storage", name: "Storage", subtitle: "Local Rewind storage", keywords: ["disk", "frames"], section: .rewind),
    .init(id: "rewind.excluded", name: "Excluded Apps", subtitle: "Pause capture for selected apps", keywords: ["privacy", "ignore"], section: .rewind),
    .init(id: "rewind.battery", name: "Battery Optimization", subtitle: "Automatic power-aware capture", keywords: ["power", "energy"], section: .rewind),
    .init(id: "rewind.retention", name: "Data Retention", subtitle: "Choose how long records remain", keywords: ["delete", "days"], section: .rewind),
    .init(id: "privacy.recordings", name: "Store Recordings", subtitle: "Keep future audio locally", keywords: ["audio", "local"], section: .privacy),
    .init(id: "privacy.cloud", name: "Private Cloud Sync", subtitle: "Coming Soon", keywords: ["sync", "cloud"], section: .privacy),
    .init(id: "privacy.encryption", name: "Encryption", subtitle: "Local data protection", keywords: ["secure"], section: .privacy),
    .init(id: "about.version", name: "Version", subtitle: "Intentive build information", keywords: ["build"], section: .about),
    .init(id: "about.updates", name: "Software Updates", subtitle: "Check for a new version", keywords: ["sparkle", "install"], section: .about),
    .init(id: "about.issue", name: "Report an Issue", subtitle: "Share diagnostics", keywords: ["feedback", "bug"], section: .about),
  ]
}

struct SettingsSidebar<Model: IntentiveSettingsPresenting>: View {
  @ObservedObject var model: Model
  @State private var searchQuery = ""
  @FocusState private var searchFocused: Bool

  private var results: [SettingsSearchItem] {
    let terms = searchQuery.lowercased().split(separator: " ").map(String.init)
    guard !terms.isEmpty else { return [] }
    return SettingsSearchItem.all.filter { item in
      let haystack = ([item.name, item.subtitle] + item.keywords).joined(separator: " ").lowercased()
      return terms.allSatisfy(haystack.contains)
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Spacer().frame(height: 46)
      Text("Settings")
        .scaledFont(size: OmiType.heading, weight: .bold)
        .foregroundColor(OmiColors.textPrimary)
        .padding(.horizontal, OmiSpacing.lg)
        .padding(.bottom, OmiSpacing.md)
      searchField.padding(.horizontal, OmiSpacing.md).padding(.bottom, OmiSpacing.md)

      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: OmiSpacing.hairline) {
          if searchQuery.isEmpty {
            ForEach(IntentiveSettingsSection.allCases) { section in sidebarItem(section) }
          } else if results.isEmpty {
            Text("No results")
              .scaledFont(size: OmiType.body)
              .foregroundColor(OmiColors.textTertiary)
              .padding(OmiSpacing.md)
          } else {
            ForEach(results) { result in searchResult(result) }
          }
        }
      }
      .padding(.horizontal, OmiSpacing.sm)
      Spacer()
    }
    .frame(width: 260)
    .background(OmiColors.backgroundPrimary)
  }

  private var searchField: some View {
    HStack(spacing: OmiSpacing.sm) {
      Image(systemName: "magnifyingglass")
        .foregroundColor(searchFocused ? OmiColors.accent : OmiColors.textTertiary)
      TextField("Search settings...", text: $searchQuery)
        .textFieldStyle(.plain).focused($searchFocused)
      if !searchQuery.isEmpty {
        Button { searchQuery = "" } label: { Image(systemName: "xmark.circle.fill") }
          .buttonStyle(.plain).foregroundColor(OmiColors.textTertiary)
      }
    }
    .scaledFont(size: OmiType.body)
    .padding(.horizontal, OmiSpacing.sm).padding(.vertical, OmiSpacing.sm)
    .background(
      RoundedRectangle(cornerRadius: OmiChrome.elementRadius)
        .fill(OmiColors.backgroundTertiary)
        .overlay(RoundedRectangle(cornerRadius: OmiChrome.elementRadius)
          .stroke(searchFocused ? OmiColors.accent.opacity(0.5) : .clear, lineWidth: 1))
    )
  }

  private func sidebarItem(_ section: IntentiveSettingsSection) -> some View {
    Button {
      OmiMotion.withGated(.easeInOut(duration: 0.15)) { model.selectedSettingsSection = section }
    } label: {
      HStack(spacing: OmiSpacing.md) {
        Image(systemName: section.icon).frame(width: 20)
        Text(section.rawValue)
        Spacer()
      }
      .scaledFont(size: OmiType.body, weight: model.selectedSettingsSection == section ? .medium : .regular)
      .foregroundColor(model.selectedSettingsSection == section ? OmiColors.textPrimary : OmiColors.textSecondary)
      .padding(.horizontal, OmiSpacing.md).padding(.vertical, OmiSpacing.md)
      .background(RoundedRectangle(cornerRadius: OmiChrome.smallControlRadius)
        .fill(model.selectedSettingsSection == section ? OmiColors.backgroundTertiary.opacity(0.8) : .clear))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("sidebar-\(section.rawValue.lowercased())")
  }

  private func searchResult(_ result: SettingsSearchItem) -> some View {
    Button {
      model.selectedSettingsSection = result.section
      searchQuery = ""
    } label: {
      HStack(spacing: OmiSpacing.sm) {
        Image(systemName: result.section.icon).frame(width: 20)
        VStack(alignment: .leading, spacing: OmiSpacing.hairline) {
          Text(result.name).foregroundColor(OmiColors.textPrimary)
          Text(result.section.rawValue).scaledFont(size: OmiType.caption).foregroundColor(OmiColors.textTertiary)
        }
        Spacer()
      }
      .scaledFont(size: OmiType.body).padding(.horizontal, OmiSpacing.md).padding(.vertical, OmiSpacing.sm)
    }
    .buttonStyle(.plain)
  }
}
