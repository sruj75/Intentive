import AppKit
import Carbon.HIToolbox.Events
import Combine
import IntentiveDesktopCore
import SwiftUI

/// Owns the salvaged Omi floating bar window and its configurable global hotkey, and is the
/// single seam the app talks to (`configure`, `show`, `toggleAIInput`, `hide`,
/// `refreshMessages`, `presentProactiveMessage`).
///
/// Omi drove the same `FloatingControlBarWindow` from a ~2,300-line manager welded
/// to a GRDB/network `ChatProvider`, agent routing, notification queues, and voice
/// playback. Intentive keeps Omi's real window and chrome but
/// replaces only that glue: the bar sends through the Core `FloatingBarController`
/// (ADR-0007, ADR-0008). This is a `.shared` singleton because the renovated view /
/// window / state use one process-wide panel and presentation coordinator.
@MainActor
public final class FloatingControlBarManager {
  public static let shared = FloatingControlBarManager()

  private var window: FloatingControlBarWindow?
  private var controller: FloatingBarController?

  /// True between sending a question and binding its answer. The primary gate for
  /// `refreshMessages`: without it, the state's `isAILoading` (which defaults to
  /// true) would let an unrelated socket event surface a stale prior answer into a
  /// bar that has not sent anything yet.
  private var awaitingReply = false

  /// The store's companion tail captured at send time, so `refreshMessages` binds
  /// the *next* companion message (this question's answer), never the previous
  /// turn's answer already sitting in the store.
  private var lastCompanionReplyId: String?

  public var isConversationEngaged: Bool {
    guard let window else { return false }
    return window.isVisible && window.state.showingAIConversation
  }

  public var isVisible: Bool { window?.isVisible == true }

  /// The floating bar's transcript view. Fed from Core's `MessageStore` via
  /// `refreshMessages()`; the salvaged view reads it through `sharedFloatingProvider`.
  let floatingProvider = ChatProvider()
  var sharedFloatingProvider: ChatProvider? { floatingProvider }

  private var hotKeyRef: EventHotKeyRef?
  private var shortcutEnabled = true
  private var eventHandlerRef: EventHandlerRef?
  private var shortcutObserver: NSObjectProtocol?

  /// The Carbon hotkey callback is a bare C function, so it reaches the live
  /// manager through this process-wide weak reference. There is only ever one bar.
  nonisolated(unsafe) private static weak var hotKeyTarget: FloatingControlBarManager?

  private init() {}

  // MARK: - Configuration

  /// Wires the bar to the Core send seam. Idempotent: the window is built lazily
  /// on first `show()`.
  public func configure(controller: FloatingBarController) {
    self.controller = controller
  }

  // MARK: - Public seam

  /// Reveals the bar. Used by the "Open floating bar" affordances and onboarding.
  public func show() {
    let window = ensureWindow()
    window.normalizeForTemporaryShow()
    window.makeKeyAndOrderFront(nil)
  }

