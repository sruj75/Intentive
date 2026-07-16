import AppKit
@testable import IntentiveDesktopNativeAssets
import XCTest

@MainActor
final class FloatingBarGeometryTests: XCTestCase {
  private let visibleFrame = NSRect(x: 0, y: 0, width: 1440, height: 900)

  func testDefaultPillFrameIsTopCenteredInVisibleFrame() {
    let frame = FloatingControlBarGeometry.defaultPillFrame(
      size: NSSize(width: 160, height: 34),
      visibleFrame: visibleFrame,
      topInset: 8
    )
    XCTAssertEqual(frame, NSRect(x: 640, y: 858, width: 160, height: 34))
  }

  func testProactiveNudgeFrameIsContextualTopRightInsideVisibleFrame() {
    let frame = FloatingControlBarGeometry.proactiveNudgeFrame(
      size: NSSize(width: 430, height: 156),
      visibleFrame: visibleFrame,
      margin: 20
    )
    XCTAssertEqual(frame, NSRect(x: 990, y: 724, width: 430, height: 156))
  }

  func testNotchChromeActivationIgnoresTransparentOutsets() {
    let windowFrame = NSRect(x: 500, y: 800, width: 360, height: 58)
    XCTAssertTrue(
      FloatingControlBarGeometry.notchChromeActivationContains(
        mouseLocation: NSPoint(x: 680, y: 850),
        windowFrame: windowFrame,
        chromeHeight: 17,
        horizontalOutset: 24
      ))
    XCTAssertFalse(
      FloatingControlBarGeometry.notchChromeActivationContains(
        mouseLocation: NSPoint(x: 680, y: 838),
        windowFrame: windowFrame,
        chromeHeight: 17,
        horizontalOutset: 24
      ))
  }

  func testNotchChromeHeightUsesMeasuredAuxiliaryAreaHeight() {
    let height = FloatingControlBarWindow.notchChromeHeight(
      topSafeAreaInset: 30,
      auxiliaryTopLeftArea: NSRect(x: 0, y: 860, width: 600, height: 48),
      auxiliaryTopRightArea: NSRect(x: 840, y: 860, width: 600, height: 48)
    )
    XCTAssertEqual(height, 48)
  }

  func testNotchChromeHeightFallsBackToSafeAreaInset() {
    XCTAssertEqual(
      FloatingControlBarWindow.notchChromeHeight(
        topSafeAreaInset: 44,
        auxiliaryTopLeftArea: nil,
        auxiliaryTopRightArea: nil
      ),
      44
    )
  }
}
