import AppKit
import ApplicationServices
import Foundation

struct EvidenceStep: Codable {
  let name: String
  let element: String
  let preValue: String?
  let postValue: String?
  let timestamp: String
  let screenshot: String
  let axSnapshot: String
  let appLogReference: String
  let assertion: String
  let passed: Bool
}

struct EvidenceResult: Codable {
  let ok: Bool
  let gitSHA: String
  let startedAt: String
  let finishedAt: String
  let steps: [EvidenceStep]
}

struct BridgeCredentials: Decodable {
  let port: Int
  let token: String
}

let arguments = CommandLine.arguments
guard arguments.count == 6,
  let pid = pid_t(arguments[1])
else {
  fputs("usage: IntentiveAXAcceptance PID RESULT_JSON EVIDENCE_DIR GIT_SHA APP_LOG\n", stderr)
  exit(64)
}
let resultURL = URL(fileURLWithPath: arguments[2])
let evidenceDirectory = URL(fileURLWithPath: arguments[3], isDirectory: true)
let gitSHA = arguments[4]
let appLog = arguments[5]
let tokenFile = ProcessInfo.processInfo.environment["INTENTIVE_AUTOMATION_TOKEN_FILE"]
  ?? URL(fileURLWithPath: appLog).deletingLastPathComponent()
    .appendingPathComponent("automation.json").path
let startedAt = ISO8601DateFormatter().string(from: Date())
try FileManager.default.createDirectory(at: evidenceDirectory, withIntermediateDirectories: true)

guard AXIsProcessTrusted() else {
  fputs("Accessibility permission is required for the external assembled driver.\n", stderr)
  exit(77)
}

let app = AXUIElementCreateApplication(pid)
NSRunningApplication(processIdentifier: pid)?.activate(options: [.activateAllWindows])
var steps: [EvidenceStep] = []

let credentials = try JSONDecoder().decode(
  BridgeCredentials.self,
  from: Data(contentsOf: URL(fileURLWithPath: tokenFile)))

func bridgeRequest(_ method: String, _ path: String) throws -> [String: Any] {
  let url = URL(string: "http://127.0.0.1:\(credentials.port)\(path)")!
  var request = URLRequest(url: url)
  request.httpMethod = method
  request.setValue("Bearer \(credentials.token)", forHTTPHeaderField: "Authorization")
  request.setValue("127.0.0.1:\(credentials.port)", forHTTPHeaderField: "Host")
  let semaphore = DispatchSemaphore(value: 0)
  var responseData: Data?
  var httpResponse: HTTPURLResponse?
  var responseError: Error?
  URLSession.shared.dataTask(with: request) { data, response, error in
    responseData = data
    httpResponse = response as? HTTPURLResponse
    responseError = error
    semaphore.signal()
  }.resume()
  guard semaphore.wait(timeout: .now() + 15) == .success else {
    throw URLError(.timedOut)
  }
  if let responseError { throw responseError }
  guard let httpResponse, (200..<300).contains(httpResponse.statusCode) else {
    let responseBody = responseData.flatMap {
      try? JSONSerialization.jsonObject(with: $0) as? [String: Any]
    }
    let detail = responseBody?["detail"] as? String
    throw NSError(
      domain: "IntentiveAXAcceptance.Bridge",
      code: httpResponse?.statusCode ?? -1,
      userInfo: [
        NSLocalizedDescriptionKey:
          "Bridge request failed: \(method) \(path)"
          + detail.map { ": \($0)" }.orEmpty
      ]
    )
  }
  guard let body = try JSONSerialization.jsonObject(with: responseData ?? Data()) as? [String: Any]
  else {
    throw NSError(
      domain: "IntentiveAXAcceptance.Bridge",
      code: -2,
      userInfo: [NSLocalizedDescriptionKey: "Bridge returned a non-object response"]
    )
  }
  return body
}

private extension Optional where Wrapped == String {
  var orEmpty: String { self ?? "" }
}

var bridgeFailure: String?
func bridgeState() -> [String: Any] {
  do { return try bridgeRequest("GET", "/v1/state") }
  catch {
    bridgeFailure = error.localizedDescription
    fputs("Bridge state failed: \(error)\n", stderr)
    return [:]
  }
}
func integer(_ value: Any?) -> Int {
  (value as? NSNumber)?.intValue ?? (value as? Int) ?? 0
}

