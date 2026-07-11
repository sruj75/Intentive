@testable import IntentiveDesktopNativeAssets
import XCTest

/// Locks the "fill, don't send" merge behavior the floating bar uses to stage a
/// push-to-talk transcript in its composer (ADR-0007). The manager does the
/// imperative window work; this pure helper owns the text rule.
final class DictationComposerTests: XCTestCase {
  func testFirstDictationFillsEmptyComposerWithoutLeadingSpace() {
    XCTAssertEqual(
      DictationComposer.merge(existing: "", addition: "remind me to call mom"),
      "remind me to call mom"
    )
  }

  func testSecondDictationAppendsWithSingleSpace() {
    XCTAssertEqual(
      DictationComposer.merge(existing: "remind me to call mom", addition: "at five"),
      "remind me to call mom at five"
    )
  }

  func testEmptyDictationLeavesStagedTextUnchanged() {
    XCTAssertEqual(
      DictationComposer.merge(existing: "draft in progress", addition: "   "),
      "draft in progress"
    )
  }

  func testSurroundingWhitespaceIsTrimmedOnBothSides() {
    XCTAssertEqual(
      DictationComposer.merge(existing: "  hello  ", addition: "  world  "),
      "hello world"
    )
  }
}
