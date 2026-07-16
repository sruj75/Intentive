import Cocoa
import Combine
import SwiftUI

private final class FloatingBarHostingView<Content: View>: NSHostingView<Content> {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
        true
    }
}

private final class FloatingBarContainerView: NSView {
    weak var controlBarWindow: FloatingControlBarWindow?

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(
            rect: bounds,
            options: [.mouseEnteredAndExited, .mouseMoved, .activeAlways, .inVisibleRect],
            owner: self,
            userInfo: nil
        ))
    }

    override func mouseEntered(with event: NSEvent) {
        controlBarWindow?.updateNotchPointer(from: event)
    }

    override func mouseMoved(with event: NSEvent) {
        controlBarWindow?.updateNotchPointer(from: event)
    }

    override func mouseExited(with event: NSEvent) {
        controlBarWindow?.updateNotchPointerFromGlobalMouse()
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        guard controlBarWindow?.acceptsMouseHit(inContentPoint: point) ?? true else {
            return nil
        }
        return super.hitTest(point)
    }
}

private extension Duration {
    var millisecondsString: String {
        let components = self.components
        let milliseconds = Double(components.seconds) * 1000
            + Double(components.attoseconds) / 1_000_000_000_000_000
        return String(format: "%.1f", milliseconds)
    }
}

/// NSPanel subclass for the floating control bar.
///
/// Using a non-activating panel lets the Ask Omi shortcut focus the floating bar
/// without surfacing the main Omi window when the app is already running.
class FloatingControlBarWindow: NSPanel, NSWindowDelegate {
    private static let positionKey = "FloatingControlBarPosition"
    private static let sizeKey = "FloatingControlBarSize"
    private static let defaultSize = NSSize(width: 40, height: 14)
    private static let minBarSize = NSSize(width: 40, height: 14)
    /// Fallback physical notch dead zone. Prefer `notchHiddenCenterWidth(for:)`,
    /// which reads macOS' actual top auxiliary areas for the current screen.
    static let fallbackNotchHiddenCenterWidth: CGFloat = 172
    static let notchHiddenCenterSafetyPadding: CGFloat = 34
    static var notchHiddenCenterWidth: CGFloat {
        fallbackNotchHiddenCenterWidth + notchHiddenCenterSafetyPadding
    }
    static let notchCompactSideWidth: CGFloat = 30
    static let notchActiveSideWidth: CGFloat = 42
    /// Thinking keeps the compact active lobe width: the visible state is the
    /// spinning Omi mark only, without a right-side text label.
    static let notchThinkingSideWidth: CGFloat = notchActiveSideWidth
    static let defaultNotchChromeHeight: CGFloat = 34
    static var notchChromeHeight: CGFloat { defaultNotchChromeHeight }
    static let notchActivationHeight: CGFloat = 17
    static let notchGlowOutsetX: CGFloat = 24
    static let notchGlowOutsetBottom: CGFloat = 24
    static let notchConversationBottomPadding: CGFloat = 18
    static let notchInputPanelVerticalPadding: CGFloat = 46
    static let notchInputPanelMinimumContentHeight: CGFloat = 40
    /// Extra vertical budget added on top of the input editor when notch mode
    /// renders the "Back / Omi Chat" header above the input (agent pills present).
    /// Header row (32pt) + VStack top padding (8) + spacing (8) = 48pt.
    static let notchChatHeaderVerticalBudget: CGFloat = 48
    static let notchAgentListMaxVisibleAgents = 8
    static let notchAgentListRowHeight: CGFloat = 44
    static let notchAgentListRowSpacing: CGFloat = 0
    static let notchAgentListVerticalPadding: CGFloat = 0
    static let notchAgentListBottomMargin: CGFloat = 8
    static let notchHoverMenuBottomMargin: CGFloat = 8
    private static let responseStreamingResizeStep: CGFloat = 56
    private static let legacyPillGlowOutsetX: CGFloat = 22
    private static let legacyPillGlowOutsetY: CGFloat = 18
    static func notchAgentListHeight(agentCount: Int) -> CGFloat {
        let visibleCount = min(max(0, agentCount), notchAgentListMaxVisibleAgents)
        guard visibleCount > 0 else { return 0 }
        return notchAgentListVerticalPadding * 2
            + CGFloat(visibleCount) * notchAgentListRowHeight
            + CGFloat(max(0, visibleCount - 1)) * notchAgentListRowSpacing
            + notchAgentListBottomMargin
    }
    static func notchHoverMenuHeight(agentCount: Int) -> CGFloat {
        notchAgentListRowHeight
            + notchAgentListHeight(agentCount: agentCount)
            + notchHoverMenuBottomMargin
    }
    static let expandedBarSize = NSSize(width: 210, height: 50)
    /// Center gap between the two chrome lobes on displays without a notch —
    /// there is no camera housing to straddle, so keep a small deliberate gap
    /// instead of the phantom notch dead zone.
    static let pillSurfaceCenterGapWidth: CGFloat = 56
    /// Slim top inset that replaces the notch chrome band on the pill's
    /// expanded surfaces (agent list, chat).
    static let pillSurfaceTopPadding: CGFloat = 10
    /// Pill-mode Ask Omi input panel height (top inset + editor + padding).
    static var pillInputPanelHeight: CGFloat {
        pillSurfaceTopPadding + notchInputPanelMinimumContentHeight + notchInputPanelVerticalPadding
    }
    private static let voiceBarSize = NSSize(width: 224, height: 42)
    private static let maxBarSize = NSSize(width: 1200, height: 1000)
    static let notchExpandedWidth: CGFloat = 382
    private static let notificationWidth: CGFloat = 430
    private static let notificationHeight: CGFloat = 108
    private static let notificationSpacing: CGFloat = 8
    /// Height of the transient PTT hint row shown below the notch chrome
    /// (e.g. "Hold longer to record") after a too-short tap.
    static let pttHintRowHeight: CGFloat = 30
    private static let askOmiAnimationDuration: TimeInterval = 0.14
    private static let askOmiSettleDelay: TimeInterval = 0.16
    private static let frameNoopEpsilon: CGFloat = 0.5
    private static let startupDisplayRevalidationDelays: [TimeInterval] = [0.2, 0.8, 2.0]
    private static let topInset: CGFloat = 40
    private static let topInsetWhenNotchModeFallsBackToPill: CGFloat = 4
    /// Minimum window height when AI response first appears.
    private static let minResponseHeight: CGFloat = 250
    /// Base height used as the reference for 2× cap (same as current default response height).
    private static let defaultBaseResponseHeight: CGFloat = 430
    /// Overhead (px) added to measured scroll content to account for control bar, header, follow-up input, and padding.
    private static let responseViewOverhead: CGFloat = 199

    let state = FloatingControlBarState()
    private var hostingView: NSHostingView<AnyView>?
    private var isResizingProgrammatically = false
    private var isUserDragging = false
    /// Set by ResizeHandleNSView while the user is manually dragging the corner.
    /// Prevents the response-height observer from fighting manual resize.
    var isUserResizing = false
    /// Suppresses hover resizes during close animation to prevent position drift.
    private var suppressHoverResize = false
    private var inputHeightCancellable: AnyCancellable?
    private var responseHeightCancellable: AnyCancellable?
    private var pttHintCancellable: AnyCancellable?
    private var agentPillsCancellable: AnyCancellable?
    private var voiceResponseGlowCancellable: AnyCancellable?
    private var previousVoiceResponseGlowActive = false
    private var resizeWorkItem: DispatchWorkItem?
    /// Saved center point from before chat opened, used to restore position on close.
    private var preChatCenter: NSPoint?
    /// Token incremented each time a windowDidResignKey dismiss animation starts.
    /// Checked in the completion block so a new PTT query can cancel a stale close.
    private var resignKeyAnimationToken: Int = 0
    /// The target origin of an in-progress close/restore animation, set in
    /// closeAIConversation() and cleared when the animation settles.
    /// Used by savePreChatCenterIfNeeded() to snap to the correct pill position
    /// if a new PTT query fires while the restore animation is still running.
    private var pendingRestoreOrigin: NSPoint?
    /// The idle pill frame captured just before morphing into the active island
    /// on a non-notch display, so the pill returns to the exact same spot.
    private var savedPillFrame: NSRect?
    private var frameAnimationToken: Int = 0
    private var pendingFrameAnimationTarget: NSRect?
    private var startupDisplayRevalidationWorkItems: [DispatchWorkItem] = []

    /// The bar adopts the notch-island presentation whenever it is actively
    /// engaged — PTT listening, thinking, or speaking a reply — on ANY display,
    /// so external monitors morph from the idle pill into the island too.
    private var barWantsActiveIsland: Bool {
        state.isVoiceListening || state.isThinking || state.isVoiceResponseGlowActive
    }
    private var notchModeEnabled: Bool {
        Self.screenHasCameraHousing(screenForPlacement) || barWantsActiveIsland
    }
    /// Hardware-only notch detection (ignores the transient active-island state) —
    /// "does this display physically have a camera housing".
    var usesNotchIslandForCurrentScreen: Bool {
        Self.screenHasCameraHousing(screenForPlacement)
    }
    private var screenForPlacement: NSScreen? {
        self.screen ?? NSApp.keyWindow?.screen ?? NSScreen.main ?? NSScreen.screens.first
    }
    private var notchSideWidth: CGFloat {
        if state.showingAIConversation {
            return AgentPillsManager.shared.pills.isEmpty
                ? Self.notchCompactSideWidth
                : Self.notchActiveSideWidth
        }
        if AgentPillsManager.shared.pills.isEmpty && !state.isVoiceListening {
            return Self.notchCompactSideWidth
        }
        return Self.notchActiveSideWidth
    }
    private var notchHiddenCenterWidthForCurrentScreen: CGFloat {
        Self.notchHiddenCenterWidth(for: screenForPlacement)
    }
    private var notchChromeHeightForCurrentScreen: CGFloat {
        Self.notchChromeHeight(for: screenForPlacement)
    }
    private var notchInputPanelHeightForCurrentScreen: CGFloat {
        Self.notchInputPanelHeight(for: screenForPlacement)
    }
    private func notchSize(active: Bool) -> NSSize {
        let sideWidth = active ? Self.notchActiveSideWidth : Self.notchCompactSideWidth
        return notchSize(sideWidth: sideWidth)
    }
    private func notchSize(sideWidth: CGFloat) -> NSSize {
        return NSSize(width: notchHiddenCenterWidthForCurrentScreen + sideWidth * 2, height: notchChromeHeightForCurrentScreen)
    }
    private func notchSize(sideWidth: CGFloat, for screen: NSScreen) -> NSSize {
        NSSize(
            width: Self.notchHiddenCenterWidth(for: screen) + sideWidth * 2,
            height: Self.notchChromeHeight(for: screen)
        )
    }
    private func responseGlowWindowSize(forSurfaceSize size: NSSize, usesNotchIsland: Bool) -> NSSize {
        if usesNotchIsland {
            return NSSize(
                width: size.width + Self.notchGlowOutsetX * 2,
                height: size.height + Self.notchGlowOutsetBottom
            )
        }
        guard state.isVoiceResponseGlowActive || collapsedPillAgentGlowActive else { return size }
        guard size.width <= Self.minBarSize.width + 0.5,
              size.height <= Self.minBarSize.height + 0.5
        else { return size }
        return NSSize(
            width: size.width + Self.legacyPillGlowOutsetX * 2,
            height: size.height + Self.legacyPillGlowOutsetY * 2
        )
    }