func value(_ element: AXUIElement, _ attribute: CFString) -> AnyObject? {
  var result: CFTypeRef?
  guard AXUIElementCopyAttributeValue(element, attribute, &result) == .success else { return nil }
  return result
}

func stringValue(_ element: AXUIElement) -> String? {
  (value(element, kAXValueAttribute as CFString) as? String)
    ?? (value(element, kAXValueAttribute as CFString) as? NSNumber)?.stringValue
    ?? (value(element, kAXTitleAttribute as CFString) as? String)
}

func positionY(_ element: AXUIElement) -> CGFloat? {
  guard let raw = value(element, kAXPositionAttribute as CFString) else { return nil }
  var point = CGPoint.zero
  guard AXValueGetValue(raw as! AXValue, .cgPoint, &point) else { return nil }
  return point.y
}

func identifier(_ element: AXUIElement) -> String {
  (value(element, kAXIdentifierAttribute as CFString) as? String)
    ?? (value(element, kAXTitleAttribute as CFString) as? String)
    ?? (value(element, kAXDescriptionAttribute as CFString) as? String)
    ?? "unidentified"
}

func descendants(_ root: AXUIElement, depth: Int = 0) -> [AXUIElement] {
  guard depth < 18 else { return [] }
  var children = value(root, kAXChildrenAttribute as CFString) as? [AXUIElement] ?? []
  if depth == 0 {
    let windows = value(root, kAXWindowsAttribute as CFString) as? [AXUIElement] ?? []
    children.append(contentsOf: windows)
    if let extras = value(root, kAXExtrasMenuBarAttribute as CFString) {
      children.append(extras as! AXUIElement)
    }
  }
  return children + children.flatMap { descendants($0, depth: depth + 1) }
}

func find(_ root: AXUIElement, id: String) -> AXUIElement? {
  ([root] + descendants(root)).first { identifier($0) == id }
}

func findLast(_ root: AXUIElement, id: String) -> AXUIElement? {
  ([root] + descendants(root)).last { identifier($0) == id }
}

func findTitle(_ root: AXUIElement, _ title: String) -> AXUIElement? {
  ([root] + descendants(root)).first {
    (value($0, kAXTitleAttribute as CFString) as? String) == title
      || stringValue($0) == title
  }
}

func findAfterScrolling(_ root: AXUIElement, id: String) -> AXUIElement? {
  if let element = find(root, id: id) { return element }
  let scrollAreas = ([root] + descendants(root)).filter {
    (value($0, kAXRoleAttribute as CFString) as? String) == (kAXScrollAreaRole as String)
  }
  guard let scrollArea = scrollAreas.first else { return nil }
  for action in ["AXScrollUp", "AXScrollDown"] {
    for _ in 0..<16 {
      if let element = find(root, id: id) { return element }
      AXUIElementPerformAction(scrollArea, action as CFString)
      RunLoop.current.run(until: Date().addingTimeInterval(0.15))
    }
  }
  return find(root, id: id)
}

func pressableAncestor(_ element: AXUIElement) -> AXUIElement? {
  var current: AXUIElement? = element
  for _ in 0..<8 {
    guard let candidate = current else { return nil }
    if supportsPress(candidate) { return candidate }
    guard let parent = value(candidate, kAXParentAttribute as CFString) else { return nil }
    current = (parent as! AXUIElement)
  }
  return nil
}

func supportsPress(_ element: AXUIElement) -> Bool {
  var actions: CFArray?
  guard AXUIElementCopyActionNames(element, &actions) == .success else { return false }
  return (actions as? [String])?.contains(kAXPressAction as String) == true
}

func openStatusMenu(_ statusItem: AXUIElement) {
  AXUIElementPerformAction(statusItem, kAXPressAction as CFString)
  RunLoop.current.run(until: Date().addingTimeInterval(0.25))
  if find(app, id: "menu-open-intentive").flatMap(positionY) == nil {
    AXUIElementPerformAction(statusItem, kAXPressAction as CFString)
    RunLoop.current.run(until: Date().addingTimeInterval(0.25))
  }
}

