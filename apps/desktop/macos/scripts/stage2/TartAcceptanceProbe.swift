import AppKit
import ApplicationServices
import Foundation

guard CommandLine.arguments.count == 5, let pid = pid_t(CommandLine.arguments[1]) else {
  fputs("usage: TartAcceptanceProbe PID MODE EVIDENCE_DIR RESULT_JSON\n", stderr)
  exit(64)
}
guard AXIsProcessTrusted() else {
  fputs("Accessibility permission is required for Tart acceptance.\n", stderr)
  exit(77)
}

let mode = CommandLine.arguments[2]
guard mode == "initial" || mode == "final" else {
  fputs("TartAcceptanceProbe MODE must be initial or final.\n", stderr)
  exit(64)
}
let evidenceDirectory = URL(fileURLWithPath: CommandLine.arguments[3], isDirectory: true)
let resultURL = URL(fileURLWithPath: CommandLine.arguments[4])
try FileManager.default.createDirectory(at: evidenceDirectory, withIntermediateDirectories: true)
let app = AXProbeApplication(pid: pid)
app.activate()

var checks: [String: Bool] = [:]
let privacyCopy =
  "Intentive is private by design. These permissions help it understand your work and help in the right places."
if mode == "initial" {
  checks["clean-first-launch"] =
    app.wait(30, for: { app.find(id: "setup-trust") }) != nil
  checks["privacy-copy-before-permissions"] = app.all().contains { app.text($0) == privacyCopy }
  let screenshot = evidenceDirectory.appendingPathComponent("initial-onboarding.png").path
  app.screenshot(to: screenshot)
  let snapshot = evidenceDirectory.appendingPathComponent("initial-onboarding-ax.json")
  try app.snapshot(to: snapshot)
  let passed = checks.values.allSatisfy { $0 }
  let result: [String: Any] = [
    "ok": passed,
    "checks": checks,
    "evidence_files": [screenshot, snapshot.path],
  ]
  try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
    .write(to: resultURL, options: .atomic)
  exit(passed ? 0 : 1)
}

checks["operator-completed-onboarding"] =
  app.wait(30, for: { app.find(id: "intentive-settings-window") }) != nil
for id in [
  "general-screen-capture-toggle",
  "general-audio-recording-toggle",
  "general-system-audio-mode",
  "general-launch-at-login-toggle",
] {
  checks[id] = app.find(id: id) != nil
}

if let rewind = app.find(id: "sidebar-rewind") { app.press(rewind) }
for id in ["rewind-retention-picker", "rewind-exclusion-input", "rewind-exclusion-add"] {
  checks[id] = app.wait(5, for: { app.find(id: id) }) != nil
}
if let privacy = app.find(id: "sidebar-privacy") { app.press(privacy) }
checks["raw-media-boundary"] =
  app.all().contains { app.text($0) == "Raw media stays on this Mac in V1" }
checks["privacy-store-recordings-toggle"] =
  app.find(id: "privacy-store-recordings-toggle") != nil
if let about = app.find(id: "sidebar-about") { app.press(about) }
for id in [
  "about-check-updates",
  "about-automatic-update-check-toggle",
  "about-auto-install-updates-toggle",
] {
  checks[id] = app.wait(5, for: { app.find(id: id) }) != nil
}

let settingsScreenshot = evidenceDirectory.appendingPathComponent("final-settings.png").path
app.screenshot(to: settingsScreenshot)
let axSnapshot = evidenceDirectory.appendingPathComponent("final-ax.json")
try app.snapshot(to: axSnapshot)
let passed = !checks.isEmpty && checks.values.allSatisfy { $0 }
let result: [String: Any] = [
  "ok": passed,
  "checks": checks,
  "evidence_files": [settingsScreenshot, axSnapshot.path],
]
try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
  .write(to: resultURL, options: .atomic)
exit(passed ? 0 : 1)
