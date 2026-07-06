import Foundation

public enum DesktopLocalProfile {
  public static let applicationSupportDirectoryName = "Intentive"
  public static let legacyOmiApplicationSupportDirectoryName = "Omi"
  public static let anonymousUserID = "anonymous"

  public static func applicationSupportURL(
    fileManager: FileManager = .default,
    baseApplicationSupportURL: URL? = nil
  ) throws -> URL {
    let base = try resolveApplicationSupportBase(
      fileManager: fileManager,
      baseApplicationSupportURL: baseApplicationSupportURL
    )
    let directory = base.appendingPathComponent(applicationSupportDirectoryName, isDirectory: true)
    try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }

  public static func userSupportURL(
    userID: String? = nil,
    fileManager: FileManager = .default,
    baseApplicationSupportURL: URL? = nil
  ) throws -> URL {
    let directory = try applicationSupportURL(
      fileManager: fileManager,
      baseApplicationSupportURL: baseApplicationSupportURL
    )
    .appendingPathComponent("users", isDirectory: true)
    .appendingPathComponent(sanitizedUserID(userID), isDirectory: true)

    try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }

  public static func screenMemoryDatabaseURL(
    userID: String? = nil,
    fileManager: FileManager = .default,
    baseApplicationSupportURL: URL? = nil
  ) throws -> URL {
    try userSupportURL(
      userID: userID,
      fileManager: fileManager,
      baseApplicationSupportURL: baseApplicationSupportURL
    )
    .appendingPathComponent("screen-memory.sqlite")
  }

  public static func legacyOmiApplicationSupportURL(
    fileManager: FileManager = .default,
    baseApplicationSupportURL: URL? = nil
  ) throws -> URL {
    let base = try resolveApplicationSupportBase(
      fileManager: fileManager,
      baseApplicationSupportURL: baseApplicationSupportURL
    )
    return base.appendingPathComponent(legacyOmiApplicationSupportDirectoryName, isDirectory: true)
  }

  public static func legacyOmiUserSupportURL(
    userID: String? = nil,
    fileManager: FileManager = .default,
    baseApplicationSupportURL: URL? = nil
  ) throws -> URL {
    try legacyOmiApplicationSupportURL(
      fileManager: fileManager,
      baseApplicationSupportURL: baseApplicationSupportURL
    )
    .appendingPathComponent("users", isDirectory: true)
    .appendingPathComponent(sanitizedUserID(userID), isDirectory: true)
  }

  public static func sanitizedUserID(_ userID: String?) -> String {
    let trimmed = userID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !trimmed.isEmpty else { return anonymousUserID }

    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "._-"))
    let sanitizedScalars = trimmed.unicodeScalars.map { scalar -> Character in
      allowed.contains(scalar) ? Character(scalar) : "-"
    }
    let sanitized = String(sanitizedScalars)
      .trimmingCharacters(in: CharacterSet(charactersIn: ".-_"))
    return sanitized.isEmpty ? anonymousUserID : sanitized
  }

  private static func resolveApplicationSupportBase(
    fileManager: FileManager,
    baseApplicationSupportURL: URL?
  ) throws -> URL {
    if let baseApplicationSupportURL {
      try fileManager.createDirectory(at: baseApplicationSupportURL, withIntermediateDirectories: true)
      return baseApplicationSupportURL
    }

    return try fileManager.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
  }
}
