import Foundation

public enum ScreenMemoryRetentionPeriod: Int, CaseIterable, Codable, Equatable, Sendable {
  case threeDays = 3
  case sevenDays = 7
  case fourteenDays = 14
  case thirtyDays = 30

  public var retentionClass: String { "screen_memory_\(rawValue)d" }
  public var audioRetentionClass: String { "audio_memory_\(rawValue)d" }

  public func expiryDate(for capturedAt: Date) -> Date {
    capturedAt.addingTimeInterval(TimeInterval(rawValue * 24 * 60 * 60))
  }
}

public protocol ScreenMemoryRetentionPersisting: AnyObject {
  func loadRetentionPeriod() -> ScreenMemoryRetentionPeriod?
  func saveRetentionPeriod(_ period: ScreenMemoryRetentionPeriod) throws
}

public final class UserDefaultsScreenMemoryRetentionPersistence: ScreenMemoryRetentionPersisting {
  private let defaults: UserDefaults
  private let key: String

  public init(
    userID: String,
    defaults: UserDefaults = .standard,
    keyPrefix: String = "intentive.screen-memory.retention-days"
  ) {
    self.defaults = defaults
    key = "\(keyPrefix).\(DesktopLocalProfile.sanitizedUserID(userID))"
  }

  public func loadRetentionPeriod() -> ScreenMemoryRetentionPeriod? {
    guard defaults.object(forKey: key) != nil else { return nil }
    return ScreenMemoryRetentionPeriod(rawValue: defaults.integer(forKey: key))
  }

  public func saveRetentionPeriod(_ period: ScreenMemoryRetentionPeriod) throws {
    defaults.set(period.rawValue, forKey: key)
  }
}

public final class InMemoryScreenMemoryRetentionPersistence: ScreenMemoryRetentionPersisting {
  public var period: ScreenMemoryRetentionPeriod?

  public init(initial: ScreenMemoryRetentionPeriod? = nil) {
    period = initial
  }

  public func loadRetentionPeriod() -> ScreenMemoryRetentionPeriod? { period }

  public func saveRetentionPeriod(_ period: ScreenMemoryRetentionPeriod) throws {
    self.period = period
  }
}

public enum ScreenMemoryDeletionReason: String, Codable, Equatable, Sendable {
  case expired
  case manual
  case clearAll = "clear_all"
}

public struct ScreenMemoryDeletionResult: Equatable, Sendable {
  public let recordIDs: [String]
  public let reason: ScreenMemoryDeletionReason
  public let requiredChunkConfirmation: Bool

  public init(
    recordIDs: [String],
    reason: ScreenMemoryDeletionReason,
    requiredChunkConfirmation: Bool = false
  ) {
    self.recordIDs = recordIDs
    self.reason = reason
    self.requiredChunkConfirmation = requiredChunkConfirmation
  }
}

public struct ScreenMemoryStorageReport: Equatable, Sendable {
  public let databaseBytes: Int64
  public let videoBytes: Int64
  public let otherArchiveBytes: Int64

  public var totalBytes: Int64 { databaseBytes + videoBytes + otherArchiveBytes }

  public init(databaseBytes: Int64, videoBytes: Int64, otherArchiveBytes: Int64) {
    self.databaseBytes = databaseBytes
    self.videoBytes = videoBytes
    self.otherArchiveBytes = otherArchiveBytes
  }
}

struct ScreenMemoryDeletionPlan: Codable, Equatable {
  let id: String
  let reason: ScreenMemoryDeletionReason
  let recordIDs: [String]
  let audioRecordIDs: [String]
  let chunkIDs: [String]
  let clearsAll: Bool
}
