import AppKit
import Foundation

public enum NativePushToTalkShortcutEvent: Equatable, Sendable {
  case down
  case up
}

public final class NativePushToTalkShortcutMonitor {
  public var onShortcutEvent: ((NativePushToTalkShortcutEvent) -> Void)?

  private var globalMonitor: Any?
  private var localMonitor: Any?
  private var isShortcutDown = false

  public init() {}

  public func start() {
    stop()
    let mask: NSEvent.EventTypeMask = [.flagsChanged]
    globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: mask) { [weak self] event in
      self?.handle(event)
    }
    localMonitor = NSEvent.addLocalMonitorForEvents(matching: mask) { [weak self] event in
      self?.handle(event)
      return event
    }
  }

  public func stop() {
    if let globalMonitor {
      NSEvent.removeMonitor(globalMonitor)
      self.globalMonitor = nil
    }
    if let localMonitor {
      NSEvent.removeMonitor(localMonitor)
      self.localMonitor = nil
    }
    if isShortcutDown {
      isShortcutDown = false
      onShortcutEvent?(.up)
    }
  }

  private func handle(_ event: NSEvent) {
    let active = event.modifierFlags.intersection([.option]) == [.option]
    if active, !isShortcutDown {
      isShortcutDown = true
      onShortcutEvent?(.down)
    } else if !active, isShortcutDown {
      isShortcutDown = false
      onShortcutEvent?(.up)
    }
  }
}
