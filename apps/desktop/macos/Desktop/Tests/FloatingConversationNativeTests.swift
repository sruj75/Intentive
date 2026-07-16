import Carbon.HIToolbox.Events
@testable import IntentiveDesktopNativeAssets
import XCTest

@MainActor
final class FloatingConversationNativeTests: XCTestCase {
  func testDefaultShortcutUsesCarbonMechanismWithIntentiveCommandODefault() {
    let shortcut = ShortcutSettings.defaultFloatingBarShortcut

    XCTAssertEqual(shortcut.keyCode, UInt32(kVK_ANSI_O))
    XCTAssertEqual(shortcut.carbonModifiers, UInt32(cmdKey))
    XCTAssertEqual(shortcut.displayTokens, ["⌘", "O"])
  }

  func testTextOnlyBarKeepsVoiceInputUnavailable() {
    XCTAssertFalse(ShortcutSettings.shared.voiceInputEnabled)
  }
}