    /// Whether the collapsed pill is showing the ambient subagent status
    /// tint/glow (mirrors `NotchAgentStatusGroup.aggregate`: finished agents
    /// the user has viewed go quiet).
    private var collapsedPillAgentGlowActive: Bool {
        !notchModeEnabled
            && AgentPillsManager.shared.pills.contains {
                !($0.status.isFinished && $0.viewedAt != nil)
            }
    }
    private func responseGlowWindowSizeForCurrentScreen(forSurfaceSize size: NSSize) -> NSSize {
        responseGlowWindowSize(forSurfaceSize: size, usesNotchIsland: notchModeEnabled)
    }
    private func notchHoverMenuWindowSize(agentCount: Int) -> NSSize {
        NSSize(
            width: max(collapsedBarSize.width, Self.notchExpandedWidth),
            height: notchChromeHeightForCurrentScreen
                + Self.notchHoverMenuHeight(agentCount: agentCount)
                + Self.notchGlowOutsetBottom
        )
    }
    private func currentResponseSurfaceHeight(usesNotchIsland: Bool? = nil) -> CGFloat {
        if usesNotchIsland ?? notchModeEnabled {
            return max(0, frame.height - Self.notchGlowOutsetBottom)
        }
        return frame.height
    }
    private func currentResponseSurfaceWidth(usesNotchIsland: Bool? = nil) -> CGFloat {
        if usesNotchIsland ?? notchModeEnabled {
            return max(0, frame.width - Self.notchGlowOutsetX * 2)
        }
        return frame.width
    }
    private var notchCollapsedSize: NSSize {
        NSSize(width: notchHiddenCenterWidthForCurrentScreen + notchSideWidth * 2, height: notchChromeHeightForCurrentScreen)
    }
    private func notchCollapsedSize(for screen: NSScreen) -> NSSize {
        notchSize(sideWidth: notchSideWidth, for: screen)
    }
    private var collapsedBarSize: NSSize { notchModeEnabled ? notchCollapsedSize : Self.minBarSize }
    private var expandedContentWidth: CGFloat { Self.notchExpandedWidth }
    private var inputPanelHeight: CGFloat {
        let base = notchModeEnabled ? notchInputPanelHeightForCurrentScreen : Self.pillInputPanelHeight
        // When notch mode renders the "Back / Omi Chat" header (agent pills
        // present), the input panel needs additional vertical room so the
        // header + editor + padding all fit. (Codex P2 — input/send clipping.)
        if !AgentPillsManager.shared.pills.isEmpty {
            return base + Self.notchChatHeaderVerticalBudget
        }
        return base
    }

    var onPlayPause: (() -> Void)?
    var onAskAI: (() -> Void)?
    var onHide: (() -> Void)?
    var onSendQuery: ((String) -> Void)?
    var onRate: ((String, Int?) -> Void)?
    var onShareLink: (() async -> String?)?

    override init(
        contentRect: NSRect, styleMask style: NSWindow.StyleMask,
        backing backingStoreType: NSWindow.BackingStoreType = .buffered, defer flag: Bool = false
    ) {
        let initialSize = FloatingControlBarWindow.screenHasCameraHousing(NSScreen.main ?? NSScreen.screens.first)
            ? NSSize(
                width: FloatingControlBarWindow.notchHiddenCenterWidth(for: NSScreen.main ?? NSScreen.screens.first)
                    + FloatingControlBarWindow.notchCompactSideWidth * 2,
                height: FloatingControlBarWindow.notchChromeHeight(for: NSScreen.main ?? NSScreen.screens.first)
            )
            : FloatingControlBarWindow.minBarSize
        let initialRect = NSRect(origin: .zero, size: initialSize)

        super.init(
            contentRect: initialRect,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: backingStoreType,
            defer: flag
        )

        self.appearance = NSAppearance(named: .vibrantDark)
        self.isOpaque = false
        self.backgroundColor = .clear
        self.hasShadow = false
        self.level = FloatingControlBarWindow.screenHasCameraHousing(NSScreen.main ?? NSScreen.screens.first)
            ? .statusBar
            : .floating
        self.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        self.isMovableByWindowBackground = false
        self.acceptsMouseMovedEvents = true
        self.delegate = self
        self.minSize = initialSize
        self.maxSize = FloatingControlBarWindow.maxBarSize

        setupViews()
        updateNotchIslandState()

        if ShortcutSettings.shared.draggableBarEnabled,
           !notchModeEnabled,
           let savedPosition = UserDefaults.standard.string(forKey: FloatingControlBarWindow.positionKey) {
            let origin = NSPointFromString(savedPosition)
            // Validate that the full bar frame (not just a 14pt inset) fits inside
            // some screen's visibleFrame. visibleFrame already excludes the Dock
            // and menu bar on macOS, so clamping against it is what keeps the
            // input field above the Dock (#6684).
            let candidateFrame = NSRect(origin: origin, size: frame.size)
            if let targetScreen = NSScreen.screens.first(where: { $0.visibleFrame.intersects(candidateFrame) }) {
                let clamped = FloatingControlBarWindow.clamp(candidateFrame, to: targetScreen.visibleFrame)
                self.setFrameOrigin(clamped.origin)
            } else {
                centerOnMainScreen()
            }
        } else {
            centerOnMainScreen()
        }
        scheduleStartupDisplayRevalidation()
    }

    /// Clamp `rect` so it stays entirely inside `visible`. visibleFrame already
    /// excludes the Dock and menu bar, so clamping here keeps the Floating Bar
    /// off both. This also gracefully handles rects larger than the screen.
    static func clamp(_ rect: NSRect, to visible: NSRect) -> NSRect {
        guard visible.width > 0 && visible.height > 0 else { return rect }
        var r = rect
        // Clamp x so the window fits between visible.minX and visible.maxX.
        let maxX = max(visible.minX, visible.maxX - r.width)
        r.origin.x = min(max(r.origin.x, visible.minX), maxX)
        // Clamp y so the window fits between visible.minY and visible.maxY.
        let maxY = max(visible.minY, visible.maxY - r.height)
        r.origin.y = min(max(r.origin.y, visible.minY), maxY)
        return r
    }

