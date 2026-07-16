import Carbon.HIToolbox.Events
@testable import IntentiveDesktopNativeAssets
import XCTest

@MainActor
final class FloatingConversationNativeTests: XCTestCase {
  func testDefaultShortcutUsesOmiCarbonMechanismWithIntentiveCommandODefault() {
    let shortcut = ShortcutSettings.defaultFloatingBarShortcut

    XCTAssertEqual(shortcut.keyCode, UInt32(kVK_ANSI_O))
    XCTAssertEqual(shortcut.carbonModifiers, UInt32(cmdKey))
    XCTAssertEqual(shortcut.displayTokens, ["⌘", "O"])
  }

  func testTextOnlyBarKeepsVoiceInputAndAttachmentsUnavailable() {
    XCTAssertFalse(ShortcutSettings.shared.voiceInputEnabled)
    XCTAssertEqual(kMaxChatAttachments, 0)
    XCTAssertNil(ChatAttachment.from(url: URL(fileURLWithPath: "/tmp/not-uploaded.txt")))
  }
}
