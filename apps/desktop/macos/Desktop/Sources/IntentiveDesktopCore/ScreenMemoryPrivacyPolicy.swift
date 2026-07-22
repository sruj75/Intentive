import Foundation

public struct PrivacyZoneApplication: Codable, Equatable, Hashable, Sendable {
  public let bundleID: String?
  public let displayName: String

  public init(bundleID: String? = nil, displayName: String) {
    let normalizedBundleID = bundleID?.trimmingCharacters(in: .whitespacesAndNewlines)
    self.bundleID = normalizedBundleID?.isEmpty == false ? normalizedBundleID : nil
    self.displayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  fileprivate var identity: String {
    if let bundleID { return "bundle:\(bundleID.lowercased())" }
    return "name:\(Self.normalizedName(displayName))"
  }

  fileprivate func matches(appBundleID: String?, appName: String) -> Bool {
    let candidateBundleID = appBundleID?
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased()
    if let candidateBundleID, !candidateBundleID.isEmpty {
      // The captured application reported a bundle identifier, so bundle-ID
      // matching is authoritative: only an exclusion carrying the same
      // identifier matches. Never fall back to a colliding display name.
      guard let bundleID else { return false }
      return candidateBundleID == bundleID.lowercased()
    }
    // The captured application had no bundle identifier, so fall back to the
    // normalized display name even when the exclusion stored a bundle ID.
    return Self.normalizedName(displayName) == Self.normalizedName(appName)
  }

  fileprivate static func normalizedName(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }
}

public struct ScreenMemoryPrivacySnapshot: Equatable, Sendable {
  public let excludedApplications: Set<PrivacyZoneApplication>

  public init(
    excludedApplications: Set<PrivacyZoneApplication> = []
  ) {
    self.excludedApplications = excludedApplications
  }

  public func allows(appBundleID: String?, appName: String) -> Bool {
    !excludedApplications.contains { exclusion in
      exclusion.matches(appBundleID: appBundleID, appName: appName)
    }
  }
}

public protocol ScreenMemoryPrivacyPersisting: AnyObject {
  func loadPrivacyState() -> Data?
  func savePrivacyState(_ data: Data) throws
}

public final class UserDefaultsScreenMemoryPrivacyPersistence: ScreenMemoryPrivacyPersisting {
  private let defaults: UserDefaults
  private let key: String

  public init(
    defaults: UserDefaults = .standard,
    key: String = "intentive.screen-memory.privacy-zones"
  ) {
    self.defaults = defaults
    self.key = key
  }

  public func loadPrivacyState() -> Data? {
    defaults.data(forKey: key)
  }

  public func savePrivacyState(_ data: Data) throws {
    defaults.set(data, forKey: key)
  }
}

public final class InMemoryScreenMemoryPrivacyPersistence: ScreenMemoryPrivacyPersisting {
  public var data: Data?

  public init(data: Data? = nil) {
    self.data = data
  }

  public func loadPrivacyState() -> Data? { data }

  public func savePrivacyState(_ data: Data) throws {
    self.data = data
  }
}

private struct PersistedScreenMemoryPrivacyState: Codable {
  var excludedApplications: Set<PrivacyZoneApplication>
  var removedDefaultIdentities: Set<String>
}

/// The source-neutral Privacy Zones decision point. This is the Omi settings
/// merge/removal mechanism adapted away from singleton state and display-name-
/// only matching.
public final class ScreenMemoryPrivacyPolicy {
  public static let defaultExcludedApplications: Set<PrivacyZoneApplication> = [
    PrivacyZoneApplication(bundleID: "com.apple.Passwords", displayName: "Passwords"),
    PrivacyZoneApplication(bundleID: "com.1password.1password", displayName: "1Password"),
    PrivacyZoneApplication(bundleID: "com.agilebits.onepassword7", displayName: "1Password 7"),
    PrivacyZoneApplication(bundleID: "com.bitwarden.desktop", displayName: "Bitwarden"),
    PrivacyZoneApplication(bundleID: "com.lastpass.LastPass", displayName: "LastPass"),
    PrivacyZoneApplication(bundleID: "com.dashlane.Dashlane", displayName: "Dashlane"),
    PrivacyZoneApplication(bundleID: "com.callpod.KeeperMac", displayName: "Keeper"),
    PrivacyZoneApplication(bundleID: "in.sinew.Enpass-Desktop", displayName: "Enpass"),
    PrivacyZoneApplication(bundleID: "org.keepassxc.keepassxc", displayName: "KeePassXC"),
    PrivacyZoneApplication(bundleID: "com.apple.keychainaccess", displayName: "Keychain Access"),
  ]