    static func screenHasCameraHousing(_ screen: NSScreen?) -> Bool {
        // Testing hook: force the non-notch (pill) presentation on notched
        // hardware so the fallback surface can be exercised locally. getenv so
        // values loaded from the bundle .env (BundleEnvironment) are seen too.
        if let forced = getenv("OMI_FORCE_NO_NOTCH"), String(cString: forced) == "1" { return false }
        // Testing hook: force the notch-island presentation on non-notch hardware
        // (external display / dev machine) so notch-only UI can be exercised
        // locally. Mirror of OMI_FORCE_NO_NOTCH; NO_NOTCH wins if both are set.
        if let forced = getenv("OMI_FORCE_NOTCH"), String(cString: forced) == "1" { return true }
        guard let screen else { return false }
        if #available(macOS 12.0, *) {
            if let leftArea = screen.auxiliaryTopLeftArea,
               let rightArea = screen.auxiliaryTopRightArea,
               !leftArea.isEmpty,
               !rightArea.isEmpty {
                return true
            }
            return screen.safeAreaInsets.top > 0
        }
        return false
    }

    static func notchChromeHeight(for screen: NSScreen?) -> CGFloat {
        guard let screen else { return notchChromeHeight }
        if #available(macOS 12.0, *) {
            return notchChromeHeight(
                topSafeAreaInset: screen.safeAreaInsets.top,
                auxiliaryTopLeftArea: screen.auxiliaryTopLeftArea,
                auxiliaryTopRightArea: screen.auxiliaryTopRightArea
            )
        }
        return notchChromeHeight
    }

    static func notchChromeHeight(
        topSafeAreaInset: CGFloat,
        auxiliaryTopLeftArea: NSRect?,
        auxiliaryTopRightArea: NSRect?
    ) -> CGFloat {
        let auxiliaryHeights = [auxiliaryTopLeftArea, auxiliaryTopRightArea]
            .compactMap { area -> CGFloat? in
                guard let area, !area.isEmpty, area.height > 0 else { return nil }
                return area.height
            }
        let measuredHeight = max(topSafeAreaInset, auxiliaryHeights.max() ?? 0)
        guard measuredHeight > 0 else { return notchChromeHeight }
        return max(notchChromeHeight, measuredHeight)
    }

    static func notchInputPanelHeight(for screen: NSScreen?) -> CGFloat {
        notchChromeHeight(for: screen) + notchInputPanelMinimumContentHeight + notchInputPanelVerticalPadding
    }

    static func notchHiddenCenterWidth(for screen: NSScreen?) -> CGFloat {
        guard let screen else { return notchHiddenCenterWidth }
        if #available(macOS 12.0, *),
           let leftArea = screen.auxiliaryTopLeftArea,
           let rightArea = screen.auxiliaryTopRightArea,
           !leftArea.isEmpty,
           !rightArea.isEmpty {
            let measuredGap = rightArea.minX - leftArea.maxX
            if measuredGap > 0 {
                return max(notchHiddenCenterWidth, measuredGap + notchHiddenCenterSafetyPadding)
            }
        }
        return notchHiddenCenterWidth
    }

    private func updateNotchIslandState() {
        let usesNotch = notchModeEnabled
        // Leaving the idle pill for the active island on a non-notch display —
        // remember the pill's exact spot so we can restore it when we return
        // (otherwise the pill drifts to a recomputed top-center each cycle).
        if usesNotch, !state.usesNotchIsland, !Self.screenHasCameraHousing(screenForPlacement),
           !state.showingAIConversation, state.currentNotification == nil {
            savedPillFrame = frame
        }
        if state.usesNotchIsland != usesNotch {
            state.usesNotchIsland = usesNotch
        }
        if !usesNotch {
            state.notchRevealProgress = 1
        }
        level = usesNotch ? .statusBar : .floating
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }

    override func keyDown(with event: NSEvent) {
        if event.keyCode == 53 { // Escape
            handleEscapeKey()
            return
        }
        super.keyDown(with: event)
    }

    func handleEscapeKey() {
        if FloatingBarVoicePlaybackService.shared.isSpeaking {
            FloatingBarVoicePlaybackService.shared.interruptCurrentResponse()
            return
        }

        if !state.showingAIConversation, !notchModeEnabled, state.isNotchHoverMenuVisible {
            setPillAgentListVisible(false)
            return
        }

        guard state.showingAIConversation else { return }

        if state.hasVisibleConversation {
            clearVisibleConversationFromUI()
        } else {
            closeAIConversation()
        }
    }

    private func setupViews() {
        let swiftUIView = FloatingControlBarView(
            window: self,
            onPlayPause: { [weak self] in self?.onPlayPause?() },
            onAskAI: { [weak self] in self?.handleAskAI() },
            onHide: { [weak self] in self?.hideBar() },
            onSendQuery: { [weak self] message in self?.onSendQuery?(message) },
            onCloseAI: { [weak self] in self?.closeAIConversation() },
            onEscape: { [weak self] in self?.handleEscapeKey() },
            onClearVisibleConversation: { [weak self] in self?.clearVisibleConversationFromUI() },
            onRate: { [weak self] messageId, rating in self?.onRate?(messageId, rating) },
            onShareLink: { [weak self] in await self?.onShareLink?() }
        ).environmentObject(state)

        hostingView = FloatingBarHostingView(rootView: AnyView(
            swiftUIView
                .withFontScaling()
                .preferredColorScheme(.dark)
                .environment(\.colorScheme, .dark)
        ))
        hostingView?.appearance = NSAppearance(named: .vibrantDark)

        // CRITICAL: Use a container view instead of making NSHostingView the contentView directly.
        // When NSHostingView IS the contentView of a borderless window, it tries to negotiate
        // window sizing through updateWindowContentSizeExtremaIfNecessary and updateAnimatedWindowSize,
        // causing re-entrant constraint updates that crash in _postWindowNeedsUpdateConstraints.
        // Wrapping in a container breaks that "I own this window" relationship.
        //
        // sizingOptions: Remove .intrinsicContentSize so the hosting view can expand beyond
        // its SwiftUI ideal size. Keep .minSize and .maxSize for proper min/max constraints.
        // Setting [] removes ALL sizing info (broken). Default includes .intrinsicContentSize
        // which pins the view to its ideal size (prevents expansion). [.minSize, .maxSize] is correct.
        let container = FloatingBarContainerView()
        container.controlBarWindow = self
        container.wantsLayer = true
        container.layer?.backgroundColor = NSColor.clear.cgColor
        self.contentView = container

        if let hosting = hostingView {
            hosting.sizingOptions = [.minSize, .maxSize]
            hosting.wantsLayer = true
            hosting.layer?.backgroundColor = NSColor.clear.cgColor
            hosting.translatesAutoresizingMaskIntoConstraints = false
            container.addSubview(hosting)
            NSLayoutConstraint.activate([
                hosting.leadingAnchor.constraint(equalTo: container.leadingAnchor),
                hosting.trailingAnchor.constraint(equalTo: container.trailingAnchor),
                hosting.topAnchor.constraint(equalTo: container.topAnchor),
                hosting.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            ])
        }

        NotificationCenter.default.addObserver(
            forName: .floatingBarDragDidStart, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.isUserDragging = true
                self?.state.isDragging = true
            }
        }

        NotificationCenter.default.addObserver(
            forName: .floatingBarDragDidEnd, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.isUserDragging = false
                self?.state.isDragging = false
            }
        }

        // Re-validate position when monitors are connected/disconnected
        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.validatePositionOnScreenChange(reason: "screen_parameters_changed")
            }
        }

        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.activeSpaceDidChangeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.performSpacesTransitionGrowIn()
            }
        }

        // Follow cursor across monitors — poll mouse position to move bar instantly
        startCursorScreenTracking()
        observeNotchAgentPills()
        observeVoiceResponseGlow()
        observePttHint()
    }

    private func performSpacesTransitionGrowIn() {
        updateNotchIslandState()
        guard notchModeEnabled, isVisible else { return }
        let targetFrame = defaultFrameForCurrentState()
        animateGrowOutFromNotch(to: targetFrame)
    }

    private func defaultFrameForCurrentState() -> NSRect {
        let size: NSSize
        if state.showingAIConversation {
            size = NSSize(width: expandedContentWidth, height: max(inputPanelHeight, frame.height))
        } else if notchModeEnabled && !state.pttHintText.isEmpty {
            size = NSSize(
                width: Self.notchExpandedWidth,
                height: notchChromeHeightForCurrentScreen + Self.notificationSpacing + Self.pttHintRowHeight
            )
        } else if state.isVoiceListening {
            size = notchSize(active: true)
        } else if state.currentNotification != nil {
            size = NSSize(
                width: Self.notificationWidth,
                height: notchChromeHeightForCurrentScreen + Self.notificationSpacing + Self.notificationHeight
            )
        } else {
            size = collapsedBarSize
        }
        let windowSize = responseGlowWindowSizeForCurrentScreen(forSurfaceSize: size)
        return NSRect(origin: defaultTopCenteredOrigin(for: windowSize), size: windowSize)
    }

    private func currentSurfaceSize(
        usesNotchIsland: Bool,
        frameIncludesVoiceGlow: Bool? = nil
    ) -> NSSize {
        if state.showingAIConversation {
            let defaultWidth = Self.notchExpandedWidth
            let width = max(defaultWidth, currentResponseSurfaceWidth(usesNotchIsland: usesNotchIsland))
            let panelHeight = usesNotchIsland ? notchInputPanelHeightForCurrentScreen : Self.pillInputPanelHeight
            let reservedGlowOutset = usesNotchIsland ? Self.notchGlowOutsetBottom : 0
            let contentHeight = max(panelHeight, frame.height - reservedGlowOutset)
            return NSSize(width: width, height: contentHeight)
        }
        // Notch: grow just enough to fit the transient too-short PTT hint row.
        // (isVoiceListening is true during the hint, so this must precede it.)
        if usesNotchIsland && !state.pttHintText.isEmpty {
            return NSSize(
                width: Self.notchExpandedWidth,
                height: notchChromeHeightForCurrentScreen + Self.notificationSpacing + Self.pttHintRowHeight
            )
        }
        if state.isVoiceListening {
            return usesNotchIsland ? notchSize(active: true) : Self.voiceBarSize
        }
        if state.currentNotification != nil {
            let barHeight = usesNotchIsland
                ? notchChromeHeightForCurrentScreen
                : (state.isHoveringBar ? Self.expandedBarSize.height : Self.minBarSize.height)
            return NSSize(
                width: Self.notificationWidth,
                height: barHeight + Self.notificationSpacing + Self.notificationHeight
            )
        }
        return usesNotchIsland ? notchCollapsedSize : Self.minBarSize
    }

    private func currentSurfaceSizeForCurrentScreen(frameIncludesVoiceGlow: Bool? = nil) -> NSSize {
        currentSurfaceSize(usesNotchIsland: notchModeEnabled, frameIncludesVoiceGlow: frameIncludesVoiceGlow)
    }

    private func frameForCurrentState(on screen: NSScreen, usesNotchIsland: Bool) -> NSRect {
        let size: NSSize
        if state.showingAIConversation {
            let width = Self.notchExpandedWidth
            let chromeHeight = Self.notchChromeHeight(for: screen)
            let panelHeight = usesNotchIsland ? Self.notchInputPanelHeight(for: screen) : Self.pillInputPanelHeight
            size = NSSize(width: width, height: max(panelHeight, frame.height, chromeHeight))
        } else if usesNotchIsland && !state.pttHintText.isEmpty {
            let chromeHeight = Self.notchChromeHeight(for: screen)
            size = NSSize(
                width: Self.notchExpandedWidth,
                height: chromeHeight + Self.notificationSpacing + Self.pttHintRowHeight
            )
        } else if state.isVoiceListening {
            size = usesNotchIsland ? notchSize(sideWidth: Self.notchActiveSideWidth, for: screen) : Self.voiceBarSize
        } else if state.currentNotification != nil {
            let barHeight = usesNotchIsland
                ? Self.notchChromeHeight(for: screen)
                : (state.isHoveringBar ? Self.expandedBarSize.height : Self.minBarSize.height)
            size = NSSize(
                width: Self.notificationWidth,
                height: barHeight + Self.notificationSpacing + Self.notificationHeight
            )
        } else {
            size = usesNotchIsland ? notchCollapsedSize(for: screen) : Self.minBarSize
        }
        let windowSize = responseGlowWindowSize(forSurfaceSize: size, usesNotchIsland: usesNotchIsland)
        return NSRect(
            origin: topCenteredOrigin(for: windowSize, on: screen, usesNotchIsland: usesNotchIsland),
            size: windowSize
        )
    }

    private func topCenteredOrigin(for size: NSSize, on screen: NSScreen, usesNotchIsland: Bool) -> NSPoint {
        let anchorFrame = usesNotchIsland ? screen.frame : screen.visibleFrame
        let x = (anchorFrame.midX - size.width / 2).rounded(.toNearestOrAwayFromZero)
        let y = usesNotchIsland
            ? anchorFrame.maxY - size.height
            : anchorFrame.maxY - size.height - topInsetForPillFallback
        return NSPoint(x: x, y: y)
    }

    private func growOutFromNotch(on targetScreen: NSScreen) {
        state.usesNotchIsland = true
        level = .statusBar
        styleMask.remove(.resizable)

        let targetFrame = frameForCurrentState(on: targetScreen, usesNotchIsland: true)
        animateGrowOutFromNotch(to: targetFrame)
    }

    private func animateGrowOutFromNotch(to targetFrame: NSRect, duration: TimeInterval = 0.16) {
        resizeWorkItem?.cancel()
        resizeWorkItem = nil
        frameAnimationToken += 1
        let token = frameAnimationToken
        isResizingProgrammatically = true
        alphaValue = 1
        state.notchRevealProgress = 0.001
        setFrame(targetFrame, display: true, animate: false)

        withAnimation(.easeOut(duration: duration)) {
            state.notchRevealProgress = 1
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + duration) { [weak self] in
            guard let self, self.frameAnimationToken == token else { return }
            self.setFrame(targetFrame, display: true, animate: false)
            self.state.notchRevealProgress = 1
            self.alphaValue = 1
            self.isResizingProgrammatically = false
        }
    }

    private enum NotchPointerMode {
        case activationOnly
        case openMenuRetention
    }

    private func notchPointerContains(localPoint point: NSPoint, mode: NotchPointerMode) -> Bool {
        let chromeHeight: CGFloat
        switch mode {
        case .activationOnly:
            chromeHeight = Self.notchActivationHeight
        case .openMenuRetention:
            chromeHeight = max(Self.notchActivationHeight, frame.height - Self.notchGlowOutsetBottom)
        }

        return FloatingControlBarGeometry.notchChromeActivationContainsLocal(
            localPoint: point,
            windowSize: frame.size,
            chromeHeight: chromeHeight,
            horizontalOutset: Self.notchGlowOutsetX
        )
    }

    fileprivate func updateNotchPointer(from event: NSEvent) {
        updateNotchPointer(localPoint: event.locationInWindow)
    }

    func updateNotchPointerFromGlobalMouse() {
        let mouse = NSEvent.mouseLocation
        let localPoint = NSPoint(x: mouse.x - frame.minX, y: mouse.y - frame.minY)
        updateNotchPointer(localPoint: localPoint)
    }

    func openNotchHoverMenuUntilExit() {
        setNotchHoverMenuVisible(true)
    }

    private func updateNotchPointer(localPoint point: NSPoint) {
        guard notchModeEnabled,
              !state.showingAIConversation,
              state.currentNotification == nil
        else {
            setNotchHoverMenuVisible(false)
            return
        }

        let mode: NotchPointerMode = state.isNotchHoverMenuVisible ? .openMenuRetention : .activationOnly
        setNotchHoverMenuVisible(notchPointerContains(localPoint: point, mode: mode))
    }

    private func setNotchHoverMenuVisible(_ visible: Bool) {
        guard notchModeEnabled else { return }
        let allowed = visible && state.canShowNotchHoverMenu
        guard state.notchHoverMenuOpen != allowed else { return }

        if allowed {
            resizeForAgentSwitcher(visible: true)
            state.setNotchHoverMenuOpen(true)
        } else {
            state.setNotchHoverMenuOpen(false)
            resizeForAgentSwitcher(visible: false)
        }
    }

    fileprivate func acceptsMouseHit(inContentPoint point: NSPoint) -> Bool {
        guard notchModeEnabled else { return true }
        guard !state.showingAIConversation,
              state.currentNotification == nil
        else { return true }

        let chromeHeight = state.isNotchHoverMenuVisible
            ? max(Self.notchActivationHeight, frame.height - Self.notchGlowOutsetBottom)
            : notchChromeHeightForCurrentScreen
        return FloatingControlBarGeometry.notchChromeActivationContainsLocal(
            localPoint: point,
            windowSize: frame.size,
            chromeHeight: chromeHeight,
            horizontalOutset: Self.notchGlowOutsetX
        )
    }

    private func observeNotchAgentPills() {
        agentPillsCancellable = AgentPillsManager.shared.$pills
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self,
                      self.state.currentNotification == nil
                else { return }

                guard self.notchModeEnabled else {
                    // Keep the pill agent list sized to its rows; close it
                    // when the last agent disappears.
                    if self.state.isNotchHoverMenuVisible {
                        if AgentPillsManager.shared.pills.isEmpty {
                            self.setPillAgentListVisible(false)
                        } else if !self.state.showingAIConversation {
                            self.resizeForAgentSwitcher(visible: true)
                        }
                        return
                    }
                    // Collapsed idle pill: apply/remove the status-glow window
                    // outset promptly when agents appear or all disappear
                    // (same reasoning as the voice-response glow observer).
                    guard !self.state.showingAIConversation,
                          !self.state.isVoiceListening,
                          !self.state.isHoveringBar,
                          self.state.currentNotification == nil
                    else { return }
                    self.resizeToFrame(self.canonicalCollapsedPillFrame(), makeResizable: false, animated: false)
                    return
                }

                let targetSize: NSSize
                if self.state.showingAIConversation {
                    targetSize = self.currentSurfaceSizeForCurrentScreen()
                } else if self.state.isAgentSwitcherExpanded && !AgentPillsManager.shared.pills.isEmpty {
                    // Keep the notch switcher expanded so pinned/hover-open rows
                    // are not clipped when pills are added or removed.
                    targetSize = self.notchHoverMenuWindowSize(agentCount: AgentPillsManager.shared.pills.count)
                } else {
                    targetSize = self.collapsedBarSize
                }
                self.resizeAnchored(
                    to: targetSize,
                    makeResizable: self.styleMask.contains(.resizable),
                    animated: true,
                    anchorTop: true
                )
            }
    }

    private func observeVoiceResponseGlow() {
        voiceResponseGlowCancellable = Publishers.CombineLatest(state.$isVoiceResponseActive, state.$isVoiceResponseWaiting)
            .map { $0 || $1 }
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isActive in
                guard let self else { return }
                self.previousVoiceResponseGlowActive = isActive
                // On legacy (non-notch) displays the compact pill frame is only
                // enlarged to fit the glow/stroke outset during an explicit
                // resize. Without this, a PTT response that starts while the
                // bar is collapsed keeps the 40×14 frame and clips the white
                // glow for the entire spoken reply. Resize to the glow-adjusted
                // collapsed size on the active/inactive transitions so the
                // outset is applied/removed promptly.
                guard !self.notchModeEnabled else { return }
                guard !self.state.showingAIConversation,
                      !self.state.isVoiceListening,
                      !self.state.isHoveringBar,
                      !self.state.isNotchHoverMenuVisible,
                      self.state.currentNotification == nil
                else { return }
                self.resizeToFrame(self.canonicalCollapsedPillFrame(), makeResizable: false, animated: false)
            }
    }

    /// Resize the notch surface when the transient too-short PTT hint appears or
    /// clears. `isVoiceListening` is already true when the hint fires (no size
    /// transition fires on its own), so the hint needs its own resize. Notch only —
    /// the pill layout renders the hint inside its existing voice size.
    private func observePttHint() {
        pttHintCancellable = state.$pttHintText
            .map { $0.isEmpty }
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self, self.notchModeEnabled else { return }
                guard !self.state.showingAIConversation else { return }
                self.resizeAnchored(
                    to: self.currentSurfaceSizeForCurrentScreen(),
                    makeResizable: false,
                    animated: true,
                    anchorTop: true
                )
            }
    }

    private var cursorTrackingTimer: DispatchSourceTimer?

    /// Poll mouse position at ~250ms to move the bar when the cursor enters a different screen.
    private func startCursorScreenTracking() {
        let timer = DispatchSource.makeTimerSource(queue: .main)
        timer.schedule(deadline: .now(), repeating: .milliseconds(250))
        timer.setEventHandler { [weak self] in
            self?.checkCursorScreen()
        }
        timer.resume()
        cursorTrackingTimer = timer
    }

    private func checkCursorScreen() {
        let wasUsingNotchIsland = notchModeEnabled
        // Only follow when there are multiple screens
        guard NSScreen.screens.count > 1 else { return }

        // Find which screen the cursor is on
        let mouseLocation = NSEvent.mouseLocation
        guard let targetScreen = NSScreen.screens.first(where: { $0.frame.contains(mouseLocation) }) else { return }

        // Already on the same screen — nothing to do
        let currentScreen = self.screen ?? NSScreen.main
        if targetScreen == currentScreen { return }

        // Move to the equivalent position on the target screen
        let currentVisible = currentScreen?.visibleFrame ?? .zero
        let targetVisible = targetScreen.visibleFrame

        let targetUsesNotchIsland = Self.screenHasCameraHousing(targetScreen)

        if targetUsesNotchIsland {
            growOutFromNotch(on: targetScreen)
            log("FloatingControlBarWindow: grew out from notch on screen \(targetScreen.localizedName)")
            return
        }

        if ShortcutSettings.shared.draggableBarEnabled && !targetUsesNotchIsland {
            // Translate position proportionally
            let relX = currentVisible.width > 0 ? (frame.origin.x - currentVisible.origin.x) / currentVisible.width : 0.5
            let relY = currentVisible.height > 0 ? (frame.origin.y - currentVisible.origin.y) / currentVisible.height : 1.0
            let newX = targetVisible.origin.x + relX * targetVisible.width
            let newY = targetVisible.origin.y + relY * targetVisible.height
            // Clamp against the target screen's visibleFrame so the bar doesn't
            // land under that screen's Dock after a cross-screen migration (#6684).
            let clamped = FloatingControlBarWindow.clamp(
                NSRect(origin: NSPoint(x: newX, y: newY), size: frame.size),
                to: targetVisible
            )
            setFrameOrigin(clamped.origin)
            UserDefaults.standard.set(NSStringFromPoint(frame.origin), forKey: FloatingControlBarWindow.positionKey)
        } else {
            // Non-draggable: center on new screen
            let x = targetVisible.midX - frame.width / 2
            let y = targetVisible.maxY - frame.height - topInsetForPillFallback
            let clamped = FloatingControlBarWindow.clamp(
                NSRect(origin: NSPoint(x: x, y: y), size: frame.size),
                to: targetVisible
            )
            setFrameOrigin(clamped.origin)
        }

        updateNotchIslandState()
        if wasUsingNotchIsland != notchModeEnabled {
            resizeAnchored(
                to: currentSurfaceSize(usesNotchIsland: targetUsesNotchIsland),
                makeResizable: state.showingAIConversation && state.showingAIResponse,
                animated: true,
                anchorTop: true
            )
        }
        log("FloatingControlBarWindow: followed cursor to screen \(targetScreen.localizedName)")
    }

    // MARK: - AI Actions

    private func handleAskAI() {
        if state.showingAIConversation && !state.showingAIResponse {
            // Already showing input, close it
            closeAIConversation()
        } else if state.showingAIConversation && state.showingAIResponse {
            // Showing response — focus the follow-up input instead of closing
            makeKeyAndOrderFront(nil)
            focusInputField()
        } else {
            AnalyticsManager.shared.floatingBarAskOmiOpened(source: "button")
            onAskAI?()
        }
    }

    /// Focus the text input field by finding the NSTextView in the view hierarchy.
    /// Returns `true` if the text view was found and focused.
    @discardableResult
    func focusInputField() -> Bool {
        guard let contentView = self.contentView else { return false }
        // Find the NSTextView inside the hosting view hierarchy
        func findTextView(in view: NSView) -> NSTextView? {
            if let textView = view as? NSTextView { return textView }
            for subview in view.subviews {
                if let found = findTextView(in: subview) { return found }
            }
            return nil
        }
        if let textView = findTextView(in: contentView) {
            makeKeyAndOrderFront(nil)
            makeFirstResponder(textView)
            return true
        }
        return false
    }

    func closeAIConversation() {
        AnalyticsManager.shared.floatingBarAskOmiClosed()
        resignKeyAnimationToken += 1
        let closeAnimationToken = resignKeyAnimationToken

        // Collapsing the chat should not interrupt spoken playback. The voice
        // response glow is owned by playback state and must survive surface
        // transitions while audio is still being delivered. However the UI
        // streaming subscription must still be cancelled so late-arriving
        // chunks cannot re-present .mainResponse and pop the panel back open.
        // (Codex P2 — streaming reopens surface during playback.)
        let keepVoiceResponseAlive = state.isVoiceResponseGlowActive
        FloatingControlBarManager.shared.cancelChat(keepVoiceAlive: keepVoiceResponseAlive)

        // Cancel dynamic response-height observer and reset its state
        responseHeightCancellable?.cancel()
        responseHeightCancellable = nil
        state.responseContentHeight = 0

        // Cancel PTT if in follow-up mode
        if state.isVoiceFollowUp {
            PushToTalkManager.shared.cancelListening()
        }

        withAnimation(.easeOut(duration: 0.08)) {
            state.showingAIConversation = false
            state.showingAIResponse = false
            state.activeAgentChatPillID = nil
            // Also clear conversationSurface so a stale .agent(id) doesn't keep
            // hasVisibleConversation true. Without this, canRestoreVisibleConversation
            // treats the dead agent surface as restorable and the next Ask Omi open
            // restores into a blank response panel instead of a fresh input.
            state.conversationSurface = .closed
            state.aiInputText = ""
            state.isVoiceFollowUp = false
            state.voiceFollowUpTranscript = ""
            state.isAILoading = false
            state.isHoveringBar = false
            state.requiresHoverReset = true
        }
        // Suppress hover resizes while the close animation plays, otherwise onHover
        // fires mid-animation, reads an intermediate frame, and causes position drift.
        suppressHoverResize = true

        // Determine the target origin for the collapsed pill.
        // Non-draggable: always use the fixed default position so the pill never drifts,
        // regardless of where the expanded window ended up (anchorTop grows downward,
        // so the window center shifts — anchoring from center would land in the wrong spot).
        // Draggable + preChatCenter set: restore to where the bar was before chat opened.
        // Draggable + no preChatCenter: fall back to current center-anchor (best effort).
        let surfaceSize = collapsedBarSize
        let size = responseGlowWindowSizeForCurrentScreen(forSurfaceSize: surfaceSize)
        let restoreOrigin: NSPoint
        if !ShortcutSettings.shared.draggableBarEnabled || notchModeEnabled {
            restoreOrigin = defaultTopCenteredFrame(for: size).origin
        } else if let center = preChatCenter {
            restoreOrigin = NSPoint(x: center.x - size.width / 2, y: center.y - size.height / 2)
        } else {
            restoreOrigin = NSPoint(x: frame.midX - size.width / 2, y: frame.midY - size.height / 2)
        }

        resizeWorkItem?.cancel()
        resizeWorkItem = nil
        styleMask.remove(.resizable)
        isResizingProgrammatically = true
        // Record the animation target so savePreChatCenterIfNeeded() can snap to it
        // if a new PTT query fires while this restore animation is still running.
        pendingRestoreOrigin = restoreOrigin
        animateFrame(to: NSRect(origin: restoreOrigin, size: size), duration: Self.askOmiAnimationDuration)
        let targetFrame = NSRect(origin: restoreOrigin, size: size)
        preChatCenter = nil
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.askOmiSettleDelay) { [weak self] in
            guard let self = self else { return }
            guard self.resignKeyAnimationToken == closeAnimationToken else { return }
            self.isResizingProgrammatically = false
            self.pendingRestoreOrigin = nil
            // Safety net: only snap if no new AI session was opened while the close settled.
            // Without this guard, a rapid PTT query that fires while close settles gets collapsed
            // back to the pill position by this stale completion block.
            guard !self.state.showingAIConversation else { return }
            if !NSEqualRects(self.frame, targetFrame) {
                self.setFrame(targetFrame, display: true, animate: false)
            }
        }

        // Allow hover resizes again after the animation settles.
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.askOmiSettleDelay) { [weak self] in
            guard let self = self else { return }
            guard self.resignKeyAnimationToken == closeAnimationToken else { return }
            self.suppressHoverResize = false
            FloatingControlBarManager.shared.flushQueuedNotificationsIfPossible()

            // If the user has the bar disabled, hide it completely after closing the
            // AI conversation instead of leaving the compact pill visible — unless a
            // queued notification was just flushed; hiding now would swallow it, and
            // its dismissal re-hides the bar anyway.
            if !FloatingControlBarManager.shared.isEnabled && self.state.currentNotification == nil {
                self.orderOut(nil)
            }
        }
    }

    private func hideBar() {
        self.orderOut(nil)
        AnalyticsManager.shared.floatingBarToggled(visible: false, source: state.showingAIConversation ? "escape_ai" : "bar_button")
        onHide?()
    }

    // MARK: - Public State Updates

    func updateRecordingState(isRecording: Bool, duration: Int, isInitialising: Bool) {
        state.isRecording = isRecording
        state.duration = duration
        state.isInitialising = isInitialising
    }

    func showAIConversation() {
        resizeWorkItem?.cancel()
        resizeWorkItem = nil
        makeKeyAndOrderFront(nil)

        let shouldRestoreVisibleConversation = state.canRestoreVisibleConversation
        if !shouldRestoreVisibleConversation && state.hasVisibleConversation {
            state.clearVisibleConversation()
        }

        // Resize window BEFORE changing state so SwiftUI content doesn't render
        // in the old 28x28 frame (which causes a visible jump).
        // Save center so we can restore exact position when chat closes (avoids drift).
        preChatCenter = NSPoint(x: frame.midX, y: frame.midY)

        if shouldRestoreVisibleConversation {
            cancelInputHeightObserver()
            withAnimation(.easeOut(duration: 0.08)) {
                state.present(.mainResponse)
                state.isAILoading = false
                state.aiInputText = ""
            }
            resizeToResponseHeight(animated: true)
            // Mid-stream close cancels the floating binder; re-subscribe so the
            // restored viewport tracks provider updates within the 10-min window.
            FloatingControlBarManager.shared.reobserveStreamingTurnIfNeeded(in: self)
        } else {
            // Anchor from top so the control bar stays visually in place, input grows downward.
            let inputSize = NSSize(width: expandedContentWidth, height: inputPanelHeight)
            if notchModeEnabled {
                state.notchRevealProgress = 1
            }
            resizeAnchored(
                to: inputSize,
                makeResizable: false,
                animated: true,
                animationDuration: Self.askOmiAnimationDuration,
                anchorTop: true
            )

            withAnimation(.easeOut(duration: Self.askOmiAnimationDuration)) {
                state.present(.mainInput)
                state.isAILoading = false
                state.aiInputText = ""
                state.setLocalAnswerOverride(nil)
                // Match the explicit resize height so the observer doesn't immediately override it
                state.inputViewHeight = inputPanelHeight
            }
            setupInputHeightObserver()
        }

        // Fallback: explicitly focus the input after SwiftUI layout settles.
        // The AutoFocusScrollView.viewDidMoveToWindow() fires once and can miss
        // if the window isn't yet key at that moment.
        DispatchQueue.main.async { [weak self] in
            self?.focusInputField()
        }

    }

    func leaveAgentConversation() {
        if !AgentPillsManager.shared.pills.isEmpty {
            showAgentRowsFromConversation()
        } else {
            showMainConversationFromAgent()
        }
    }

    private func showAgentRowsFromConversation() {
        guard !AgentPillsManager.shared.pills.isEmpty else { return showMainConversationFromAgent() }

        responseHeightCancellable?.cancel()
        responseHeightCancellable = nil
        cancelInputHeightObserver()

        withAnimation(.spring(response: 0.22, dampingFraction: 0.9)) {
            state.hideConversationSurface()
        }
        if notchModeEnabled {
            openNotchHoverMenuUntilExit()
        } else {
            setPillAgentListVisible(true)
        }
    }

    private func showMainConversationFromAgent() {
        guard state.activeAgentChatPillID != nil else {
            closeAIConversation()
            return
        }

        state.leaveAgentSurface()
        if state.conversationSurface == .mainInput {
            resizeForMainInputAfterAgentExit()
        } else {
            resizeForActiveAgentChatPublic(pillID: nil, animated: true)
        }
        focusInputField()
    }

    private func animateNotchReveal(from sourceSize: NSSize, to targetSize: NSSize, duration: TimeInterval) {
        let startWidth = max(notchSize(active: false).width, min(sourceSize.width, targetSize.width))
        let startHeight = max(notchChromeHeightForCurrentScreen, min(sourceSize.height, targetSize.height))
        let widthProgress = targetSize.width > 0 ? startWidth / targetSize.width : 1
        let heightProgress = targetSize.height > 0 ? startHeight / targetSize.height : 1
        let startProgress = min(1, max(0.001, min(widthProgress, heightProgress)))

        frameAnimationToken += 1
        let token = frameAnimationToken
        state.notchRevealProgress = startProgress

        withAnimation(.easeOut(duration: duration)) {
            state.notchRevealProgress = 1
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + duration) { [weak self] in
            guard let self, self.frameAnimationToken == token else { return }
            self.state.notchRevealProgress = 1
        }
    }

    func clearVisibleConversationFromUI() {
        guard state.showingAIConversation else { return }

        if state.activeAgentChatPillID != nil {
            leaveAgentConversation()
            return
        }

        FloatingControlBarManager.shared.cancelChat()
        FloatingControlBarManager.shared.clearPendingNotificationContext()
        responseHeightCancellable?.cancel()
        responseHeightCancellable = nil
        cancelInputHeightObserver()

        withAnimation(.spring(response: 0.22, dampingFraction: 0.9)) {
            state.clearVisibleConversation()
            state.present(.mainInput)
            state.inputViewHeight = inputPanelHeight
        }

        let inputSize = NSSize(width: expandedContentWidth, height: inputPanelHeight)
        resizeAnchored(to: inputSize, makeResizable: false, animated: true, anchorTop: true)
        setupInputHeightObserver()

        DispatchQueue.main.asyncAfter(deadline: .now() + Self.askOmiSettleDelay) { [weak self] in
            self?.focusInputField()
        }
    }

    private func setupInputHeightObserver() {
        inputHeightCancellable?.cancel()
        inputHeightCancellable = state.$inputViewHeight
            .removeDuplicates()
            .debounce(for: .milliseconds(50), scheduler: DispatchQueue.main)
            .sink { [weak self] height in
                guard let self = self,
                      self.state.showingAIConversation,
                      !self.state.showingAIResponse
                else { return }
                self.resizeToFixedHeight(height)
            }
    }

    func cancelInputHeightObserver() {
        inputHeightCancellable?.cancel()
        inputHeightCancellable = nil
    }

    func updateAIResponse(type: String, text: String) {
        guard state.showingAIConversation else { return }

        switch type {
        case "data":
            if state.isAILoading {
                withAnimation(.spring(response: 0.24, dampingFraction: 0.9)) {
                    state.isAILoading = false
                    state.present(.mainResponse)
                }
                resizeToResponseHeight(animated: true)
            }
            state.appendLocalAnswerText(text)
        case "done":
            withAnimation(.easeOut(duration: 0.12)) {
                state.isAILoading = false
            }
            if !text.isEmpty {
                state.replaceLocalAnswerText(text)
            }
        case "error":
            withAnimation(.easeOut(duration: 0.12)) {
                state.isAILoading = false
            }
            state.replaceLocalAnswerText(text.isEmpty ? "An unknown error occurred." : text)
        default:
            break
        }
    }

    // MARK: - Window Geometry

    /// Center-center: preserves midpoint (used by hover expand/collapse).
    private func originForCenterAnchor(newSize: NSSize) -> NSPoint {
        FloatingControlBarGeometry.centerAnchoredFrame(currentFrame: frame, targetSize: newSize).origin
    }

    /// Top-center: keeps top edge fixed, centers horizontally (used by chat expand/collapse).
    private func originForTopCenterAnchor(newSize: NSSize) -> NSPoint {
        if notchModeEnabled {
            return defaultTopCenteredOrigin(for: newSize)
        }
        return FloatingControlBarGeometry.topCenterAnchoredFrame(currentFrame: frame, targetSize: newSize).origin
    }

    private func resizeAnchored(
        to size: NSSize,
        makeResizable: Bool,
        animated: Bool = false,
        animationDuration: TimeInterval = 0.3,
        anchorTop: Bool = false
    ) {
        // Cancel any pending resizeToFixedHeight work item to prevent stale resizes
        resizeWorkItem?.cancel()
        resizeWorkItem = nil
        updateNotchIslandState()
        self.level = notchModeEnabled ? .statusBar : .floating

        let windowSize = responseGlowWindowSizeForCurrentScreen(forSurfaceSize: size)
        let constrainedSize = NSSize(
            width: max(windowSize.width, FloatingControlBarWindow.minBarSize.width),
            height: max(windowSize.height, FloatingControlBarWindow.minBarSize.height)
        )
        let newOrigin = anchorTop
            ? originForTopCenterAnchor(newSize: constrainedSize)
            : originForCenterAnchor(newSize: constrainedSize)

        let targetFrame = NSRect(origin: newOrigin, size: constrainedSize)
        if animated, anchorTop, notchModeEnabled {
            let currentTopCenteredFrame = NSRect(
                origin: originForTopCenterAnchor(newSize: frame.size),
                size: frame.size
            )
            if abs(frame.midX - targetFrame.midX) > 0.5
                || abs(currentTopCenteredFrame.minY - frame.minY) > 0.5
            {
                setFrame(currentTopCenteredFrame, display: true, animate: false)
            }
        }
        resizeToFrame(
            targetFrame,
            makeResizable: makeResizable,
            animated: animated,
            animationDuration: animationDuration
        )
    }

    private func resizeToFrame(
        _ targetFrame: NSRect,
        makeResizable: Bool,
        animated: Bool = false,
        animationDuration: TimeInterval = 0.18
    ) {
        let wasResizable = styleMask.contains(.resizable)
        if makeResizable {
            styleMask.insert(.resizable)
        } else {
            styleMask.remove(.resizable)
        }

        let alreadyAtTarget = Self.framesEquivalent(frame, targetFrame)
        let alreadyAnimatingToTarget = pendingFrameAnimationTarget.map {
            Self.framesEquivalent($0, targetFrame)
        } ?? false

        if alreadyAtTarget, wasResizable == makeResizable {
            frameAnimationToken += 1
            pendingFrameAnimationTarget = nil
            isResizingProgrammatically = false
            return
        }
        if alreadyAnimatingToTarget, wasResizable == makeResizable {
            return
        }

        log("FloatingControlBar: resizeToFrame to \(targetFrame.size) resizable=\(makeResizable) animated=\(animated) from=\(frame.size)")

        isResizingProgrammatically = true

        if animated {
            // Keep windowDidResize from persisting transient animation frames as
            // the user's saved response size until the final frame lands.
            animateFrame(to: targetFrame, duration: animationDuration) { [weak self] in
                self?.isResizingProgrammatically = false
            }
        } else {
            self.setFrame(targetFrame, display: true, animate: false)
            self.isResizingProgrammatically = false
        }
    }

    private static func framesEquivalent(_ lhs: NSRect, _ rhs: NSRect) -> Bool {
        abs(lhs.origin.x - rhs.origin.x) <= frameNoopEpsilon
            && abs(lhs.origin.y - rhs.origin.y) <= frameNoopEpsilon
            && abs(lhs.size.width - rhs.size.width) <= frameNoopEpsilon
            && abs(lhs.size.height - rhs.size.height) <= frameNoopEpsilon
    }

    private func animateFrame(to frame: NSRect, duration: TimeInterval, completion: (() -> Void)? = nil) {
        frameAnimationToken += 1
        let token = frameAnimationToken
        pendingFrameAnimationTarget = frame
        let startFrame = self.frame
        let steps = max(1, Int((duration * 120).rounded()))
        for step in 1...steps {
            let delay = duration * Double(step) / Double(steps)
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                guard let self, self.frameAnimationToken == token else { return }
                let rawProgress = CGFloat(step) / CGFloat(steps)
                let progress = 1 - pow(1 - rawProgress, 2)
                let interpolated = NSRect(
                    x: startFrame.origin.x + (frame.origin.x - startFrame.origin.x) * progress,
                    y: startFrame.origin.y + (frame.origin.y - startFrame.origin.y) * progress,
                    width: startFrame.width + (frame.width - startFrame.width) * progress,
                    height: startFrame.height + (frame.height - startFrame.height) * progress
                )
                self.setFrame(interpolated, display: true, animate: false)
                if step == steps {
                    self.setFrame(frame, display: true, animate: false)
                    if self.frameAnimationToken == token {
                        self.pendingFrameAnimationTarget = nil
                    }
                    completion?()
                }
            }
        }
    }

    private func resizeToFixedHeight(_ height: CGFloat, animated: Bool = false) {
        resizeWorkItem?.cancel()
        let width = expandedContentWidth
        let size = NSSize(width: width, height: height)
        resizeWorkItem = DispatchWorkItem { [weak self] in
            self?.resizeAnchored(to: size, makeResizable: false, animated: animated, anchorTop: true)
        }
        if let workItem = resizeWorkItem {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05, execute: workItem)
        }
    }

    private func defaultAutoResponseMaxHeight() -> CGFloat {
        let screenHeight = (screenForPlacement ?? screen ?? NSScreen.main)?.visibleFrame.height
            ?? NSScreen.screens.first?.visibleFrame.height
            ?? Self.defaultBaseResponseHeight
        return max(Self.minResponseHeight, floor(screenHeight / 3))
    }

    private func storedResponseSurfaceSize() -> NSSize? {
        guard let rawSize = UserDefaults.standard.string(forKey: Self.sizeKey) else {
            return nil
        }

        let size = NSSizeFromString(rawSize)
        guard size.width >= expandedContentWidth - 1,
              size.height > Self.minResponseHeight + 2
        else {
            UserDefaults.standard.removeObject(forKey: Self.sizeKey)
            return nil
        }

        return size
    }

    private func responseHeightConfiguration() -> (initialHeight: CGFloat, maxHeight: CGFloat) {
        let savedSize = storedResponseSurfaceSize()
        let defaultCap = defaultAutoResponseMaxHeight()
        if let savedSize {
            // Clamp the persisted height to the current screen's cap so a tall
            // saved value from a larger display cannot be restored oversized on
            // a smaller screen. (Cubic P2 — cross-monitor sizing consistency.)
            let savedHeight = min(max(Self.minResponseHeight, savedSize.height), defaultCap)
            return (savedHeight, defaultCap)
        }
        return (min(Self.defaultBaseResponseHeight, defaultCap), defaultCap)
    }

    /// Resize for hover expand/collapse — anchored from center so the circle grows outward.
    /// Returns false when a guard skipped the resize; the view must not render
    /// expanded hover content in that case, or the oversized SwiftUI content
    /// force-grows the window with the origin pinned (a rightward drift).
    @discardableResult
    func resizeForHover(expanded: Bool) -> Bool {
        guard !state.showingAIConversation, !state.isVoiceListening, !state.isVoiceResponseGlowActive, !state.isShowingNotification, !suppressHoverResize else { return false }
        // The pill agent list owns the window size while open; hover
        // exits must not collapse it out from under the list.
        guard notchModeEnabled || !state.isNotchHoverMenuVisible else { return false }
        guard !notchModeEnabled else {
            let targetSize = expanded
                ? notchHoverMenuWindowSize(agentCount: AgentPillsManager.shared.pills.count)
                : collapsedBarSize
            resizeAnchored(
                to: targetSize,
                makeResizable: false,
                animated: expanded,
                animationDuration: Self.askOmiAnimationDuration,
                anchorTop: true
            )
            return true
        }
        resizeWorkItem?.cancel()
        resizeWorkItem = nil

        let targetSize = expanded ? FloatingControlBarWindow.expandedBarSize : FloatingControlBarWindow.minBarSize

        let doResize: () -> Void = { [weak self] in
            guard let self = self else { return }
            guard !self.state.showingAIConversation,
                  !self.state.isVoiceListening,
                  !self.state.isVoiceResponseGlowActive,
                  !self.state.isShowingNotification,
                  !self.suppressHoverResize
            else { return }
            // Expand grows outward from the current center; collapse snaps
            // back to the canonical pill position so transient layout forces
            // can never permanently drift the pill sideways.
            let targetFrame = expanded
                ? FloatingControlBarGeometry.centerAnchoredFrame(
                    currentFrame: self.frame,
                    targetSize: targetSize
                )
                : self.canonicalCollapsedPillFrame()
            self.styleMask.remove(.resizable)
            self.isResizingProgrammatically = true
            self.setFrame(targetFrame, display: true, animate: false)
            self.isResizingProgrammatically = false
        }

        if expanded {
            // Expand synchronously so the window is already large enough when
            // SwiftUI re-evaluates body with isHovering=true. If this were async,
            // the 50px expanded content renders in the still-22px window, causing
            // the tracking area to invalidate and trigger immediate unhover — producing
            // a flicker loop when hovering from the top or bottom edge.
            doResize()
        } else {
            // Collapse async to avoid blocking SwiftUI body evaluation during unhover.
            // Cancellable via resizeWorkItem so rapid hover in/out doesn't queue stale
            // resizes. (OMI-COMPUTER-1PT)
            resizeWorkItem = DispatchWorkItem(block: doResize)
            DispatchQueue.main.async(execute: resizeWorkItem!)
        }
        return true
    }

    /// Canonical collapsed-pill frame on displays without a notch: the user's
    /// saved (dragged) position when draggable, otherwise the default
    /// top-center. Collapse-to-idle transitions snap here so transient layout
    /// forces (e.g. oversized content briefly growing the window with the
    /// origin pinned) can never permanently drift the pill sideways.
    private func canonicalCollapsedPillFrame() -> NSRect {
        let windowSize = responseGlowWindowSizeForCurrentScreen(forSurfaceSize: collapsedBarSize)
        if ShortcutSettings.shared.draggableBarEnabled,
           let saved = UserDefaults.standard.string(forKey: Self.positionKey) {
            let origin = NSPointFromString(saved)
            if origin != .zero {
                // Saved origins are recorded for the bare pill; keep the pill's
                // top-center fixed when the glow outset inflates the window.
                let bare = Self.minBarSize
                let topCenter = NSPoint(x: origin.x + bare.width / 2, y: origin.y + bare.height)
                return NSRect(
                    x: topCenter.x - windowSize.width / 2,
                    y: topCenter.y - windowSize.height,
                    width: windowSize.width,
                    height: windowSize.height
                )
            }
        }
        return NSRect(origin: defaultTopCenteredOrigin(for: windowSize), size: windowSize)
    }

    /// Gives the subagent switcher enough room to unfurl into a centered
    /// stacked list without opening the full chat surface. Works in both
    /// display modes; the non-notch (pill) window skips glow outsets.
    func resizeForAgentSwitcher(visible: Bool) {
        guard !state.showingAIConversation,
              !state.isVoiceListening,
              !state.isShowingNotification,
              !suppressHoverResize
        else { return }

        if visible {
            let expandedSize = notchModeEnabled
                ? notchHoverMenuWindowSize(agentCount: AgentPillsManager.shared.pills.count)
                : pillAgentListWindowSize(agentCount: AgentPillsManager.shared.pills.count)
            resizeAnchored(to: expandedSize, makeResizable: false, animated: true, anchorTop: true)
        } else if notchModeEnabled {
            resizeAnchored(to: collapsedBarSize, makeResizable: false, animated: true, anchorTop: true)
        } else {
            // Collapse to the canonical pill position, not the current midX —
            // see canonicalCollapsedPillFrame.
            resizeToFrame(canonicalCollapsedPillFrame(), makeResizable: false, animated: true)
        }
    }

    /// Window size for the pill-mode agent list. No chrome band and no glow
    /// outsets — the surface starts at a slim top inset and fills the window.
    private func pillAgentListWindowSize(agentCount: Int) -> NSSize {
        NSSize(
            width: Self.notchExpandedWidth,
            height: Self.pillSurfaceTopPadding + Self.notchHoverMenuHeight(agentCount: agentCount)
        )
    }

    private var pillListCollapseWorkItem: DispatchWorkItem?

    /// Hover-driven agent list open/close for displays without a notch —
    /// the pill-mode analog of the notch hover menu. Opens when the pointer
    /// enters the pill, collapses when it leaves (see
    /// `schedulePillAgentListCollapse`), and also closes on esc, click-away,
    /// selecting an agent, or the last agent ending.
    func setPillAgentListVisible(_ visible: Bool) {
        guard !notchModeEnabled else { return }
        pillListCollapseWorkItem?.cancel()
        pillListCollapseWorkItem = nil
        let allowed = visible
            && state.canShowNotchHoverMenu
            && !AgentPillsManager.shared.pills.isEmpty
        guard state.notchHoverMenuOpen != allowed else { return }

        if allowed {
            // Resize before flipping state so the expanded list never renders
            // in a too-small window (same ordering as the hover-expand path).
            resizeForAgentSwitcher(visible: true)
            state.setNotchHoverMenuOpen(true)
        } else {
            state.setNotchHoverMenuOpen(false)
            resizeForAgentSwitcher(visible: false)
        }
    }

    /// Collapse the pill agent list shortly after the pointer leaves it.
    /// Delayed with a global-mouse recheck because SwiftUI hover events
    /// flicker while the window resizes underneath the cursor.
    func schedulePillAgentListCollapse() {
        guard !notchModeEnabled, state.isNotchHoverMenuVisible else { return }
        pillListCollapseWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self] in
            guard let self, self.state.isNotchHoverMenuVisible else { return }
            let mouse = NSEvent.mouseLocation
            guard !self.frame.insetBy(dx: -8, dy: -8).contains(mouse) else { return }
            self.setPillAgentListVisible(false)
        }
        pillListCollapseWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18, execute: workItem)
    }

    /// Resize window for PTT state (expanded when listening, compact circle when idle)
    func resizeForPTTState(expanded: Bool) {
        if notchModeEnabled {
            if state.showingAIConversation {
                return
            }
            let targetSize = expanded ? notchSize(active: true) : notchCollapsedSize
            resizeAnchored(
                to: targetSize,
                makeResizable: false,
                animated: true,
                animationDuration: Self.askOmiAnimationDuration,
                anchorTop: true
            )
            return
        }
        // On legacy displays, when the voice-response glow is still active
        // (e.g. realtime audio received this turn), collapse to the glow-adjusted
        // compact size so the white glow/stroke is not clipped until the idle
        // timer clears it.
        let compactSize: NSSize = state.isVoiceResponseGlowActive
            ? responseGlowWindowSizeForCurrentScreen(forSurfaceSize: Self.minBarSize)
            : Self.minBarSize
        let targetFrame = FloatingControlBarGeometry.pushToTalkFrame(
            currentFrame: frame,
            expanded: expanded,
            draggable: ShortcutSettings.shared.draggableBarEnabled,
            visibleFrame: geometryScreenVisibleFrame(),
            topInset: Self.topInset,
            compactSize: compactSize,
            voiceSize: Self.voiceBarSize
        )
        resizeToFrame(targetFrame, makeResizable: false, animated: true, animationDuration: 0.18)
    }

    /// Size the notch to fit the "thinking" indicator (active width) while a PTT
    /// query is being processed, then collapse it back once the response takes
    /// over. Voice listening and the open conversation surface own sizing while
    /// they are active, so this defers to them.
    /// Single authority for the pill ↔ notch-island morph across the active PTT
    /// lifecycle (idle pill → listening → thinking → answering → idle pill).
    /// Called whenever any active flag changes. Because notchModeEnabled is
    /// active-aware, this engages the island on external monitors too.
    func syncActiveIsland() {
        // The chat panel and notifications own their own geometry.
        guard !state.showingAIConversation, state.currentNotification == nil else { return }
        guard let screen = screenForPlacement else { return }

        let wasIsland = state.usesNotchIsland
        updateNotchIslandState()  // sets state.usesNotchIsland + level from notchModeEnabled
        let island = state.usesNotchIsland
        let target = activeIslandTargetFrame(on: screen, island: island)

        if wasIsland != island && island {
            // Idle pill → active island: grow with the reveal pop.
            styleMask.remove(.resizable)
            animateGrowOutFromNotch(to: target)
        } else if wasIsland != island && !island {
            // Active island → idle pill: shrink back to the resting pill at the
            // exact spot it left from (fall back to the computed top-center).
            state.notchRevealProgress = 1
            let pillFrame: NSRect
            if let saved = savedPillFrame {
                pillFrame = NSRect(origin: saved.origin, size: target.size)
                savedPillFrame = nil
            } else {
                pillFrame = target
            }
            resizeToFrame(pillFrame, makeResizable: false, animated: true, animationDuration: 0.16)
        } else {
            // Same mode, different sub-state (e.g. listening → thinking).
            resizeToFrame(target, makeResizable: false, animated: true, animationDuration: Self.askOmiAnimationDuration)
        }
    }

    /// The window frame for the current active sub-state, in the given mode.
    private func activeIslandTargetFrame(on screen: NSScreen, island: Bool) -> NSRect {
        let size: NSSize
        if island {
            let base: NSSize
            if state.isVoiceListening {
                base = notchSize(sideWidth: Self.notchActiveSideWidth, for: screen)
            } else if state.isThinking || state.isVoiceResponseWaiting {
                base = notchSize(sideWidth: Self.notchThinkingSideWidth, for: screen)
            } else {
                // Answering (voice-response glow) or a brief transient — collapsed island.
                base = notchCollapsedSize(for: screen)
            }
            size = responseGlowWindowSize(forSurfaceSize: base, usesNotchIsland: true)
        } else {
            size = state.isVoiceListening ? Self.voiceBarSize : Self.minBarSize
        }
        return NSRect(
            origin: topCenteredOrigin(for: size, on: screen, usesNotchIsland: island),
            size: size
        )
    }

    /// Pop the notch in from a near-zero scale the first time it is revealed via
    /// Push-to-Talk (it stays hidden at launch on notched displays).
    func playNotchRevealAnimation() {
        guard notchModeEnabled else { return }
        state.notchRevealProgress = 0.01
        withAnimation(.easeOut(duration: 0.24)) {
            state.notchRevealProgress = 1
        }
    }

    func showNotification(_ notification: FloatingBarNotification, animated: Bool = true) {
        guard !state.showingAIConversation else { return }
        state.currentNotification = notification
        let barHeight = notchModeEnabled
            ? notchChromeHeightForCurrentScreen
            : (state.isHoveringBar ? Self.expandedBarSize.height : Self.minBarSize.height)
        let targetSize = NSSize(
            width: Self.notificationWidth,
            height: barHeight + Self.notificationSpacing + Self.notificationHeight
        )
        resizeAnchored(to: targetSize, makeResizable: false, animated: animated, anchorTop: true)
    }

    /// PMB contextual presentation uses Omi's notification chrome but anchors it
    /// at the working screen's top-right rather than turning the menu-bar notch
    /// into a second notification center.
    func positionProactiveNudgeTopRight() {
        guard let screen = screenForPlacement else { return }
        setFrame(
            FloatingControlBarGeometry.proactiveNudgeFrame(
                size: frame.size,
                visibleFrame: screen.visibleFrame,
                margin: 20
            ),
            display: true
        )
    }

    func dismissNotification(animated: Bool = true) {
        guard state.currentNotification != nil else { return }
        state.currentNotification = nil

        let targetSize: NSSize
        if state.isVoiceListening && !notchModeEnabled {
            targetSize = Self.voiceBarSize
        } else {
            targetSize = state.isHoveringBar && !notchModeEnabled ? Self.expandedBarSize : collapsedBarSize
        }
        resizeAnchored(to: targetSize, makeResizable: false, animated: animated, anchorTop: true)
    }

    /// Restore the compact pill size when we temporarily surface the bar outside
    /// of an active hover, notification, voice session, or AI conversation.
    func normalizeForTemporaryShow() {
        guard !state.showingAIConversation, !state.isVoiceListening, state.currentNotification == nil else { return }
        resizeAnchored(to: collapsedBarSize, makeResizable: false, animated: false, anchorTop: true)
    }

    var hasSettledClosedForAutomation: Bool {
        let settledSize = responseGlowWindowSizeForCurrentScreen(forSurfaceSize: collapsedBarSize)
        return !state.showingAIConversation
            && !suppressHoverResize
            && pendingRestoreOrigin == nil
            && NSEqualSizes(frame.size, settledSize)
    }

    private func resizeToResponseHeight(animated: Bool = false) {
        let responseHeight = responseHeightConfiguration()

        // Preserve manual response sizing across follow-up sends. The window may
        // include glow padding, so compare and resize using the underlying black
        // response surface rather than the inflated NSWindow frame.
        let startWidth = max(expandedContentWidth, currentResponseSurfaceWidth())
        let startHeight = max(responseHeight.initialHeight, currentResponseSurfaceHeight())
        let initialSize = NSSize(width: startWidth, height: startHeight)
        resizeAnchored(to: initialSize, makeResizable: true, animated: animated, anchorTop: true)
        state.present(.mainResponse)
        setupResponseHeightObserver(for: .mainResponse, maxHeight: responseHeight.maxHeight)
    }

    private func beginMainResponseHeight(animated: Bool = false) {
        let responseHeight = responseHeightConfiguration()
        let initialSize = NSSize(width: expandedContentWidth, height: responseHeight.initialHeight)
        resizeAnchored(to: initialSize, makeResizable: true, animated: animated, anchorTop: true)
        state.present(.mainResponse)
        setupResponseHeightObserver(for: .mainResponse, maxHeight: responseHeight.maxHeight)
    }

    /// Observes the active surface's measured content height and expands the
    /// window to fit it, capped at `maxHeight`. Never shrinks automatically.
    private func setupResponseHeightObserver(
        for surface: FloatingConversationSurface,
        maxHeight: CGFloat
    ) {
        responseHeightCancellable?.cancel()
        let key = surface.measurementKey
        responseHeightCancellable = state.$responseContentHeights
            .map { $0[key] ?? 0 }
            .removeDuplicates()
            .debounce(for: .milliseconds(80), scheduler: DispatchQueue.main)
            .sink { [weak self] contentHeight in
                guard let self = self,
                      self.state.conversationSurface == surface,
                      !self.isUserResizing,
                      contentHeight > 0
                else { return }
                let targetHeight = (contentHeight + Self.responseViewOverhead).rounded(.up)
                let steppedHeight = (targetHeight / Self.responseStreamingResizeStep).rounded(.up) * Self.responseStreamingResizeStep
                let clampedHeight = min(max(steppedHeight, Self.minResponseHeight), maxHeight)
                // Only expand, never auto-shrink. In notch mode an active voice
                // response glow inflates the window frame, so compare content
                // growth against the underlying response surface height rather
                // than the glow-padded window height.
                guard clampedHeight > self.currentResponseSurfaceHeight() + 2 else { return }
                self.resizeAnchored(
                    to: NSSize(width: max(self.expandedContentWidth, self.currentResponseSurfaceWidth()), height: clampedHeight),
                    makeResizable: true,
                    animated: false,
                    anchorTop: true
                )
            }
    }

    /// Compute the default origin for the collapsed pill (top-center of the key screen).
    /// Used by closeAIConversation in non-draggable mode and centerOnMainScreen.
    private func defaultPillOrigin() -> NSPoint {
        defaultTopCenteredFrame(for: collapsedBarSize).origin
    }

    private func defaultTopCenteredFrame(for size: NSSize) -> NSRect {
        if notchModeEnabled, let screen = screenForPlacement {
            return NSRect(
                origin: topCenteredOrigin(for: size, on: screen, usesNotchIsland: true),
                size: size
            )
        }
        return FloatingControlBarGeometry.defaultPillFrame(
            size: size,
            visibleFrame: geometryScreenVisibleFrame(),
            topInset: topInsetForPillFallback
        )
    }

    private func defaultTopCenteredOrigin(for size: NSSize) -> NSPoint {
        defaultTopCenteredFrame(for: size).origin
    }

    private func geometryScreenVisibleFrame() -> NSRect {
        let targetScreen = self.screen ?? NSApp.keyWindow?.screen ?? NSScreen.main ?? NSScreen.screens.first
        return targetScreen?.visibleFrame ?? .zero
    }

    private var topInsetForPillFallback: CGFloat {
        Self.topInsetWhenNotchModeFallsBackToPill
    }

    /// Center the bar near the top of the main screen.
    private func centerOnMainScreen() {
        // Use the screen that has the key window, or fall back to main screen
        let targetScreen = NSApp.keyWindow?.screen ?? NSScreen.main ?? NSScreen.screens.first
        guard let screen = targetScreen else {
            self.center()
            return
        }
        if Self.screenHasCameraHousing(screen) {
            let targetFrame = frameForCurrentState(on: screen, usesNotchIsland: true)
            self.setFrame(targetFrame, display: true, animate: false)
            log("FloatingControlBarWindow: centered notch island at \(targetFrame.origin) on screen \(screen.frame)")
            return
        }
        let origin = FloatingControlBarGeometry.defaultPillFrame(
            size: frame.size,
            visibleFrame: screen.visibleFrame,
            topInset: Self.topInset
        ).origin
        self.setFrameOrigin(origin)
        log("FloatingControlBarWindow: centered at \(origin) on screen \(screen.visibleFrame)")
    }

    func resetPosition() {
        UserDefaults.standard.removeObject(forKey: FloatingControlBarWindow.positionKey)
        centerOnMainScreen()
    }

    /// Called when monitors are connected/disconnected. Re-center if the bar is no longer
    /// fully visible on any screen.
    private func scheduleStartupDisplayRevalidation() {
        startupDisplayRevalidationWorkItems.forEach { $0.cancel() }
        startupDisplayRevalidationWorkItems = Self.startupDisplayRevalidationDelays.map { delay in
            let workItem = DispatchWorkItem { [weak self] in
                Task { @MainActor in
                    self?.validatePositionOnScreenChange(reason: "startup_display_revalidation")
                }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
            return workItem
        }
    }

    private func validatePositionOnScreenChange(reason: String) {
        guard !isUserDragging else { return }
        updateNotchIslandState()
        // Non-draggable mode: always restore to default position on screen change
        if !ShortcutSettings.shared.draggableBarEnabled || notchModeEnabled {
            log("FloatingControlBarWindow: re-centering after display revalidation reason=\(reason) usesNotch=\(notchModeEnabled)")
            centerOnMainScreen()
            return
        }

        let barFrame = self.frame
        // Match the clamp approach used elsewhere in this window: prefer an
        // on-screen clamp over unconditional re-centering, so the bar stays
        // near where the user left it when a monitor is plugged/unplugged.
        // visibleFrame already excludes the Dock and menu bar, so clamping
        // also fixes the same Dock-encroachment scenario the rest of the PR
        // addresses.
        if let targetScreen = NSScreen.screens.first(where: { $0.visibleFrame.intersects(barFrame) }) {
            let clamped = FloatingControlBarWindow.clamp(barFrame, to: targetScreen.visibleFrame)
            if clamped != barFrame {
                log("FloatingControlBarWindow: clamping bar \(barFrame) to \(targetScreen.visibleFrame) after display revalidation reason=\(reason)")
                self.setFrameOrigin(clamped.origin)
                UserDefaults.standard.set(NSStringFromPoint(clamped.origin), forKey: FloatingControlBarWindow.positionKey)
            }
        } else {
            log("FloatingControlBarWindow: bar frame \(barFrame) does not intersect any visible screen, re-centering reason=\(reason)")
            UserDefaults.standard.removeObject(forKey: FloatingControlBarWindow.positionKey)
            centerOnMainScreen()
        }
    }

    // MARK: - NSWindowDelegate

    func windowDidResignKey(_ notification: Notification) {
        // Only dismiss when the user physically clicks away.
        // Programmatic focus changes — e.g. the AI agent activating a browser
        // window for automation — do NOT produce a mouse-down event, so we
        // leave the conversation open in those cases.
        let eventType = NSApp.currentEvent?.type
        let isMouseClick = eventType == .leftMouseDown
            || eventType == .rightMouseDown
            || eventType == .otherMouseDown

        guard state.showingAIConversation else {
            // The pinned pill agent list (non-notch) has no pointer-exit
            // tracking, so click-away is one of its close affordances.
            if isMouseClick, !notchModeEnabled, state.isNotchHoverMenuVisible {
                setPillAgentListVisible(false)
            }
            return
        }
        guard isMouseClick else { return }

        // Close in-place so the bar collapses smoothly instead of blinking out and back in.
        resignKeyAnimationToken += 1
        closeAIConversation()
    }

    @objc func windowDidMove(_ notification: Notification) {
        // Only persist position when the user is physically dragging the bar.
        // Programmatic moves (resize animations, chat open/close) should not
        // overwrite the saved position — that causes silent drift.
        guard isUserDragging else { return }
        UserDefaults.standard.set(
            NSStringFromPoint(self.frame.origin), forKey: FloatingControlBarWindow.positionKey
        )
    }

    func windowWillResize(_ sender: NSWindow, to frameSize: NSSize) -> NSSize {
        let minimumWidth: CGFloat
        if state.showingAIConversation {
            minimumWidth = expandedContentWidth
        } else if state.currentNotification != nil {
            minimumWidth = FloatingControlBarWindow.notificationWidth
        } else if state.isVoiceListening && !notchModeEnabled {
            minimumWidth = FloatingControlBarWindow.voiceBarSize.width
        } else if state.isHoveringBar {
            minimumWidth = FloatingControlBarWindow.expandedBarSize.width
        } else {
            minimumWidth = collapsedBarSize.width
        }

        return NSSize(
            width: max(frameSize.width, minimumWidth),
            height: max(frameSize.height, FloatingControlBarWindow.minBarSize.height)
        )
    }

    func windowDidResize(_ notification: Notification) {
        // Response size persistence is committed when the user finishes dragging
        // the resize grip. Persisting ordinary resize notifications here records
        // programmatic min-height transitions as user preferences because AppKit
        // can deliver the final resize notification after our animation flag is
        // cleared.
    }

    func finishUserResponseResize() {
        isUserResizing = false
        if state.conversationSurface.isResponseLike {
            persistCurrentResponseSurfaceSize()
        }
    }

    private func persistCurrentResponseSurfaceSize() {
        let size = NSSize(width: currentResponseSurfaceWidth(), height: currentResponseSurfaceHeight())
        guard state.conversationSurface.isResponseLike,
              size.width >= expandedContentWidth - 1,
              size.height >= Self.minResponseHeight
        else {
            UserDefaults.standard.removeObject(forKey: Self.sizeKey)
            return
        }

        UserDefaults.standard.set(NSStringFromSize(size), forKey: FloatingControlBarWindow.sizeKey)
    }
}


