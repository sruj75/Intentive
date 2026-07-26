import CoreGraphics
@testable import IntentiveDesktopCore
import XCTest

final class DesktopPrimaryWindowPlacementTests: XCTestCase {
  func testFirstVisibleShowIgnoresHiddenOffscreenOriginAndCentersInVisibleFrame() {
    let hiddenFrame = CGRect(x: 1_626, y: 993, width: 1_120, height: 752)
    let visibleFrame = CGRect(x: 0, y: 87, width: 1_710, height: 987)

    let placed = DesktopPrimaryWindowPlacement.frameForFirstVisibleShow(
      windowFrame: hiddenFrame,
      visibleFrame: visibleFrame
    )

    XCTAssertEqual(placed, CGRect(x: 295, y: 204.5, width: 1_120, height: 752))
  }

  func testFirstVisibleShowClampsOversizedWindowOriginToVisibleFrame() {
    let placed = DesktopPrimaryWindowPlacement.frameForFirstVisibleShow(
      windowFrame: CGRect(x: -4_000, y: 4_000, width: 1_200, height: 800),
      visibleFrame: CGRect(x: 100, y: 50, width: 800, height: 600)
    )

    XCTAssertEqual(placed, CGRect(x: 100, y: 50, width: 1_200, height: 800))
  }
}
