import Foundation

let candidateDefaults = UserDefaults(suiteName: "com.heyintentive.desktop")!

func jsonObject(forDefaultsKey key: String) -> [String: Any] {
  guard let data = candidateDefaults.data(forKey: key),
    let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
  else {
    return [:]
  }
  return object
}

func sqliteCount(database: URL, query: String) -> Int {
  let process = Process()
  let output = Pipe()
  process.executableURL = URL(fileURLWithPath: "/usr/bin/sqlite3")
  process.arguments = [database.path, query]
  process.standardOutput = output
  process.standardError = FileHandle.nullDevice
  try? process.run()
  process.waitUntilExit()
  let data = output.fileHandleForReading.readDataToEndOfFile()
  return Int(String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines))
    ?? 0
}

let utility = jsonObject(forDefaultsKey: "intentive.desktop.utility-settings")
let privacy = jsonObject(forDefaultsKey: "intentive.screen-memory.privacy-zones")
let onboarding = jsonObject(forDefaultsKey: "intentive.desktop.onboarding.progress.v3")
let exclusions = privacy["excludedApplications"] as? [[String: Any]] ?? []
let applicationSupport = FileManager.default.urls(
  for: .applicationSupportDirectory,
  in: .userDomainMask
).first!
let users = applicationSupport
  .appendingPathComponent("Intentive", isDirectory: true)
  .appendingPathComponent("users", isDirectory: true)
let databases = (
  (try? FileManager.default.contentsOfDirectory(
    at: users,
    includingPropertiesForKeys: nil
  )) ?? []
).map { $0.appendingPathComponent("intentive.db") }
  .filter { FileManager.default.fileExists(atPath: $0.path) }

let result: [String: Any] = [
  "capture_enabled": utility["screenCaptureEnabled"] as? Bool ?? false,
  "audio_enabled": utility["passiveAudioEnabled"] as? Bool ?? false,
  "retention_days": utility["retentionDays"] as? Int ?? 0,
  "launch_at_login": utility["launchAtLogin"] as? Bool ?? false,
  "onboarding_progress": onboarding,
  "excluded_applications": exclusions.sorted {
    ($0["displayName"] as? String ?? "") < ($1["displayName"] as? String ?? "")
  },
  "screen_record_count": databases.reduce(0) {
    $0 + sqliteCount(database: $1, query: "SELECT count(*) FROM screen_memory_records;")
  },
  "textedit_record_count": databases.reduce(0) {
    $0 + sqliteCount(
      database: $1,
      query: "SELECT count(*) FROM screen_memory_records WHERE app_bundle_id = 'com.apple.TextEdit';"
    )
  },
  "audio_record_count": databases.reduce(0) {
    $0 + sqliteCount(database: $1, query: "SELECT count(*) FROM audio_memory_records;")
  },
  "database_paths": databases.map(\.path),
]
let data = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write(Data("\n".utf8))
