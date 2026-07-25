import AppKit
import ApplicationServices
import Foundation

final class AXProbeApplication {
  let root: AXUIElement
  let pid: pid_t

  init(pid: pid_t) {
    self.pid = pid
    root = AXUIElementCreateApplication(pid)
  }

  func activate() {
    NSRunningApplication(processIdentifier: pid)?.activate(options: [.activateAllWindows])
  }

  func value(_ element: AXUIElement, _ attribute: CFString) -> AnyObject? {
    var result: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute, &result) == .success else { return nil }
    return result
  }

  func identifier(_ element: AXUIElement) -> String {
    (value(element, kAXIdentifierAttribute as CFString) as? String)
      ?? (value(element, kAXTitleAttribute as CFString) as? String)
      ?? (value(element, kAXDescriptionAttribute as CFString) as? String)
      ?? ""
  }

  func text(_ element: AXUIElement) -> String {
    (value(element, kAXValueAttribute as CFString) as? String)
      ?? (value(element, kAXTitleAttribute as CFString) as? String)
      ?? ""
  }

  func positionY(_ element: AXUIElement) -> CGFloat? {
    guard let raw = value(element, kAXPositionAttribute as CFString) else { return nil }
    var point = CGPoint.zero
    guard AXValueGetValue(raw as! AXValue, .cgPoint, &point) else { return nil }
    return point.y
  }

  func descendants(_ root: AXUIElement, depth: Int = 0) -> [AXUIElement] {
    guard depth < 20 else { return [] }
    var children = value(root, kAXChildrenAttribute as CFString) as? [AXUIElement] ?? []
    if depth == 0 {
      children += value(root, kAXWindowsAttribute as CFString) as? [AXUIElement] ?? []
      if let menu = value(root, kAXExtrasMenuBarAttribute as CFString) {
        children.append(menu as! AXUIElement)
      }
    }
    return children + children.flatMap { descendants($0, depth: depth + 1) }
  }

  func all() -> [AXUIElement] {
    [root] + descendants(root)
  }

  func find(id: String) -> AXUIElement? {
    all().first { identifier($0) == id }
  }

  func findLast(id: String) -> AXUIElement? {
    all().last { identifier($0) == id }
  }

  func find(title: String) -> AXUIElement? {
    all().first { text($0) == title }
  }

  func supportsPress(_ element: AXUIElement) -> Bool {
    var actions: CFArray?
    guard AXUIElementCopyActionNames(element, &actions) == .success else { return false }
    return (actions as? [String])?.contains(kAXPressAction as String) == true
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

  func press(_ element: AXUIElement) {
    AXUIElementPerformAction(pressableAncestor(element) ?? element, kAXPressAction as CFString)
    RunLoop.current.run(until: Date().addingTimeInterval(0.35))
  }

  func wait(_ seconds: TimeInterval, until condition: () -> Bool) -> Bool {
    let deadline = Date().addingTimeInterval(seconds)
    while Date() < deadline {
      if condition() { return true }
      RunLoop.current.run(until: Date().addingTimeInterval(0.2))
    }
    return false
  }

  func wait(_ seconds: TimeInterval, for match: () -> AXUIElement?) -> AXUIElement? {
    let deadline = Date().addingTimeInterval(seconds)
    while Date() < deadline {
      if let element = match() { return element }
      RunLoop.current.run(until: Date().addingTimeInterval(0.2))
    }
    return nil
  }

  func openStatusMenu() -> Bool {
    guard let status = find(id: "menu-status-item") ?? find(title: "Intentive") else {
      return false
    }
    press(status)
    if find(id: "menu-open-intentive").flatMap(positionY) == nil {
      press(status)
    }
    return true
  }

  func snapshot(to path: URL, limit: Int = 600) throws {
    let rows = all().prefix(limit).map {
      [
        "identifier": identifier($0),
        "role": (value($0, kAXRoleAttribute as CFString) as? String) ?? "",
        "value": text($0),
      ]
    }
    try JSONSerialization.data(withJSONObject: rows, options: [.prettyPrinted, .sortedKeys])
      .write(to: path, options: .atomic)
  }

  func screenshot(to path: String) {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
    process.arguments = ["-x", path]
    try? process.run()
    process.waitUntilExit()
  }
}