func bringMainWindowForward() {
  NSRunningApplication(processIdentifier: pid)?.activate(options: [.activateAllWindows])
  if let windowMenu = findTitle(app, "Window") {
    AXUIElementPerformAction(windowMenu, kAXPressAction as CFString)
    RunLoop.current.run(until: Date().addingTimeInterval(0.15))
    if let appWindow = find(app, id: "makeKeyAndOrderFront:") {
      AXUIElementPerformAction(appWindow, kAXPressAction as CFString)
      RunLoop.current.run(until: Date().addingTimeInterval(0.3))
    }
  }
  guard let statusItem = find(app, id: "menu-status-item") ?? findTitle(app, "Intentive") else {
    return
  }
  openStatusMenu(statusItem)
  if let openApp = findLast(app, id: "menu-open-intentive") ?? findTitle(app, "Open Intentive") {
    AXUIElementPerformAction(openApp, kAXPressAction as CFString)
    RunLoop.current.run(until: Date().addingTimeInterval(0.4))
  }
}

func snapshot(_ root: AXUIElement, name: String) throws -> String {
  let rows = ([root] + descendants(root)).prefix(500).map { element -> [String: String] in
    [
      "identifier": identifier(element),
      "role": (value(element, kAXRoleAttribute as CFString) as? String) ?? "",
      "value": stringValue(element) ?? "",
    ]
  }
  let url = evidenceDirectory.appendingPathComponent("\(name)-ax.json")
  let data = try JSONSerialization.data(withJSONObject: rows, options: [.prettyPrinted, .sortedKeys])
  try data.write(to: url, options: .atomic)
  return url.path
}

func screenshot(_ name: String) -> String {
  let path = evidenceDirectory.appendingPathComponent("\(name).png").path
  let process = Process()
  process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
  process.arguments = ["-x", path]
  try? process.run(); process.waitUntilExit()
  return path
}

func record(
  name: String,
  element: AXUIElement,
  assertion: String,
  action: (() -> Void)? = nil,
  verify: () -> Bool
) {
  let pre = stringValue(element)
  action?()
  RunLoop.current.run(until: Date().addingTimeInterval(0.25))
  let passed = verify()
  // A person can switch Spaces while the dedicated-Mac run is collecting
  // evidence. Return to the app before the screenshot so the next AX lookup
  // still sees its windows and the evidence depicts the journey under test.
  NSRunningApplication(processIdentifier: pid)?.activate(options: [.activateAllWindows])
  RunLoop.current.run(until: Date().addingTimeInterval(0.2))
  let safe = name.replacingOccurrences(of: " ", with: "-")
  steps.append(EvidenceStep(
    name: name,
    element: identifier(element),
    preValue: pre,
    postValue: stringValue(element),
    timestamp: ISO8601DateFormatter().string(from: Date()),
    screenshot: screenshot(safe),
    axSnapshot: (try? snapshot(app, name: safe)) ?? "",
    appLogReference: appLog,
    assertion: assertion,
    passed: passed
  ))
  fputs("acceptance step \(name): \(passed ? "passed" : "FAILED")\n", stderr)
}

bringMainWindowForward()
let initialWindowDeadline = Date().addingTimeInterval(2)
while find(app, id: "omi-settings-window") == nil && Date() < initialWindowDeadline {
  RunLoop.current.run(until: Date().addingTimeInterval(0.2))
}
if find(app, id: "omi-settings-window") == nil {
  if let windowMenu = findTitle(app, "Window"), supportsPress(windowMenu) {
    AXUIElementPerformAction(windowMenu, kAXPressAction as CFString)
    RunLoop.current.run(until: Date().addingTimeInterval(0.25))
  }
  if let newWindow = findTitle(app, "New Window"), supportsPress(newWindow) {
    AXUIElementPerformAction(newWindow, kAXPressAction as CFString)
  }
}
let deadline = Date().addingTimeInterval(30)
while find(app, id: "omi-settings-window") == nil && Date() < deadline {
  RunLoop.current.run(until: Date().addingTimeInterval(0.2))
}

