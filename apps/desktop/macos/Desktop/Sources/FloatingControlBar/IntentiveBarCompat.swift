import AppKit
import Carbon.HIToolbox.Events
import Combine
import SwiftUI
import UniformTypeIdentifiers

// Compatibility shims that let Omi's salvaged floating-bar UI compile and render
// against Intentive's Core. Omi welded the bar to a backend chat model (GRDB +
// networking), a subagent-pill subsystem, and a TTS playback service. Intentive
// is a conversational companion (ADR-0007): answers are plain text, there is no
// agent routing, and there is no voice playback to drive. These stand-ins keep
// the salvaged view code intact and correct for the no-agent / text-only path;
// the now-orphaned agent subviews are removed in the CP5 tidy pass.

// The free `log`/`logError` and `AnalyticsManager` the salvaged bar calls live in
// IntentiveNativeBuildShims.swift (shared with the other restored native assets).

// MARK: - Conversational chat model

enum ChatSender: Equatable {
    case user
    case ai
}

/// One turn in the floating-bar conversation. A deliberately thin stand-in for
/// Omi's backend `ChatMessage` DTO: Intentive renders answers as plain text, so
/// `contentBlocks` / `resources` are always empty and exist only so the salvaged
/// `FloatingControlBarState` accessors type-check.
struct ChatMessage: Equatable, Identifiable {
    var id: String
    var text: String
    var sender: ChatSender
    var isStreaming: Bool
    var clientTurnId: String?
    var contentBlocks: [ChatContentBlock]
    var resources: [ChatResource]
    var isSynced: Bool

    init(
        id: String = UUID().uuidString,
        text: String,
        sender: ChatSender,
        isStreaming: Bool = false,
        clientTurnId: String? = nil,
        contentBlocks: [ChatContentBlock] = [],
        resources: [ChatResource] = [],
        isSynced: Bool = false
    ) {
        self.id = id
        self.text = text
        self.sender = sender
        self.isStreaming = isStreaming
        self.clientTurnId = clientTurnId
        self.contentBlocks = contentBlocks
        self.resources = resources
        self.isSynced = isSynced
    }
}

/// Structured answer blocks are unused in the text-first companion. Mirrors Omi's
/// case arities only so `FloatingControlBarState.blockIdentity` compiles.
enum ChatContentBlock: Equatable {
    case text(String, String)
    case toolCall(String, String, String, String, String, String)
    case thinking(String, String)
    case discoveryCard(String, String, String, String)
    case agentSpawn(String, UUID?, String, String, String, String)
    case agentCompletion(String, UUID?, String, String, String, String, String, String)
}

struct ChatResource: Equatable, Identifiable {
    var id: String = UUID().uuidString
}

enum ChatContinuityInvariants {
    static func resourcesBelongingToMessages(
        messages: [ChatMessage],
        messageIds: Set<String>
    ) -> [ChatResource] {
        []
    }

