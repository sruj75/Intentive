import AppKit
import SwiftUI

private extension TimeInterval {
  var millisecondsString: String { String(format: "%.0fms", self * 1_000) }
}

/// Omi-derived borderless floating panel, surgically narrowed to text chat and
/// proactive nudge presentation.
@MainActor
final class FloatingControlBarWindow: NSPanel, NSWindowDelegate {
  static let notchChromeHeight: CGFloat = 34
  static let notchGlowOutsetX: CGFloat = 24
  static let notchGlowOutsetBottom: CGFloat = 24

  static func notchChromeHeight(
    topSafeAreaInset: CGFloat,
    auxiliaryTopLeftArea: NSRect?,
    auxiliaryTopRightArea: NSRect?
  ) -> CGFloat {
    let auxiliaryHeight = max(auxiliaryTopLeftArea?.height ?? 0, auxiliaryTopRightArea?.height ?? 0)
    return max(Self.notchChromeHeight, topSafeAreaInset, auxiliaryHeight)
  }

  let state = FloatingControlBarState()
  var onAskAI: (() -> Void)?
  var onHide: (() -> Void)?
  var onSendQuery: ((String) -> Void)?

  private var hostingView: NSHostingView<AnyView>?

  override var canBecomeKey: Bool { true }
  override var canBecomeMain: Bool { false }

  override init(
    contentRect: NSRect,
    styleMask style: NSWindow.StyleMask,
    backing backingStoreType: NSWindow.BackingStoreType,
    defer flag: Bool
  ) {
    super.init(
      contentRect: contentRect,
      styleMask: [.borderless, .nonactivatingPanel],
      backing: backingStoreType,
      defer: flag
    )
    delegate = self
    isOpaque = false
    backgroundColor = .clear
    hasShadow = true
    level = .floating
    collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    isMovableByWindowBackground = false
    setupViews()
    syncActiveIsland()
    setFrame(defaultFrame(size: compactSize), display: false)
  }

  func showAIConversation() {
    state.currentNotification = nil
    state.present(state.hasMainConversation ? .mainResponse : .mainInput)
    resizeForCurrentSurface(animated: true)
  }

  func focusInputField() -> Bool {
    makeKey()
    return makeFirstResponder(firstTextView(in: contentView))
  }

  func resizeToResponseHeightPublic(animated: Bool = false) {
    state.present(.mainResponse)
    resizeForCurrentSurface(animated: animated)
  }

  func showNotification(_ notification: FloatingBarNotification, animated: Bool = true) {
    state.currentNotification = notification
    state.hideConversationSurface()
    resizeForCurrentSurface(animated: animated)
  }

  func positionProactiveNudgeTopRight() {
    let screen = screen ?? NSScreen.main ?? NSScreen.screens.first
    guard let screen else { return }
    let target = FloatingControlBarGeometry.proactiveNudgeFrame(
      size: notificationSize,
      visibleFrame: screen.visibleFrame,
      margin: 20
    )
    setFrame(target, display: true)
  }

  func dismissNotification(animated: Bool = true) {
    state.currentNotification = nil
    if state.hasMainConversation {
      state.present(.mainResponse)
      resizeForCurrentSurface(animated: animated)
    } else {
      state.present(.closed)
      orderOut(nil)
    }
  }

  func normalizeForTemporaryShow() {
    alphaValue = 1
    syncActiveIsland()
  }

  var hasSettledClosedForAutomation: Bool {
    !isVisible && state.conversationSurface == .closed && state.currentNotification == nil
  }

  func syncActiveIsland() {
    let current = screen ?? NSScreen.main
    state.usesNotchIsland = (current?.safeAreaInsets.top ?? 0) > 0
  }

  func playNotchRevealAnimation() {
    let target = defaultFrame(size: compactSize)
    let frames = FloatingBarNotchTransition.growFrames(targetFrame: target, steps: 12)
    guard let first = frames.first else { return }
    setFrame(first, display: true)
    for (index, frame) in frames.enumerated() {
      DispatchQueue.main.asyncAfter(deadline: .now() + Double(index) * 0.01) { [weak self] in
        self?.setFrame(frame, display: true)
      }
    }
  }

  func windowDidResignKey(_ notification: Notification) {
    guard state.currentNotification == nil, !state.showingAIConversation else { return }
    onHide?()
  }

  private var compactSize: NSSize { NSSize(width: 160, height: 34) }
  private var inputSize: NSSize {
    NSSize(width: 430, height: max(96, state.inputViewHeight))
  }
  private var responseSize: NSSize {
    NSSize(width: 430, height: min(380, max(180, state.responseContentHeight + 96)))
  }
  private var notificationSize: NSSize { NSSize(width: 430, height: 156) }

  private func setupViews() {
    let root = FloatingControlBarView(
      state: state,
      window: self,
      onAskAI: { [weak self] in self?.onAskAI?() },
      onHide: { [weak self] in self?.onHide?() },
      onSendQuery: { [weak self] message in self?.onSendQuery?(message) },
      onCloseAI: { [weak self] in self?.closeConversation() }
    )
    let hosting = NSHostingView(rootView: AnyView(root))
    hosting.autoresizingMask = [.width, .height]
    contentView = hosting
    hostingView = hosting
  }

  private func closeConversation() {
    state.hideConversationSurface()
    orderOut(nil)
    onHide?()
  }

  private func resizeForCurrentSurface(animated: Bool) {
    let size: NSSize
    if state.currentNotification != nil {
      size = notificationSize
    } else {
      switch state.conversationSurface {
      case .closed: size = compactSize
      case .mainInput: size = inputSize
      case .mainResponse: size = responseSize
      }
    }
    let target = FloatingControlBarGeometry.topCenterAnchoredFrame(
      currentFrame: frame,
      targetSize: size
    )
    if animated {
      NSAnimationContext.runAnimationGroup { context in
        context.duration = 0.16
        animator().setFrame(target, display: true)
      }
    } else {
      setFrame(target, display: true)
    }
  }

  private func defaultFrame(size: NSSize) -> NSRect {
    let visible = (NSScreen.main ?? NSScreen.screens.first)?.visibleFrame ?? .zero
    return FloatingControlBarGeometry.defaultPillFrame(
      size: size,
      visibleFrame: visible,
      topInset: 8
    )
  }

  private func firstTextView(in view: NSView?) -> NSTextView? {
    guard let view else { return nil }
    if let textView = view as? NSTextView { return textView }
    for child in view.subviews {
      if let result = firstTextView(in: child) { return result }
    }
    return nil
  }
}
