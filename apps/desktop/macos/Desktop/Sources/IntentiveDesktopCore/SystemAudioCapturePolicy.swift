import Foundation

public enum ConferencingApps {
  private static let nativeOwnerNames = [
    "facetime",
    "microsoft teams",
    "teams",
    "webex",
    "zoom.us",
  ]

  private static let nativeBundleIDs = [
    "com.apple.facetime",
    "com.cisco.webexmeetingsapp",
    "com.microsoft.teams",
    "com.microsoft.teams2",
    "us.zoom.xos",
  ]

  private static let browserOwnerNames = [
    "arc",
    "brave browser",
    "firefox",
    "google chrome",
    "helium",
    "microsoft edge",
    "safari",
  ]

  private static let browserBundlePrefixes = [
    "com.apple.safari",
    "com.apple.webkit",
    "com.brave.browser",
    "com.google.chrome",
    "com.microsoft.edgemac",
    "company.thebrowser.browser",
    "net.imput.helium",
    "org.mozilla.firefox",
  ]

  private static let browserCallTitleTokens = [
    "google meet",
    "meet.google.com",
    "teams.microsoft.com",
    "zoom meeting",
    "zoom.us",
    "webex",
    "whereby",
    "slack huddle",
  ]

  public static func isCallWindow(ownerName: String?, title: String?) -> Bool {
    guard let ownerName, !ownerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else {
      return false
    }

    let normalizedOwner = ownerName.lowercased()
    if nativeOwnerNames.contains(where: { normalizedOwner.contains($0) }) {
      return true
    }

    guard browserOwnerNames.contains(where: { normalizedOwner.contains($0) }) else {
      return false
    }
    let normalizedTitle = (title ?? "").lowercased()
    return browserCallTitleTokens.contains { normalizedTitle.contains($0) }
  }

  public static func isNativeCallApp(bundleID: String) -> Bool {
    let normalized = bundleID.lowercased()
    guard !normalized.hasPrefix("com.heyintentive.desktop") else { return false }
    return nativeBundleIDs.contains { normalized == $0 }
  }

  public static func isBrowserBundleID(_ bundleID: String) -> Bool {
    let normalized = bundleID.lowercased()
    guard !normalized.hasPrefix("com.heyintentive.desktop") else { return false }
    return browserBundlePrefixes.contains { normalized.hasPrefix($0) }
  }
}

@MainActor
public final class MeetingDetector {
  private let offGracePeriod: TimeInterval
  private let now: () -> Date
  private let onChange: (Bool) -> Void
  private var pendingOffSince: Date?

  public private(set) var isMeetingActive = false

  public init(
    pollInterval: TimeInterval,
    offGracePeriod: TimeInterval,
    now: @escaping () -> Date = Date.init,
    onChange: @escaping (Bool) -> Void
  ) {
    _ = pollInterval
    self.offGracePeriod = offGracePeriod
    self.now = now
    self.onChange = onChange
  }

  public func applyDetected(_ detected: Bool) {
    if detected {
      pendingOffSince = nil
      guard !isMeetingActive else { return }
      isMeetingActive = true
      onChange(true)
      return
    }

    guard isMeetingActive else { return }
    let currentTime = now()
    if pendingOffSince == nil {
      pendingOffSince = currentTime
      return
    }
    guard let pendingOffSince else { return }
    if currentTime.timeIntervalSince(pendingOffSince) >= offGracePeriod {
      self.pendingOffSince = nil
      isMeetingActive = false
      onChange(false)
    }
  }
}

public enum SystemAudioCaptureMode: String, CaseIterable, Codable, Sendable {
  case always
  case onlyDuringMeetings
  case never
}

@MainActor
public final class SystemAudioCaptureSettings {
  public static let shared = SystemAudioCaptureSettings()

  public static let key = "systemAudioCaptureMode"
  private let defaultMode: SystemAudioCaptureMode = .onlyDuringMeetings

  private init() {
    UserDefaults.standard.register(defaults: [Self.key: defaultMode.rawValue])
  }

  public var mode: SystemAudioCaptureMode {
    get {
      let raw = UserDefaults.standard.string(forKey: Self.key) ?? defaultMode.rawValue
      return SystemAudioCaptureMode(rawValue: raw) ?? defaultMode
    }
    set {
      UserDefaults.standard.set(newValue.rawValue, forKey: Self.key)
      NotificationCenter.default.post(name: .systemAudioCaptureModeDidChange, object: nil)
    }
  }
}

public extension Notification.Name {
  static let systemAudioCaptureModeDidChange = Notification.Name("systemAudioCaptureModeDidChange")
}
