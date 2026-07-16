import Carbon.HIToolbox.Events
import Combine
import SwiftUI

enum ChatSender: Equatable {
  case user
  case ai
}

/// Text-only projection of one Runtime-owned conversation message.
struct ChatMessage: Equatable, Identifiable {
  var id: String
  var text: String
  var sender: ChatSender
  var isStreaming: Bool
  var clientTurnId: String?
  var isSynced: Bool

  init(
    id: String = UUID().uuidString,
    text: String,
    sender: ChatSender,
    isStreaming: Bool = false,
    clientTurnId: String? = nil,
    isSynced: Bool = false
  ) {
    self.id = id
    self.text = text
    self.sender = sender
    self.isStreaming = isStreaming
    self.clientTurnId = clientTurnId
    self.isSynced = isSynced
  }
}

@MainActor
final class ChatProvider: ObservableObject {
  @Published var messages: [ChatMessage] = []
}

/// Narrow settings seam retained from the Omi bar's Carbon shortcut and chrome
/// configuration. Rejected voice/model/attachment settings are not represented.
@MainActor
final class ShortcutSettings: ObservableObject {
  static let shared = ShortcutSettings()
  nonisolated static let floatingBarShortcutChanged =
    Notification.Name("Intentive.floatingBarShortcutChanged")

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

  @Published var draggableBarEnabled = false
  @Published var solidBackground = false
  let voiceInputEnabled = false
  @Published var floatingBarShortcut: KeyboardShortcut {
    didSet {
      if let data = try? JSONEncoder().encode(floatingBarShortcut) {
        UserDefaults.standard.set(data, forKey: Self.storageKey)
      }
      NotificationCenter.default.post(name: Self.floatingBarShortcutChanged, object: nil)
    }
  }

  private static let storageKey = "intentive.floatingBarShortcut"

  private init() {
    if let data = UserDefaults.standard.data(forKey: Self.storageKey),
      let saved = try? JSONDecoder().decode(KeyboardShortcut.self, from: data)
    {
      floatingBarShortcut = saved
    } else {
      floatingBarShortcut = Self.defaultFloatingBarShortcut
    }
  }
}

struct IntentiveThinkingMark: View {
  var body: some View {
    FloatingLoadingSpinner()
      .frame(width: 16, height: 16)
  }
}