// Expose resizeToResponseHeight for the manager
extension FloatingControlBarWindow {
    func resizeToResponseHeightPublic(animated: Bool = false) {
        resizeToResponseHeight(animated: animated)
    }

    func resizeForActiveAgentChatPublic(pillID: UUID? = nil, animated: Bool = false) {
        let responseHeight = responseHeightConfiguration()
        let surface: FloatingConversationSurface
        if let pillID {
            surface = .agent(pillID)
            state.present(surface)
        } else {
            surface = state.conversationSurface
        }
        let targetSize = NSSize(
            width: max(expandedContentWidth, currentResponseSurfaceWidth()),
            height: max(responseHeight.initialHeight, currentResponseSurfaceHeight())
        )
        if targetSize.height > currentResponseSurfaceHeight() + 2 || targetSize.width > currentResponseSurfaceWidth() + 2 {
            resizeAnchored(
                to: targetSize,
                makeResizable: true,
                animated: animated,
                animationDuration: 0.10,
                anchorTop: true
            )
        }
        setupResponseHeightObserver(for: surface, maxHeight: responseHeight.maxHeight)
    }

    /// Switch from the Ask Omi input panel to the response-sized surface before
    /// routing a visible query. Keeping this transition in the window preserves
    /// the invariant that conversation state and NSPanel sizing move together.
    func beginVisibleMainQuery(_ message: String, fromVoice: Bool, animated: Bool = true) {
        cancelInputHeightObserver()
        state.currentQueryFromVoice = fromVoice
        state.aiInputText = ""
        state.displayedQuery = message
        state.clearCurrentAnswerAnchors()
        // clearCurrentAnswerAnchors keeps archived exchanges; sendAIQuery binds the real turn id.
        state.isAILoading = true
        state.isVoiceFollowUp = false
        state.voiceFollowUpTranscript = ""
        state.markConversationActivity()
        state.resetMeasuredContentHeight(for: .mainResponse)
        beginMainResponseHeight(animated: animated)
        orderFrontRegardless()
    }

