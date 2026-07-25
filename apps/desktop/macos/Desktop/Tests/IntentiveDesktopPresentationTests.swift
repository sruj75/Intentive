import XCTest

@testable import IntentiveDesktopPresentation

final class IntentiveDesktopPresentationTests: XCTestCase {
  func testRunningApplicationRetainsBundleIdentifierAndDisplayName() {
    let application = IntentiveRunningApplication(
      bundleID: "com.tinyspeck.slackmacgap",
      name: "Slack"
    )

    XCTAssertEqual(application.bundleID, "com.tinyspeck.slackmacgap")
    XCTAssertEqual(application.name, "Slack")
    XCTAssertEqual(application.id, "bundle:com.tinyspeck.slackmacgap")
    XCTAssertEqual(
      application,
      IntentiveRunningApplication(
        bundleID: "COM.TINYSPECK.SLACKMACGAP",
        name: "Slack Helper"
      ),
      "the bundle identifier remains the stable application identity when its display name changes"
    )
  }

  func testManualApplicationUsesNormalizedDisplayNameIdentityWithoutBundleIdentifier() {
    let application = IntentiveRunningApplication(bundleID: nil, name: "  Confidential Notes  ")

    XCTAssertNil(application.bundleID)
    XCTAssertEqual(application.name, "Confidential Notes")
    XCTAssertEqual(application.id, "name:confidential notes")
  }
}
