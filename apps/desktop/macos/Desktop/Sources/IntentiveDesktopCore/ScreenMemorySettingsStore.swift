import Foundation

public protocol ScreenMemorySettingsStore {
  func load() -> CompilerSettings
  func save(_ settings: CompilerSettings) throws
}

public final class UserDefaultsScreenMemorySettingsStore: ScreenMemorySettingsStore {
  private let defaults: UserDefaults
  private let key: String
  private let encoder = JSONEncoder()
  private let decoder = JSONDecoder()

  public init(
    defaults: UserDefaults = .standard,
    key: String = "intentive.screen-memory.compiler-settings"
  ) {
    self.defaults = defaults
    self.key = key
  }

  public func load() -> CompilerSettings {
    guard let data = defaults.data(forKey: key) else {
      return CompilerSettings()
    }
    return (try? decoder.decode(CompilerSettings.self, from: data)) ?? CompilerSettings()
  }

  public func save(_ settings: CompilerSettings) throws {
    let data = try encoder.encode(settings)
    defaults.set(data, forKey: key)
  }
}

public final class InMemoryScreenMemorySettingsStore: ScreenMemorySettingsStore {
  public var settings: CompilerSettings

  public init(settings: CompilerSettings = CompilerSettings()) {
    self.settings = settings
  }

  public func load() -> CompilerSettings {
    settings
  }

  public func save(_ settings: CompilerSettings) throws {
    self.settings = settings
  }
}
