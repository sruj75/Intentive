import AppKit
import Carbon.HIToolbox.Events
import Combine
import IntentiveDesktopCore
import SwiftUI

/// Owns the salvaged Omi floating bar window and its ⌘O global hotkey, and is the
/// single seam the app talks to (`configure`, `show`, `toggleAIInput`, `hide`,
/// `refreshMessages`, `showNudge`).
///
/// Omi drove the same `FloatingControlBarWindow` from a ~2,300-line manager welded
/// to a GRDB/network `ChatProvider`, a subagent router, notification queues, and a
/// TTS playback stack. Intentive keeps Omi's real window and chrome verbatim but
/// replaces only that glue: the bar sends through the Core `FloatingBarController`
/// (ADR-0007, ADR-0008). This is a `.shared` singleton because the salvaged view /
/// window / state read `FloatingControlBarManager.shared` directly for a handful of
/// presentation hooks; the heavy behaviors those hooks named (snooze, notification
/// queueing, streaming re-observation) are intentionally inert stubs here.
@MainActor
public final class FloatingControlBarManager {
    public static let shared = FloatingControlBarManager()

    /// Omi's bounded notification snooze interval, retained for proactive PMB.
    public static let snoozeTwoHoursDuration: TimeInterval = 2 * 60 * 60

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
    private let proactiveSnooze = ProactivePresentationSnooze()

    public var isConversationEngaged: Bool {
        guard let window else { return false }
        return window.isVisible && window.state.showingAIConversation
    }

    public var isProactivePresentationSnoozed: Bool {
        proactiveSnooze.isActive
    }

    /// The floating bar's transcript view. Fed from Core's `MessageStore` via
    /// `refreshMessages()`; the salvaged view reads it through `sharedFloatingProvider`.
    let floatingProvider = ChatProvider()
    var sharedFloatingProvider: ChatProvider? { floatingProvider }

    /// Whether the bar is allowed to show. The salvaged window consults this before
    /// re-presenting queued notifications; Intentive keeps it permanently enabled.
    var isEnabled = true

    private var hotKeyRef: EventHotKeyRef?
    private var eventHandlerRef: EventHandlerRef?
    private var shortcutObserver: NSObjectProtocol?

    /// The Carbon hotkey callback is a bare C function, so it reaches the live
    /// manager through this process-wide weak reference. There is only ever one bar.
    nonisolated(unsafe) private static weak var hotKeyTarget: FloatingControlBarManager?

    private init() {}

    // MARK: - Configuration

    /// Wires the bar to the Core send seam. Idempotent: the window is built lazily
    /// on first `show()`. Dictation is pushed in via `receiveDictation(_:)` from the
    /// app's global push-to-talk monitor rather than pulled by the bar.
    public func configure(controller: FloatingBarController) {
        self.controller = controller
    }

    // MARK: - Public seam

    /// Reveals the bar. Used by the "Open floating bar" affordances and onboarding.
    public func show() {
        let window = ensureWindow()
        isEnabled = true
        window.normalizeForTemporaryShow()
        window.makeKeyAndOrderFront(nil)
    }

