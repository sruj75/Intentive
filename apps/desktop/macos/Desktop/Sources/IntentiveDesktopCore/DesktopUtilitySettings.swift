import Foundation

/// The only destinations presented by the Omi-derived Settings shell.
public enum DesktopUtilitySection: String, CaseIterable, Codable, Equatable, Sendable {
  case general
  case rewind
  case privacy
  case about
}

public struct DesktopUtilitySettings: Codable, Equatable, Sendable {
  public var retentionDays: Int
  public var screenCaptureEnabled: Bool
  public var passiveAudioEnabled: Bool
  public var systemAudioMode: SystemAudioCaptureMode
  public var notificationsEnabled: Bool
  public var storeRecordings: Bool
  public var privateCloudSyncEnabled: Bool
  public var floatingBarShortcut: String
  public var launchAtLogin: Bool
  public var analyticsEnabled: Bool
  public var automaticallyChecksForUpdates: Bool
  public var automaticallyDownloadsUpdates: Bool
  public var selectedSection: DesktopUtilitySection

  public init(
    retentionDays: Int = 7,
    screenCaptureEnabled: Bool = true,
    passiveAudioEnabled: Bool = true,
    systemAudioMode: SystemAudioCaptureMode = .onlyDuringMeetings,
    notificationsEnabled: Bool = false,
    storeRecordings: Bool = true,
    privateCloudSyncEnabled: Bool = false,
    floatingBarShortcut: String = "command+o",
    launchAtLogin: Bool = false,
    analyticsEnabled: Bool = true,
    automaticallyChecksForUpdates: Bool = true,
    automaticallyDownloadsUpdates: Bool = false,
    selectedSection: DesktopUtilitySection = .general
  ) {
    self.retentionDays = Self.allowedRetentionDays.contains(retentionDays) ? retentionDays : 7
    self.screenCaptureEnabled = screenCaptureEnabled
    self.passiveAudioEnabled = passiveAudioEnabled
    self.systemAudioMode = systemAudioMode
    self.notificationsEnabled = notificationsEnabled
    self.storeRecordings = storeRecordings
    self.privateCloudSyncEnabled = false // V1 is deliberately local-only.
    self.floatingBarShortcut = floatingBarShortcut
    self.launchAtLogin = launchAtLogin
    self.analyticsEnabled = analyticsEnabled
    self.automaticallyChecksForUpdates = automaticallyChecksForUpdates
    self.automaticallyDownloadsUpdates = automaticallyDownloadsUpdates
    self.selectedSection = selectedSection
  }

  public static let allowedRetentionDays = [3, 7, 14, 30]

  private enum CodingKeys: String, CodingKey {
    case retentionDays, screenCaptureEnabled, passiveAudioEnabled, systemAudioMode
    case notificationsEnabled, storeRecordings, privateCloudSyncEnabled
    case floatingBarShortcut, launchAtLogin, analyticsEnabled
    case automaticallyChecksForUpdates, automaticallyDownloadsUpdates, selectedSection
  }

  public init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    let rawSection = try values.decodeIfPresent(String.self, forKey: .selectedSection)
    let migratedSection: DesktopUtilitySection = switch rawSection {
    case "rewind", "screenMemory": .rewind
    case "privacy": .privacy
    case "about", "account", "updates", "diagnostics": .about
    case "general", "sensing": .general
    default: .general
    }
    self.init(
      retentionDays: try values.decodeIfPresent(Int.self, forKey: .retentionDays) ?? 7,
      screenCaptureEnabled: try values.decodeIfPresent(Bool.self, forKey: .screenCaptureEnabled) ?? true,
      passiveAudioEnabled: try values.decodeIfPresent(Bool.self, forKey: .passiveAudioEnabled) ?? true,
      systemAudioMode: try values.decodeIfPresent(SystemAudioCaptureMode.self, forKey: .systemAudioMode)
        ?? .onlyDuringMeetings,
      notificationsEnabled: try values.decodeIfPresent(Bool.self, forKey: .notificationsEnabled) ?? false,
      storeRecordings: try values.decodeIfPresent(Bool.self, forKey: .storeRecordings) ?? true,
      privateCloudSyncEnabled: false,
      floatingBarShortcut: try values.decodeIfPresent(String.self, forKey: .floatingBarShortcut)
        ?? "command+o",
      launchAtLogin: try values.decodeIfPresent(Bool.self, forKey: .launchAtLogin) ?? false,
      analyticsEnabled: try values.decodeIfPresent(Bool.self, forKey: .analyticsEnabled) ?? true,
      automaticallyChecksForUpdates: try values.decodeIfPresent(
        Bool.self, forKey: .automaticallyChecksForUpdates) ?? true,
      automaticallyDownloadsUpdates: try values.decodeIfPresent(
        Bool.self, forKey: .automaticallyDownloadsUpdates) ?? false,
      selectedSection: migratedSection
    )
  }
}

public protocol DesktopUtilitySettingsStore: AnyObject {
  func load() -> DesktopUtilitySettings?
  func save(_ settings: DesktopUtilitySettings) throws
}

public final class UserDefaultsDesktopUtilitySettingsStore: DesktopUtilitySettingsStore {
  private let defaults: UserDefaults
  private let key: String

  public init(defaults: UserDefaults = .standard, key: String = "intentive.desktop.utility-settings") {
    self.defaults = defaults
    self.key = key
  }

  public func load() -> DesktopUtilitySettings? {
    guard let data = defaults.data(forKey: key) else { return nil }
    return try? JSONDecoder().decode(DesktopUtilitySettings.self, from: data)
  }

  public func save(_ settings: DesktopUtilitySettings) throws {
    defaults.set(try JSONEncoder().encode(settings), forKey: key)
  }
}

public final class InMemoryDesktopUtilitySettingsStore: DesktopUtilitySettingsStore {
  public var settings: DesktopUtilitySettings?
  public init(settings: DesktopUtilitySettings? = nil) { self.settings = settings }
  public func load() -> DesktopUtilitySettings? { settings }
  public func save(_ settings: DesktopUtilitySettings) throws { self.settings = settings }
}

public final class DesktopUtilitySettingsCoordinator {
  private let store: any DesktopUtilitySettingsStore
  public private(set) var settings: DesktopUtilitySettings

  public init(store: any DesktopUtilitySettingsStore) {
    self.store = store
    settings = store.load() ?? DesktopUtilitySettings()
  }

  public func update(_ settings: DesktopUtilitySettings) throws {
    self.settings = settings
    try store.save(settings)
  }

  public func captureShouldRun(permissionGranted: Bool, privateMode: Bool) -> Bool {
    settings.screenCaptureEnabled && permissionGranted && !privateMode
  }
}