let seeded = try bridgeRequest("POST", "/v1/fixtures/seed")
fputs("acceptance fixture response: \(seeded)\n", stderr)
fputs("acceptance state after seed: \(bridgeState())\n", stderr)
let initialRoot = find(app, id: "omi-settings-window") ?? app
record(
  name: "fixture-seed",
  element: initialRoot,
  assertion: "bridge seeded the real local archive and did not perform a user action"
) {
  integer(seeded["screen_memory_frames"]) >= 2
}
let frameDeadline = Date().addingTimeInterval(10)
while integer(bridgeState()["screen_memory_frames"]) < 2 && Date() < frameDeadline {
  RunLoop.current.run(until: Date().addingTimeInterval(0.2))
}

let settingsDestinations = [
  ("settings-general", "sidebar-general"),
  ("settings-rewind", "sidebar-rewind"),
  ("settings-privacy", "sidebar-privacy"),
  ("settings-about", "sidebar-about"),
]
let settingsDeadline = Date().addingTimeInterval(5)
while settingsDestinations.contains(where: { find(app, id: $0.1) == nil })
  && Date() < settingsDeadline {
  RunLoop.current.run(until: Date().addingTimeInterval(0.1))
}
for (name, id) in settingsDestinations {
  let destination = find(app, id: id) ?? initialRoot
  record(
    name: name,
    element: destination,
    assertion: "the Omi-derived Settings sidebar exposes the approved \(name) destination",
    action: { if supportsPress(destination) { AXUIElementPerformAction(destination, kAXPressAction as CFString) } },
    verify: { find(app, id: id) != nil }
  )
}

// A Post-Message-Back reply surfaces in the one conversation thread (no separate
// notification/snooze surface): the bar auto-opens engaged, the message lands in
// the thread, and its reply composer is present so the user can answer inline.
let proactiveMessagesBefore = integer(bridgeState()["conversation_message_count"])
_ = try bridgeRequest("POST", "/v1/fixtures/proactive-message")
record(
  name: "proactive-pmb-in-thread",
  element: initialRoot,
  assertion: "a Post-Message-Back message appears in the one conversation thread and can be replied to inline",
  verify: {
    let settle = Date().addingTimeInterval(4)
    while Date() < settle {
      let state = bridgeState()
      if state["floating_bar_visible"] as? Bool == true,
        state["floating_bar_engaged"] as? Bool == true,
        integer(state["conversation_message_count"]) > proactiveMessagesBefore {
        return true
      }
      RunLoop.current.run(until: Date().addingTimeInterval(0.2))
    }
    return false
  }
)

if let report = findAfterScrolling(app, id: "about-report-issue") {
  AXUIElementPerformAction(report, kAXPressAction as CFString)
  RunLoop.current.run(until: Date().addingTimeInterval(0.5))
  if let message = find(app, id: "report-issue-message") {
    AXUIElementSetAttributeValue(message, kAXValueAttribute as CFString, "Acceptance report" as CFTypeRef)
    if let send = find(app, id: "report-issue-send") {
      record(
        name: "report-issue-send",
        element: send,
        assertion: "the About tab's Report Issue action reaches a visible success or offline failure state",
        action: { AXUIElementPerformAction(send, kAXPressAction as CFString) },
        verify: { find(app, id: "report-issue-result") != nil }
      )
    }
  }
  if let cancel = find(app, id: "report-issue-cancel") ?? findTitle(app, "Cancel") {
    AXUIElementPerformAction(pressableAncestor(cancel) ?? cancel, kAXPressAction as CFString)
    RunLoop.current.run(until: Date().addingTimeInterval(0.3))
  }
}