    /// Collapsed agent-list header preview prefers the prompt over the output.
    static func agentPreviewText(prompt: String, output: String) -> String {
        let promptTrimmed = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        if !promptTrimmed.isEmpty { return promptTrimmed }
        return output.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

/// Observable timeline the salvaged bar reads answers from. The lean
/// `FloatingControlBarManager` feeds this from Core's `MessageStore` (CP2).
@MainActor
final class ChatProvider: ObservableObject {
    @Published var messages: [ChatMessage] = []
    init() {}

    /// Composer attachments are inert in the text-first companion (no upload
    /// backend). Staged attachments never reach this method because
    /// `ChatAttachment.from(url:)` returns nil, but the salvaged composer still
    /// references it, so it stays as a no-op sink.
    func addAttachments(_ attachments: [ChatAttachment]) {}
}

// MARK: - Composer attachments (inert: no upload backend in v1)

/// A staged composer attachment. `from(url:)` returns nil so drag-and-drop never
/// populates the composer's attachment row — the feature is neutralized at the
/// boundary while `AskAIInputView` stays verbatim.
struct ChatAttachment: Equatable, Identifiable {
    var id: String = UUID().uuidString

    static func from(url: URL) -> ChatAttachment? { nil }
}

/// Maximum composer attachments. Zero disables staging entirely.
let kMaxChatAttachments = 0

/// Preview strip above the composer — never rendered (attachments stay empty).
struct AttachmentPreviewRow: View {
    var attachments: [ChatAttachment]
    var onRemove: (String) -> Void
    var body: some View { EmptyView() }
}

/// Collects dropped file URLs. A no-op that reports "not handled" so dropped
/// files fall through instead of staging.
enum ChatAttachmentDropHandler {
    static func collectURLs(from providers: [NSItemProvider], completion: @escaping ([URL]) -> Void) -> Bool {
        false
    }
}

// MARK: - Model selection

/// Omi exposed multiple QoS tiers; Intentive's companion speaks with one model,
/// so this collapses to a single selection.
enum ModelQoS {
    enum Claude {
        static let defaultSelection = "intentive"
        static var availableModels: [(id: String, label: String)] {
            [(id: "intentive", label: "Intentive")]
        }
        static func sanitizedSelection(_ selection: String) -> String {
            selection.isEmpty ? defaultSelection : selection
        }
    }
}

// MARK: - Shortcut settings

@MainActor
final class ShortcutSettings: ObservableObject {
    static let shared = ShortcutSettings()
    nonisolated static let floatingBarShortcutChanged = Notification.Name("Intentive.floatingBarShortcutChanged")

    struct KeyboardShortcut: Codable, Equatable {
        var keyCode: UInt32
        var carbonModifiers: UInt32
        var displayTokens: [String]
    }

    static let defaultFloatingBarShortcut = KeyboardShortcut(
        keyCode: UInt32(kVK_ANSI_O),
        carbonModifiers: UInt32(cmdKey),
        displayTokens: ["⌘", "O"]
    )

    @Published var draggableBarEnabled: Bool = false
    @Published var solidBackground: Bool = false
    @Published var selectedModel: String = ModelQoS.Claude.defaultSelection
    let voiceInputEnabled = false
    @Published var askOmiShortcut: KeyboardShortcut {
        didSet {
            if let data = try? JSONEncoder().encode(askOmiShortcut) {
                UserDefaults.standard.set(data, forKey: Self.storageKey)
            }
            NotificationCenter.default.post(name: Self.floatingBarShortcutChanged, object: nil)
        }
    }
    let pttShortcut = KeyboardShortcut(keyCode: 0, carbonModifiers: 0, displayTokens: [])

    private static let storageKey = "intentive.floatingBarShortcut"

    private init() {
        if let data = UserDefaults.standard.data(forKey: Self.storageKey),
           let saved = try? JSONDecoder().decode(KeyboardShortcut.self, from: data)
        {
            askOmiShortcut = saved
        } else {
            askOmiShortcut = Self.defaultFloatingBarShortcut
        }
    }
}

// MARK: - Agent-pill subsystem (inert: no subagents in v1)

enum AgentHarnessMode: String {
    case hermes
    case openclaw
}

extension Optional where Wrapped == AgentHarnessMode {
    var rendersProviderMark: Bool { self != nil }
}

struct AgentTimelineRef {
    var pillId: UUID?
    var sessionId: String?
    var runId: String?
}

struct AgentHandoff {
    var originalRequest: String
    var agentTask: String
}

@MainActor
final class AgentPill: ObservableObject, Identifiable {
    enum Status: Equatable {
        case queued
        case starting
        case running
        case done
        case stopped
        case failed(String)

        var displayLabel: String {
            switch self {
            case .queued: return "Queued"
            case .starting, .running: return "Running"
            case .done: return "Done"
            case .stopped: return "Stopped"
            case .failed: return "Failed"
            }
        }

        var tintColor: Color {
            switch self {
            case .queued: return Color(red: 0.20, green: 0.86, blue: 1.0)
            case .starting, .running: return Color(red: 1.0, green: 0.80, blue: 0.40)
            case .done: return Color(red: 0.27, green: 0.92, blue: 0.46)
            case .stopped: return Color(red: 0.64, green: 0.66, blue: 0.70)
            case .failed: return Color(red: 1.0, green: 0.42, blue: 0.42)
            }
        }

        var isFinished: Bool {
            switch self {
            case .done, .stopped, .failed: return true
            default: return false
            }
        }
    }

    let id: UUID = UUID()
    @Published var status: Status = .queued
    var title: String = ""
    var latestActivity: String = ""
    var bridgeHarnessOverride: AgentHarnessMode?
    var query: String = ""
    var conversationMessages: [ChatMessage] = []
    var contentRevision: Int = 0
    var model: String = ""
    var canonicalSessionId: String?
    var canonicalRunId: String?
    var aiMessage: ChatMessage?
    var viewedAt: Date?
}

@MainActor
final class AgentPillsManager: ObservableObject {
    static let shared = AgentPillsManager()
    @Published var pills: [AgentPill] = []
    private init() {}

    func resolveAndPresentAgent(pillId: UUID?, sessionId: String?, runId: String?) async -> Bool {
        false
    }
    func markViewed(pillID: UUID) {}
    static func floatingAgentHandoff(for query: String) -> AgentHandoff? { nil }

    /// Spawning an agent from a notification is dead in v1 (no agent routing).
    /// Returns a detached, unmanaged pill so the salvaged Execute button compiles;
    /// it is never added to `pills`, so nothing renders. Removed in CP5.
    @discardableResult
    func spawn(
        query: String,
        model: String,
        fromVoice: Bool = false,
        preFetchedTitle: String? = nil,
        preFetchedAck: String? = nil,
        systemPromptSuffix: String? = nil,
        bridgeHarnessOverride: AgentHarnessMode? = nil
    ) -> AgentPill {
        AgentPill()
    }
}

/// Prompt fragments for the dead "Execute" button on a task notification. Kept as
/// an inert boundary stub (no agent spawning in v1); removed in the CP5 tidy pass.
enum ProactiveTaskExecute {
    static func buildQuery(title: String, message: String) -> String {
        "Task: \(title)\nDetails: \(message)"
    }
    static let systemPromptSuffix = ""
}

/// Provider logo beside an agent row — never rendered (no agents in v1).
struct AgentProviderLogoMark: View {
    var provider: AgentHarnessMode?
    var statusColor: Color
    var size: CGFloat
    var body: some View { EmptyView() }
}

// MARK: - Voice playback (removed per ADR-0007 — no TTS to interrupt)

@MainActor
final class FloatingBarVoicePlaybackService {
    static let shared = FloatingBarVoicePlaybackService()
    var isSpeaking: Bool { false }
    func interruptCurrentResponse() {}
    func stop() {}
    private init() {}
}

// MARK: - App-window seams referenced by the salvaged bar

extension Notification.Name {
    /// Posted by the bar's "open settings" affordance. No receiver is mounted in
    /// v1; the post is a harmless no-op until the settings surface is wired.
    static let navigateToFloatingBarSettings = Notification.Name("navigateToFloatingBarSettings")
}

/// Stand-in for Omi's `AppDelegate.openMainWindow` hook, which the assets module
/// cannot reach across the target boundary. Left unset (no-op) in v1.
enum AppDelegate {
    static var openMainWindow: (() -> Void)?
}

// MARK: - Thinking indicator (placeholder for the deferred branded mark)

/// The bar's "thinking" indicator. Omi rendered its 8-dot brand ring here; the
/// branded mark is part of a future revamp, so this is a neutral spinner
/// placeholder that keeps `NotchThinkingMark` verbatim.
struct OmiThinkingMark: View {
    var body: some View {
        FloatingLoadingSpinner()
            .frame(width: 16, height: 16)
    }
}

// MARK: - Push-to-talk (Omi's capture stack removed; dictation lives in Core)

/// Local stand-in that shadows Core's `PushToTalkManager` within this module so
/// the salvaged bar's `cancelListening()` call sites compile as no-ops.
@MainActor
final class PushToTalkManager {
    static let shared = PushToTalkManager()
    func cancelListening() {}
    private init() {}
}
