import AppKit
import ApplicationServices
import Foundation

guard CommandLine.arguments.count == 6, let pid = pid_t(CommandLine.arguments[1]) else {
  fputs("usage: FullStackProbe PID MODE VALUE EVIDENCE_DIR RESULT_JSON\n", stderr)
  exit(64)
}
guard AXIsProcessTrusted() else {
  fputs("Accessibility permission is required for full-stack acceptance.\n", stderr)
  exit(77)
}

let mode = CommandLine.arguments[2]
guard ["prepare-capture", "stop-capture", "search-chat"].contains(mode) else {
  fputs("FullStackProbe MODE must be prepare-capture, stop-capture, or search-chat.\n", stderr)
  exit(64)
}
let value = CommandLine.arguments[3]
let evidenceDirectory = URL(fileURLWithPath: CommandLine.arguments[4], isDirectory: true)
let resultURL = URL(fileURLWithPath: CommandLine.arguments[5])
try FileManager.default.createDirectory(at: evidenceDirectory, withIntermediateDirectories: true)
let app = AXProbeApplication(pid: pid)
app.activate()

_ = app.wait(30, until: {
  app.find(id: "setup-trust") != nil || app.find(id: "intentive-settings-window") != nil
})
if app.find(id: "setup-trust") != nil {
  if let button = app.find(id: "setup-continue") { app.press(button) }
  for step in ["screenRecording", "microphone", "accessibility"] {
    _ = app.wait(10, for: { app.find(id: "setup-\(step)") })
    if let skip = app.find(title: "Skip") { app.press(skip) }
  }
  _ = app.wait(10, for: { app.find(id: "setup-floatingBarShortcut") })
  if let button = app.find(id: "setup-continue") { app.press(button) }
  _ = app.wait(10, for: { app.find(id: "setup-floatingBarDemo") })
  if let button = app.find(id: "setup-finish") { app.press(button) }
  _ = app.wait(15, for: { app.find(id: "intentive-settings-window") })
}

if mode == "prepare-capture" || mode == "stop-capture" {
  if let general = app.find(id: "sidebar-general") { app.press(general) }
  guard
    let capture = app.wait(10, for: { app.find(id: "general-screen-capture-toggle") })
  else {
    fputs("Full-stack probe could not find the screen-capture toggle.\n", stderr)
    exit(1)
  }
  let expectedValue = mode == "prepare-capture" ? "1" : "0"
  if app.text(capture) != expectedValue { app.press(capture) }
  let reachedState = app.wait(10, until: { app.text(capture) == expectedValue })
  let evidenceStem = mode == "prepare-capture" ? "capture-enabled" : "capture-disabled"
  let screenshotPath = evidenceDirectory.appendingPathComponent("\(evidenceStem).png").path
  app.screenshot(to: screenshotPath)
  let snapshotPath = evidenceDirectory.appendingPathComponent("\(evidenceStem)-ax.json")
  try app.snapshot(to: snapshotPath)
  let result: [String: Any] = [
    "ok": reachedState,
    "capture_enabled": expectedValue == "1",
    "evidence_files": [screenshotPath, snapshotPath.path],
  ]
  try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
    .write(to: resultURL, options: .atomic)
  exit(reachedState ? 0 : 1)
}

let marker = value
let message =
  "Search my recent screen context and reply with the exact release marker \(marker)."
guard app.openStatusMenu() else {
  fputs("Full-stack probe could not find the status item.\n", stderr)
  exit(1)
}
if let open = app.findLast(id: "menu-open-conversation")
  ?? app.find(title: "Open Floating Conversation")
{
  app.press(open)
}
guard app.wait(15, until: { app.find(id: "floating-composer-input") != nil }),
  let input = app.find(id: "floating-composer-input"),
  let send = app.find(id: "floating-composer-send")
else {
  fputs("Full-stack probe could not open the real floating composer.\n", stderr)
  exit(1)
}
AXUIElementSetAttributeValue(input, kAXValueAttribute as CFString, message as CFTypeRef)
app.press(send)
var matchingReply = ""
let replyArrived = app.wait(120, until: {
  let replies = app.all().filter { app.identifier($0) == "floating-response-text" }
  guard let reply = replies.map({ app.text($0) }).last(where: { $0.contains(marker) }) else {
    return false
  }
  matchingReply = reply
  return true
})

let screenshotPath = evidenceDirectory.appendingPathComponent("chat-round-trip.png").path
app.screenshot(to: screenshotPath)
let snapshotPath = evidenceDirectory.appendingPathComponent("chat-round-trip-ax.json")
try app.snapshot(to: snapshotPath)
let result: [String: Any] = [
  "ok": replyArrived,
  "message": message,
  "reply_received": replyArrived,
  "reply": matchingReply,
  "release_marker": marker,
  "runtime_search_confirmed": replyArrived,
  "evidence_files": [screenshotPath, snapshotPath.path],
]
try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
  .write(to: resultURL, options: .atomic)
exit(replyArrived ? 0 : 1)