    /// Resize the window to the normal Ask Omi input height after exiting an
    /// agent surface to `.mainInput`. Cancels the response-height observer and
    /// installs the input-height observer so non-Notch displays preserve the
    /// pill-mode "back to Omi chat" behavior instead of using Notch row navigation.
    func resizeForMainInputAfterAgentExit() {
        responseHeightCancellable?.cancel()
        responseHeightCancellable = nil
        state.responseContentHeight = 0
        state.inputViewHeight = inputPanelHeight
        let inputSize = NSSize(width: expandedContentWidth, height: inputPanelHeight)
        resizeAnchored(to: inputSize, makeResizable: false, animated: true, anchorTop: true)
        setupInputHeightObserver()
    }

    /// Save the current center point so closeAIConversation can restore position.
    /// Only saves if preChatCenter is not already set (avoids overwriting during follow-ups).
    /// If a close/restore animation is in flight (pendingRestoreOrigin is set), snaps the
    /// window to that target first so the saved center reflects the true pill position,
    /// not an intermediate animation frame.
    /// In non-draggable mode, always snaps to the fixed default position so the saved
    /// center is always the canonical top-center default, never a drifted value.
    func savePreChatCenterIfNeeded() {
        guard preChatCenter == nil else { return }
        let size = collapsedBarSize
        if !ShortcutSettings.shared.draggableBarEnabled || notchModeEnabled {
            // Non-draggable: always snap to the default pill position before saving.
            // This ensures preChatCenter is always the canonical default, not a
            // mid-animation frame or drifted position from a previous session.
            let origin = defaultPillOrigin()
            isResizingProgrammatically = true
            setFrame(NSRect(origin: origin, size: size), display: true, animate: false)
            isResizingProgrammatically = false
            pendingRestoreOrigin = nil
        } else if let restoreOrigin = pendingRestoreOrigin {
            // Draggable: if a restore animation is running, snap to its target immediately
            // so we record the correct pill position rather than a mid-animation frame.
            isResizingProgrammatically = true
            setFrame(NSRect(origin: restoreOrigin, size: size), display: true, animate: false)
            isResizingProgrammatically = false
            pendingRestoreOrigin = nil
        }
        if !notchModeEnabled, state.isNotchHoverMenuVisible {
            // Chat is opening from the taller pill agent list. The pill's true
            // center is the list's top-center minus half a pill — recording the
            // list frame's midpoint would drop the restored pill lower every
            // open/close cycle.
            preChatCenter = NSPoint(x: frame.midX, y: frame.maxY - size.height / 2)
            return
        }
        preChatCenter = NSPoint(x: frame.midX, y: frame.midY)
    }

    /// Invalidates any in-flight windowDidResignKey dismiss animation so a new PTT
    /// query won't be immediately closed by a stale completion block.
    func cancelPendingDismiss() {
        resignKeyAnimationToken += 1
        frameAnimationToken += 1
        if !ShortcutSettings.shared.draggableBarEnabled {
            pendingRestoreOrigin = nil
        }
        suppressHoverResize = false
        isResizingProgrammatically = false
    }
}