if let statusItem = find(app, id: "menu-status-item") ?? findTitle(app, "Intentive") {
  AXUIElementPerformAction(statusItem, kAXPressAction as CFString)
  RunLoop.current.run(until: Date().addingTimeInterval(0.3))
  if let capture = findLast(app, id: "menu-screen-capture-switch") {
    let capturedBefore = integer(bridgeState()["capture_source_frames"])
    record(
      name: "capture-enable-first-frame",
      element: capture,
      assertion: "AXPress starts the authoritative capture source and produces a real first frame",
      action: { AXUIElementPerformAction(capture, kAXPressAction as CFString) },
      verify: {
        let deadline = Date().addingTimeInterval(15)
        while Date() < deadline {
          let state = bridgeState()
          if String(describing: state["capture_state"] ?? "").localizedCaseInsensitiveContains("running"),
            integer(state["capture_source_frames"]) > capturedBefore,
            integer(state["screen_memory_frames"]) > 0 { return true }
          RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        return false
      }
    )
  }
  if find(app, id: "menu-audio-recording-switch") == nil {
    AXUIElementPerformAction(statusItem, kAXPressAction as CFString)
    RunLoop.current.run(until: Date().addingTimeInterval(0.2))
  }
  if let audio = findLast(app, id: "menu-audio-recording-switch") {
    record(
      name: "audio-microphone-running",
      element: audio,
      assertion: "AXPress starts the real CoreAudio microphone source",
      action: { AXUIElementPerformAction(audio, kAXPressAction as CFString) },
      verify: {
        let deadline = Date().addingTimeInterval(10)
        while Date() < deadline {
          if String(describing: bridgeState()["passive_audio_state"] ?? "")
            .localizedCaseInsensitiveContains("microphone: true") { return true }
          RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        return false
      }
    )
  }
  if findTitle(app, "Report Issue…") != nil {
    AXUIElementPerformAction(statusItem, kAXPressAction as CFString)
    RunLoop.current.run(until: Date().addingTimeInterval(0.2))
  }
}

// Omi-style AppKit menu and Report Issue. Opening and sending are real AX
// actions; the bridge is used only for state observation.
if let statusItem = find(app, id: "menu-status-item") ?? findTitle(app, "Intentive") {
  record(
    name: "menu-order",
    element: statusItem,
    assertion: "the exact Omi menu order is exposed by the running app",
    action: { AXUIElementPerformAction(statusItem, kAXPressAction as CFString) },
    verify: {
      let expected = [
        "menu-screen-capture-switch", "menu-audio-recording-switch", "menu-open-intentive",
        "menu-check-updates", "menu-account", "menu-reset-onboarding", "menu-report-issue",
        "menu-sign-out", "menu-quit-intentive",
      ]
      let positioned = expected.compactMap { id -> (String, CGFloat)? in
        guard let element = find(app, id: id), let y = positionY(element) else { return nil }
        return (id, y)
      }
      return positioned.count == expected.count
        && positioned.sorted { $0.1 < $1.1 }.map(\.0) == expected
    }
  )
  if let account = findLast(app, id: "menu-account") {
    record(
      name: "account-verified-email",
      element: account,
      assertion: "the disabled Omi account row renders the verified /me email",
      verify: { stringValue(account)?.localizedCaseInsensitiveContains("acceptance@example.com") == true }
    )
  }
}

if !steps.contains(where: { $0.name == "capture-enable-first-frame" && $0.passed })
  || !steps.contains(where: { $0.name == "audio-microphone-running" && $0.passed }) {
  bringMainWindowForward()
  if let general = find(app, id: "sidebar-general")
    ?? findTitle(app, "General").flatMap(pressableAncestor) {
    AXUIElementPerformAction(general, kAXPressAction as CFString)
    RunLoop.current.run(until: Date().addingTimeInterval(0.4))
  }
  if !steps.contains(where: { $0.name == "capture-enable-first-frame" && $0.passed }),
    let capture = find(app, id: "general-screen-capture-toggle") {
    let capturedBefore = integer(bridgeState()["capture_source_frames"])
    record(
      name: "capture-enable-first-frame",
      element: capture,
      assertion: "AXPress starts authoritative capture through the Omi-derived General control",
      action: { AXUIElementPerformAction(capture, kAXPressAction as CFString) },
      verify: {
        let deadline = Date().addingTimeInterval(15)
        while Date() < deadline {
          let state = bridgeState()
          if state["capture_source_running"] as? Bool == true,
            integer(state["capture_source_frames"]) > capturedBefore { return true }
          RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        return false
      }
    )
  }
  if !steps.contains(where: { $0.name == "audio-microphone-running" && $0.passed }),
    let audio = find(app, id: "general-audio-recording-toggle") {
    record(
      name: "audio-microphone-running",
      element: audio,
      assertion: "AXPress starts passive microphone sensing through the Omi-derived General control",
      action: { AXUIElementPerformAction(audio, kAXPressAction as CFString) },
      verify: {
        let deadline = Date().addingTimeInterval(10)
        while Date() < deadline {
          if String(describing: bridgeState()["passive_audio_state"] ?? "")
            .localizedCaseInsensitiveContains("microphone: true") { return true }
          RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        return false
      }
    )
  }
}


// Quiesce both real sensing coordinators through production settings controls
// before faulting the Runtime link so the durable-outbox count cannot grow.
bringMainWindowForward()
if let general = find(app, id: "sidebar-general")
  ?? findTitle(app, "General").flatMap(pressableAncestor) {
  AXUIElementPerformAction(general, kAXPressAction as CFString)
  RunLoop.current.run(until: Date().addingTimeInterval(0.3))
  if let capture = find(app, id: "general-screen-capture-toggle"),
    integer(bridgeState()["capture_enabled"]) == 1 {
    record(
      name: "capture-disable",
      element: capture,
      assertion: "AXPress stops the authoritative capture source",
      action: { AXUIElementPerformAction(capture, kAXPressAction as CFString) },
      verify: {
        let deadline = Date().addingTimeInterval(3)
        while Date() < deadline {
          let state = bridgeState()
          if integer(state["capture_enabled"]) == 0,
            state["capture_source_running"] as? Bool == false { return true }
          RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        return false
      }
    )
  }
  if let audio = find(app, id: "general-audio-recording-toggle"),
    integer(bridgeState()["passive_audio_enabled"]) == 1 {
    record(
      name: "audio-disable",
      element: audio,
      assertion: "AXPress stops microphone and meeting-gated system audio",
      action: { AXUIElementPerformAction(audio, kAXPressAction as CFString) },
      verify: {
        let deadline = Date().addingTimeInterval(3)
        while Date() < deadline {
          let state = bridgeState()
          if integer(state["passive_audio_enabled"]) == 0,
            String(describing: state["passive_audio_state"] ?? "") == "disabled" { return true }
          RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        return false
      }
    )
  }
}

let pendingBefore = integer(bridgeState()["runtime_ingress_pending"])
var reconnectResponse: [String: Any] = [:]
record(
  name: "runtime-lost-ack",
  element: initialRoot,
  assertion: "a dropped Runtime commit acknowledgement leaves durable ingress queued",
  action: {
    _ = try! bridgeRequest("POST", "/v1/faults/drop-next-ack")
    _ = try! bridgeRequest("POST", "/v1/faults/emit-pending-ack")
  },
  verify: { pendingBefore > 0 && integer(bridgeState()["runtime_ingress_pending"]) == pendingBefore }
)
record(
  name: "runtime-reconnect-redelivery",
  element: initialRoot,
  assertion: "the real Runtime adapter disconnects and reconnects without deleting unacknowledged ingress",
  action: {
    _ = try! bridgeRequest("POST", "/v1/faults/runtime-disconnect")
    reconnectResponse = try! bridgeRequest("POST", "/v1/faults/runtime-reconnect")
  },
  verify: {
    let deadline = Date().addingTimeInterval(3)
    while Date() < deadline {
      let state = bridgeState()
      let connected = String(describing: state["runtime_state"] ?? "")
        .localizedCaseInsensitiveContains("connected")
        || String(describing: reconnectResponse["runtime_state"] ?? "")
          .localizedCaseInsensitiveContains("connected")
      if connected,
        integer(state["runtime_ingress_pending"]) >= pendingBefore { return true }
      RunLoop.current.run(until: Date().addingTimeInterval(0.1))
    }
    return false
  }
)
record(
  name: "runtime-ack-dedupe",
  element: initialRoot,
  assertion: "commit acknowledgements drain every row and a duplicate acknowledgement is idempotent",
  action: {
    for _ in 0..<100 {
      if integer(bridgeState()["runtime_ingress_pending"]) == 0 { break }
      let response = try! bridgeRequest("POST", "/v1/faults/emit-pending-ack")
      precondition(response["acknowledged"] as? Bool == true, "ack drain made no progress")
    }
    precondition(integer(bridgeState()["runtime_ingress_pending"]) == 0, "ack drain exceeded 100 rows")
    _ = try! bridgeRequest("POST", "/v1/faults/emit-pending-ack")
  },
  verify: { integer(bridgeState()["runtime_ingress_pending"]) == 0 }
)


// Sparkle presents an application-modal window. Exercise it only after every
// product journey, then dismiss its result before onboarding becomes frontmost.
bringMainWindowForward()
if let statusItem = find(app, id: "menu-status-item") ?? findTitle(app, "Intentive") {
  openStatusMenu(statusItem)
  if let update = findLast(app, id: "menu-check-updates") ?? findTitle(app, "Check for Updates…") {
    record(
      name: "update-check",
      element: update,
      assertion: "AXPress invokes the real Sparkle manual update handler",
      action: { AXUIElementPerformAction(update, kAXPressAction as CFString) },
      verify: {
        let deadline = Date().addingTimeInterval(5)
        while Date() < deadline {
          if findTitle(app, "Checking for Updates…") != nil
            || findTitle(app, "Checking for Updates...") != nil
            || findTitle(app, "You're up to date!") != nil
            || findTitle(app, "You’re up to date!") != nil
            || findTitle(app, "Update Error!") != nil { return true }
          RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        return false
      }
    )
    if let dismiss = findTitle(app, "OK").flatMap(pressableAncestor) {
      AXUIElementPerformAction(dismiss, kAXPressAction as CFString)
      RunLoop.current.run(until: Date().addingTimeInterval(0.2))
    }
  }
}

if !steps.contains(where: { $0.name == "onboarding-reset-confirmation" && $0.passed }),
  let statusItem = find(app, id: "menu-status-item") ?? findTitle(app, "Intentive") {
  openStatusMenu(statusItem)
  if let reset = findLast(app, id: "menu-reset-onboarding") {
    DispatchQueue.global(qos: .userInitiated).async {
      AXUIElementPerformAction(reset, kAXPressAction as CFString)
    }
    let alertDeadline = Date().addingTimeInterval(3)
    while findTitle(app, "Reset Onboarding?") == nil && Date() < alertDeadline {
      RunLoop.current.run(until: Date().addingTimeInterval(0.1))
    }
    if let cancel = findTitle(app, "Cancel").flatMap(pressableAncestor) {
      record(
        name: "onboarding-reset-confirmation",
        element: cancel,
        assertion: "Reset Onboarding presents Omi's explicit confirmation before restart",
        verify: { findTitle(app, "Reset Onboarding?") != nil }
      )
      if let confirm = findTitle(app, "Reset").flatMap(pressableAncestor) {
        record(
          name: "onboarding-resume",
          element: confirm,
          assertion: "AXPress confirms reset and reopens the resumable production onboarding sheet",
          action: { AXUIElementPerformAction(confirm, kAXPressAction as CFString) },
          verify: {
            let deadline = Date().addingTimeInterval(4)
            while Date() < deadline {
              if bridgeState()["onboarding_presented"] as? Bool == true { return true }
              RunLoop.current.run(until: Date().addingTimeInterval(0.1))
            }
            return false
          }
        )
      }
    }
  }
}

let required = [
  "fixture-seed", "settings-general", "settings-rewind", "settings-privacy", "settings-about",
  "runtime-lost-ack", "runtime-reconnect-redelivery", "runtime-ack-dedupe",
  "menu-order", "report-issue-send",
  "capture-enable-first-frame", "capture-disable", "audio-microphone-running", "audio-disable",
  "update-check", "onboarding-reset-confirmation", "onboarding-resume",
  "account-verified-email",
]
let ok = bridgeFailure == nil
  && required.allSatisfy { name in steps.contains { $0.name == name && $0.passed } }
let result = EvidenceResult(
  ok: ok,
  gitSHA: gitSHA,
  startedAt: startedAt,
  finishedAt: ISO8601DateFormatter().string(from: Date()),
  steps: steps
)
let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
try encoder.encode(result).write(to: resultURL, options: .atomic)
exit(ok ? 0 : 1)