  /// Reveals the text composer without toggling an already-visible bar closed.
  public func showComposer() {
    let window = ensureWindow()
    synchronizeConversation(in: window)
    window.normalizeForTemporaryShow()
    // Size to the target surface synchronously *before* ordering front. A cold
    // window — e.g. opened from the onboarding "Try Floating Bar" demo under the
    // modal onboarding sheet — otherwise displays mid-animation as it grows from
    // the 160×34 pill, which renders "sliced / compressed". The shortcut path opens a
    // warm window and never showed the artifact; sizing synchronously fixes both.
    window.showAIConversation(animated: false)
    window.makeKeyAndOrderFront(nil)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak window] in
      _ = window?.focusInputField()
    }
  }

  /// Global-shortcut behavior: toggle the composer. Open + focused if hidden, else hide.
  public func toggleAIInput() {
    let window = ensureWindow()
    if window.isVisible, window.state.showingAIConversation {
      hide()
    } else {
      showComposer()
    }
  }

  public func hide() {
    window?.orderOut(nil)
  }

  /// Surfaces a freshly arrived companion reply as the bar's current answer.
  ///
  /// Called on every runtime socket event. The bar's send path already showed
  /// the question and the "thinking" spinner (`beginVisibleMainQuery` set
  /// `isAILoading`), so this only needs to bind the answer text and stop the
  /// spinner. Intentive answers are plain text with no provider streaming, so we
  /// use the state's local-answer override rather than the GRDB-backed provider
  /// timeline Omi drove. The `lastCompanionReplyId` guard, seeded at send time,
  /// ensures only a genuinely new reply — not a prior turn's answer — is shown.
  public func refreshMessages() {
    guard let controller, let window else { return }
    synchronizeConversation(in: window)
    guard awaitingReply else { return }
    guard let reply = controller.messages.last(where: { $0.author == .companion }),
      reply.id != lastCompanionReplyId
    else { return }
    awaitingReply = false
    lastCompanionReplyId = reply.id
    window.resizeToResponseHeightPublic(animated: true)
  }

  /// Surfaces a Post-Message-Back companion message in the one conversation
  /// thread and auto-opens the bar near the notch (top-center). The message is
  /// already in the shared `MessageStore` by the time this runs, so
  /// `synchronizeConversation` pulls it into the viewport — `body` is that same
  /// text, kept for the seam. There is no separate notification chrome: the
  /// user replies inline or ignores.
  public func presentProactiveMessage(_ body: String) {
    let window = ensureWindow()
    // Preserve Omi's real four-window, click-through edge glow around the app
    // the user was working in before the bar surfaces.
    OverlayService.shared.showGlowAroundActiveWindow(colorMode: .focused)
    synchronizeConversation(in: window)
    window.normalizeForTemporaryShow()
    // Size to the response surface synchronously before ordering front so the
    // panel never displays mid-animation from the compact pill.
    window.resizeToResponseHeightPublic(animated: false)
    // Order front without stealing keyboard focus: the panel is a
    // `.nonactivatingPanel`, so the user keeps typing in their current app. The
    // bar becomes key only when they click it to reply.
    window.orderFront(nil)
  }

  // MARK: - Window lifecycle

  /// Builds Omi's real `FloatingControlBarWindow` on first use and wires its
  /// callback closures to the Core seams. The window owns its own
  /// `FloatingControlBarState` and builds the salvaged chrome in `setupViews()`.
  @discardableResult
  private func ensureWindow() -> FloatingControlBarWindow {
    if let window { return window }

    let window = FloatingControlBarWindow(
      contentRect: .zero,
      styleMask: [.borderless],
      backing: .buffered,
      defer: false
    )

    window.onAskAI = { [weak window] in
      window?.showAIConversation()
      window?.makeKeyAndOrderFront(nil)
    }
    window.onHide = { [weak self] in
      self?.hide()
    }
    window.onSendQuery = { [weak self] message in
      self?.submit(message)
    }
    self.window = window
    return window
  }

  /// Sends the composer text as a `user_message` through the Core seam. The bar's
  /// own state already switched to the response surface and started the spinner;
  /// the reply is surfaced by `refreshMessages()` once the companion answers.
  ///
  /// Seeds `lastCompanionReplyId` with the store's current companion tail so the
  /// *next* companion message — the answer to this question — is what surfaces,
  /// never the previous turn's answer that is already in the store.
  private func submit(_ message: String) {
    lastCompanionReplyId = controller?.messages.last(where: { $0.author == .companion })?.id
    // Only wait for a reply if the message actually went out; an empty/failed
    // send must not leave the bar spinning forever.
    if (try? controller?.submit(message)) != nil {
      awaitingReply = true
    }
  }

  // MARK: - Global shortcut

  /// Registers the process-wide hotkey that toggles the bar from any app.
  public func registerGlobalShortcut() {
    Self.hotKeyTarget = self
    installEventHandlerIfNeeded()

    if let hotKeyRef {
      UnregisterEventHotKey(hotKeyRef)
      self.hotKeyRef = nil
    }

    if shortcutObserver == nil {
      shortcutObserver = NotificationCenter.default.addObserver(
        forName: ShortcutSettings.floatingBarShortcutChanged,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        Task { @MainActor in self?.registerGlobalShortcut() }
      }
    }

    guard shortcutEnabled else { return }

    let hotKeyID = EventHotKeyID(signature: FourCharCode(0x494E_5456), id: 1)  // "INTV"
    let shortcut = ShortcutSettings.shared.floatingBarShortcut
    guard ShortcutSettings.isSafeGlobalShortcut(
      keyCode: shortcut.keyCode, carbonModifiers: shortcut.carbonModifiers)
    else {
      NSLog("FloatingControlBarManager: refused unsafe global hotkey")
      return
    }
    var ref: EventHotKeyRef?
    let status = RegisterEventHotKey(
      shortcut.keyCode,
      shortcut.carbonModifiers,
      hotKeyID,
      GetApplicationEventTarget(),
      0,
      &ref
    )
    if status == noErr {
      hotKeyRef = ref
    } else {
      NSLog("FloatingControlBarManager: failed to register configured hotkey (\(status))")
    }
  }

  /// Applies the small Intentive v1 preset set through Omi's real Carbon
  /// registration mechanism. The utility settings surface persists the preset
  /// identifier; this adapter owns the key-code translation.
  public func setShortcutPreset(_ preset: String) {
    if preset == "disabled" {
      shortcutEnabled = false
      if let hotKeyRef { UnregisterEventHotKey(hotKeyRef); self.hotKeyRef = nil }
      return
    }
    shortcutEnabled = true
    if preset.hasPrefix("custom:") {
      let parts = preset.split(separator: ":", maxSplits: 3).map(String.init)
      if parts.count == 4, let keyCode = UInt32(parts[1]), let modifiers = UInt32(parts[2]) {
        guard ShortcutSettings.isSafeGlobalShortcut(
          keyCode: keyCode, carbonModifiers: modifiers)
        else { return }
        ShortcutSettings.shared.floatingBarShortcut = .init(
          keyCode: keyCode, carbonModifiers: modifiers,
          displayTokens: parts[3].split(separator: ",").map(String.init))
      }
      return
    }
    switch preset {
    case "command+o", "command+return", "command+j", "option+space":
      ShortcutSettings.shared.floatingBarShortcut = ShortcutSettings.defaultFloatingBarShortcut
    case "command+shift+return":
      ShortcutSettings.shared.floatingBarShortcut = .init(
        keyCode: UInt32(kVK_Return), carbonModifiers: UInt32(cmdKey | shiftKey), displayTokens: ["⇧", "⌘", "↩"])
    case "command+shift+space":
      ShortcutSettings.shared.floatingBarShortcut = .init(
        keyCode: UInt32(kVK_Space), carbonModifiers: UInt32(cmdKey | shiftKey),
        displayTokens: ["⌘", "⇧", "Space"])
    default:
      ShortcutSettings.shared.floatingBarShortcut = ShortcutSettings.defaultFloatingBarShortcut
    }
  }

  /// Rebuilds Omi's viewport anchors from Runtime truth. Closing the panel only
  /// closes chrome; reopening projects the same MessageStore again.
  private func synchronizeConversation(in window: FloatingControlBarWindow) {
    guard let controller else { return }
    let snapshot = controller.conversation
    let nativeMessages = snapshot.exchanges.flatMap { exchange -> [ChatMessage] in
      var messages: [ChatMessage] = []
      if let question = exchange.question {
        messages.append(
          ChatMessage(id: question.id, text: question.body, sender: .user, isSynced: true))
      }
      if let answer = exchange.answer {
        messages.append(ChatMessage(id: answer.id, text: answer.body, sender: .ai, isSynced: true))
      }
      return messages
    }
    floatingProvider.messages = nativeMessages

    var viewport = FloatingChatViewport()
    for (index, exchange) in snapshot.exchanges.enumerated() {
      let pair = FloatingChatExchangePair(
        questionMessageId: exchange.question?.id,
        answerMessageId: exchange.answer?.id
      )
      if index == snapshot.exchanges.index(before: snapshot.exchanges.endIndex) {
        viewport.questionMessageId = pair.questionMessageId
        viewport.answerMessageId = pair.answerMessageId
      } else {
        viewport.archivedExchanges.append(pair)
      }
    }
    window.state.chatViewport = viewport
    if let current = snapshot.exchanges.last {
      window.state.displayedQuery = current.question?.body ?? ""
      window.state.isAILoading = current.question != nil && current.answer == nil
      window.state.markConversationActivity()
    }
  }

  private func installEventHandlerIfNeeded() {
    guard eventHandlerRef == nil else { return }
    var eventType = EventTypeSpec(
      eventClass: OSType(kEventClassKeyboard),
      eventKind: OSType(kEventHotKeyPressed)
    )
    InstallEventHandler(
      GetApplicationEventTarget(),
      { (_, _, _) -> OSStatus in
        DispatchQueue.main.async {
          MainActor.assumeIsolated {
            FloatingControlBarManager.hotKeyTarget?.toggleAIInput()
          }
        }
        return noErr
      },
      1,
      &eventType,
      nil,
      &eventHandlerRef
    )
  }

}

/// Bridges the Core `DesktopOverlaySink` (proactive Post-Message-Back messages)
/// onto the floating bar's one conversation thread.
public final class FloatingBarOverlaySink: DesktopOverlaySink {
  private let manager: FloatingControlBarManager

  public init(manager: FloatingControlBarManager) {
    self.manager = manager
  }

  public func presentProactiveMessage(body: String) {
    Task { @MainActor [manager] in
      manager.presentProactiveMessage(body)
    }
  }
}
