import Foundation

/// The utility-only navigation allow-list adapted from Omi's settings sidebar.
/// Conversation, assistants, providers, effects, voice response, and billing do
/// not have a destination in the Intentive main window.
public enum DesktopUtilitySection: String, CaseIterable, Codable, Equatable, Sendable {
  case screenMemory
  case privacy
  case sensing
  case account
  case updates
  case diagnostics
}

public struct DesktopUtilitySettings: Codable, Equatable, Sendable {
  public var retentionDays: Int
  public var screenCaptureEnabled: Bool
  public var passiveAudioEnabled: Bool
  public var floatingBarShortcut: String
  public var launchAtLogin: Bool
  public var analyticsEnabled: Bool
  public var selectedSection: DesktopUtilitySection

  public init(
    retentionDays: Int = 7,
    screenCaptureEnabled: Bool = true,
    passiveAudioEnabled: Bool = true,
    floatingBarShortcut: String = "command+o",
    launchAtLogin: Bool = false,
    analyticsEnabled: Bool = true,
    selectedSection: DesktopUtilitySection = .screenMemory
  ) {
    self.retentionDays = Self.allowedRetentionDays.contains(retentionDays) ? retentionDays : 7
    self.screenCaptureEnabled = screenCaptureEnabled
    self.passiveAudioEnabled = passiveAudioEnabled
    self.floatingBarShortcut = floatingBarShortcut
    self.launchAtLogin = launchAtLogin
    self.analyticsEnabled = analyticsEnabled
    self.selectedSection = selectedSection
  }

  public static let allowedRetentionDays = [3, 7, 14, 30]
}

public protocol DesktopUtilitySettingsStore: AnyObject {
  func load() -> DesktopUtilitySettings?
  func save(_ settings: DesktopUtilitySettings) throws
}

public final class UserDefaultsDesktopUtilitySettingsStore: DesktopUtilitySettingsStore {
  private let defaults: UserDefaults
  private let key: String

  public init(
    defaults: UserDefaults = .standard,
    key: String = "intentive.desktop.utility-settings"
  ) {
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

  public init(settings: DesktopUtilitySettings? = nil) {
    self.settings = settings
  }

  public func load() -> DesktopUtilitySettings? { settings }

  public func save(_ settings: DesktopUtilitySettings) throws {
    self.settings = settings
  }
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