    /// Reveals the text composer without toggling an already-visible bar closed.
    public func showComposer() {
        let window = ensureWindow()
        isEnabled = true
        synchronizeConversation(in: window)
        window.showAIConversation()
        window.normalizeForTemporaryShow()
        window.makeKeyAndOrderFront(nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak window] in
            _ = window?.focusInputField()
        }
    }

    /// ⌘O behavior: toggle the composer. Open + focused if hidden, else hide.
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

    /// Stages an on-device dictation transcript in the bar's composer for review.
    ///
    /// Per ADR-0007 dictation NEVER auto-sends: this only fills the composer and
    /// focuses it, so the user reads, edits, and presses return themselves. The
    /// transcript is merged onto whatever is already staged (space-joined) so
    /// repeated push-to-talk turns accumulate into one message. An empty/whitespace
    /// transcript is dropped without surfacing the bar (nothing was said).
    public func receiveDictation(_ transcript: String) {
        guard !transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        let window = ensureWindow()
        isEnabled = true
        window.showAIConversation()
        window.normalizeForTemporaryShow()
        window.makeKeyAndOrderFront(nil)
        window.state.aiInputText = DictationComposer.merge(
            existing: window.state.aiInputText,
            addition: transcript
        )
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak window] in
            _ = window?.focusInputField()
        }
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
              reply.id != lastCompanionReplyId else { return }
        awaitingReply = false
        lastCompanionReplyId = reply.id
        window.resizeToResponseHeightPublic(animated: true)
    }

    /// Presents a proactive nudge (a companion message with no preceding question)
    /// as the bar's in-app notification.
    public func showNudge(_ body: String) {
        let window = ensureWindow()
        isEnabled = true
        let notification = FloatingBarNotification(
            title: "Intentive",
            message: body,
            assistantId: "intentive"
        )
        // Preserve Omi's real four-window, click-through edge glow around the
        // app the user was working in before Intentive takes key focus.
        OverlayService.shared.showGlowAroundActiveWindow(colorMode: .focused)
        window.normalizeForTemporaryShow()
        window.makeKeyAndOrderFront(nil)
        // Resolve the Omi resize synchronously before applying Intentive's
        // contextual top-right anchor; an in-flight top-anchor animation would
        // otherwise race the final placement back toward the old pill origin.
        window.showNotification(notification, animated: false)
        window.positionProactiveNudgeTopRight()
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
        // Play/pause and rating are voice/backend affordances Intentive does not
        // drive yet; wiring lands with CP2/CP3. Share is disabled (no share backend).
        window.onPlayPause = {}
        window.onRate = { _, _ in }
        window.onShareLink = { nil }

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

    /// Registers the process-wide ⌘O hotkey that toggles the bar from any app.
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

        let hotKeyID = EventHotKeyID(signature: FourCharCode(0x494E_5456), id: 1)  // "INTV"
        let shortcut = ShortcutSettings.shared.askOmiShortcut
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

    /// Rebuilds Omi's viewport anchors from Runtime truth. Closing the panel only
    /// closes chrome; reopening projects the same MessageStore again.
    private func synchronizeConversation(in window: FloatingControlBarWindow) {
        guard let controller else { return }
        let snapshot = controller.conversation
        let nativeMessages = snapshot.exchanges.flatMap { exchange -> [ChatMessage] in
            var messages: [ChatMessage] = []
            if let question = exchange.question {
                messages.append(ChatMessage(id: question.id, text: question.body, sender: .user, isSynced: true))
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

    // MARK: - Preserved presentation hooks

    func snooze(for duration: TimeInterval) {
        proactiveSnooze.snooze(for: duration)
        dismissCurrentNotification()
    }
    func dismissCurrentNotification() {
        window?.dismissNotification()
    }
    func flushQueuedNotificationsIfPossible() {}
    func cancelChat(keepVoiceAlive: Bool = false, stopProvider: Bool = false) {}
    func reobserveStreamingTurnIfNeeded(in barWindow: FloatingControlBarWindow) {}
    func openNotificationAsChat(_ notification: FloatingBarNotification) {
        toggleAIInput()
    }
    func clearPendingNotificationContext() {}
}

/// Pure text-merge for staging dictation in the composer, factored out of the
/// `@MainActor` manager so the "fill, don't send" behavior (ADR-0007) is unit
/// testable without a window.
enum DictationComposer {
    /// Merges a freshly dictated fragment onto whatever is already staged in the
    /// composer. Both sides are trimmed and joined with a single space so repeated
    /// push-to-talk turns read as continuous text. An empty fragment leaves the
    /// existing text unchanged (trimmed); this never signals "send".
    static func merge(existing: String, addition: String) -> String {
        let trimmedAddition = addition.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedExisting = existing.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedAddition.isEmpty else { return trimmedExisting }
        return trimmedExisting.isEmpty ? trimmedAddition : trimmedExisting + " " + trimmedAddition
    }
}

/// Bridges the Core `DesktopOverlaySink` (proactive nudges) onto the floating bar.
public final class FloatingBarOverlaySink: DesktopOverlaySink {
    private let manager: FloatingControlBarManager

    public init(manager: FloatingControlBarManager) {
        self.manager = manager
    }

    public var isEngaged: Bool {
        MainActor.assumeIsolated { manager.isConversationEngaged }
    }

    public var isSnoozed: Bool {
        MainActor.assumeIsolated { manager.isProactivePresentationSnoozed }
    }

    public func showNudge(body: String) {
        Task { @MainActor [manager] in
            manager.showNudge(body)
        }
    }
}
