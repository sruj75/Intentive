import Carbon.HIToolbox.Events
@testable import IntentiveDesktopNativeAssets
import XCTest

@MainActor
final class FloatingConversationNativeTests: XCTestCase {
  func testDefaultShortcutUsesNonstandardCommandShiftReturnChord() {
    let shortcut = ShortcutSettings.defaultFloatingBarShortcut

    XCTAssertEqual(shortcut.keyCode, UInt32(kVK_Return))
    XCTAssertEqual(shortcut.carbonModifiers, UInt32(cmdKey | shiftKey))
    XCTAssertEqual(shortcut.displayTokens, ["⇧", "⌘", "↩"])
  }

  func testLegacyCommandODefaultMigratesButCustomShortcutsRemainUntouched() {
    let legacy = ShortcutSettings.KeyboardShortcut(
      keyCode: UInt32(kVK_ANSI_O), carbonModifiers: UInt32(cmdKey), displayTokens: ["⌘", "O"])
    let custom = ShortcutSettings.KeyboardShortcut(
      keyCode: UInt32(kVK_Space), carbonModifiers: UInt32(cmdKey | optionKey),
      displayTokens: ["⌘", "⌥", "Space"])

    XCTAssertEqual(
      ShortcutSettings.migratedShortcut(legacy),
      ShortcutSettings.defaultFloatingBarShortcut
    )
    XCTAssertEqual(ShortcutSettings.migratedShortcut(custom), custom)
  }

  func testGlobalShortcutRequiresAtLeastTwoModifiers() {
    XCTAssertFalse(
      ShortcutSettings.isSafeGlobalShortcut(
        keyCode: UInt32(kVK_ANSI_O), carbonModifiers: UInt32(cmdKey)))
    XCTAssertFalse(
      ShortcutSettings.isSafeGlobalShortcut(
        keyCode: UInt32(kVK_ANSI_Q), carbonModifiers: UInt32(cmdKey)))
    XCTAssertFalse(
      ShortcutSettings.isSafeGlobalShortcut(
        keyCode: UInt32(kVK_Return), carbonModifiers: 0))
    XCTAssertTrue(
      ShortcutSettings.isSafeGlobalShortcut(
        keyCode: UInt32(kVK_Return), carbonModifiers: UInt32(cmdKey | shiftKey)))
  }

  func testTextOnlyBarKeepsVoiceInputUnavailable() {
    XCTAssertFalse(ShortcutSettings.shared.voiceInputEnabled)
  }
}