  private let persistence: any ScreenMemoryPrivacyPersisting
  private let encoder = JSONEncoder()
  private var state: PersistedScreenMemoryPrivacyState

  public init(
    persistence: any ScreenMemoryPrivacyPersisting = UserDefaultsScreenMemoryPrivacyPersistence(),
    legacyExcludedAppNames: Set<String> = []
  ) {
    self.persistence = persistence
    let decoded = persistence.loadPrivacyState().flatMap {
      try? JSONDecoder().decode(PersistedScreenMemoryPrivacyState.self, from: $0)
    }
    if var decoded {
      let defaultsToMerge = Self.defaultExcludedApplications.filter {
        !decoded.removedDefaultIdentities.contains($0.identity)
      }
      decoded.excludedApplications.formUnion(defaultsToMerge)
      state = decoded
    } else {
      let migrated = legacyExcludedAppNames.map {
        PrivacyZoneApplication(displayName: $0)
      }
      state = PersistedScreenMemoryPrivacyState(
        excludedApplications: Self.defaultExcludedApplications.union(migrated),
        removedDefaultIdentities: []
      )
    }
    try? persist()
  }

  public var snapshot: ScreenMemoryPrivacySnapshot {
    ScreenMemoryPrivacySnapshot(
      excludedApplications: state.excludedApplications
    )
  }

  public func allows(appBundleID: String?, appName: String) -> Bool {
    snapshot.allows(appBundleID: appBundleID, appName: appName)
  }

  public func exclude(_ application: PrivacyZoneApplication) throws {
    state.excludedApplications.insert(application)
    state.removedDefaultIdentities.remove(application.identity)
    try persist()
  }

  public func include(_ application: PrivacyZoneApplication) throws {
    state.excludedApplications.remove(application)
    if Self.defaultExcludedApplications.contains(where: { $0.identity == application.identity }) {
      state.removedDefaultIdentities.insert(application.identity)
    }
    try persist()
  }

  public func resetPrivacyZonesToDefaults() throws {
    state.excludedApplications = Self.defaultExcludedApplications
    state.removedDefaultIdentities = []
    try persist()
  }

  public func replaceExcludedDisplayNames(_ displayNames: Set<String>) throws {
    let normalizedNames = Set(displayNames.map(PrivacyZoneApplication.normalizedName))
    var replacements = Set<PrivacyZoneApplication>()
    for name in displayNames where !PrivacyZoneApplication.normalizedName(name).isEmpty {
      let knownDefault = Self.defaultExcludedApplications.first {
        PrivacyZoneApplication.normalizedName($0.displayName)
          == PrivacyZoneApplication.normalizedName(name)
      }
      replacements.insert(knownDefault ?? PrivacyZoneApplication(displayName: name))
    }
    state.excludedApplications = replacements
    state.removedDefaultIdentities = Set(
      Self.defaultExcludedApplications.compactMap { application in
        normalizedNames.contains(PrivacyZoneApplication.normalizedName(application.displayName))
          ? nil
          : application.identity
      }
    )
    try persist()
  }

  private func persist() throws {
    try persistence.savePrivacyState(encoder.encode(state))
  }
}
