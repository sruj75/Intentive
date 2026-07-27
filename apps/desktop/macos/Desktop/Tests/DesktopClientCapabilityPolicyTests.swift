@testable import IntentiveDesktopCore
import XCTest

final class DesktopClientCapabilityPolicyTests: XCTestCase {
  func testDailyDevelopmentAdvertisesDesktopCoaching() {
    XCTAssertEqual(
      DesktopClientCapabilityPolicy.clientCapabilities(
        bundleID: "com.heyintentive.desktop.dev",
        environment: [:]
      ),
      [.desktopCoachingV1]
    )
  }

  func testFounderPreviewAdvertisesDesktopCoaching() {
    XCTAssertEqual(
      DesktopClientCapabilityPolicy.clientCapabilities(
        bundleID: "com.heyintentive.desktop.preview",
        environment: [:]
      ),
      [.desktopCoachingV1]
    )
  }

  func testPublicProductionRemainsDefaultOff() {
    XCTAssertNil(
      DesktopClientCapabilityPolicy.clientCapabilities(
        bundleID: "com.heyintentive.desktop",
        environment: [:]
      )
    )
  }

  func testAcceptanceAndExplicitOptInAdvertiseDesktopCoaching() {
    XCTAssertEqual(
      DesktopClientCapabilityPolicy.clientCapabilities(
        bundleID: nil,
        environment: ["INTENTIVE_ACCEPTANCE_PROFILE_ROOT": "/tmp/acceptance"]
      ),
      [.desktopCoachingV1]
    )
    XCTAssertEqual(
      DesktopClientCapabilityPolicy.clientCapabilities(
        bundleID: "com.example.intentive",
        environment: ["INTENTIVE_DESKTOP_COACHING_V1": "1"]
      ),
      [.desktopCoachingV1]
    )
  }
}
