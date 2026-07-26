import Foundation
@testable import IntentiveDesktopCore
import XCTest

final class DesktopCaptureAuthorizationTests: XCTestCase {
  func testNewProfileStartsUnknownAndCannotBeTreatedAsGranted() {
    let coordinator = DesktopCaptureAuthorizationCoordinator(
      store: InMemoryDesktopCaptureAuthorizationStore()
    )

    XCTAssertEqual(coordinator.state, DesktopCaptureAuthorizationState())
    XCTAssertFalse(coordinator.state.directScreenCaptureGranted)
    XCTAssertFalse(coordinator.state.systemAudioGranted)
  }

  func testSuccessfulForegroundProbesPersistAcrossRelaunch() throws {
    let store = InMemoryDesktopCaptureAuthorizationStore()
    let coordinator = DesktopCaptureAuthorizationCoordinator(store: store)

    try coordinator.confirm(.directScreenCapture)
    try coordinator.confirm(.systemAudio)

    XCTAssertEqual(
      DesktopCaptureAuthorizationCoordinator(store: store).state,
      DesktopCaptureAuthorizationState(
        directScreenCaptureGranted: true,
        systemAudioGranted: true
      )
    )
  }

  func testPermissionFailureInvalidatesOnlyTheFailedAuthorization() throws {
    let store = InMemoryDesktopCaptureAuthorizationStore(
      state: DesktopCaptureAuthorizationState(
        directScreenCaptureGranted: true,
        systemAudioGranted: true
      )
    )
    let coordinator = DesktopCaptureAuthorizationCoordinator(store: store)

    try coordinator.invalidate(.systemAudio)

    XCTAssertTrue(coordinator.state.directScreenCaptureGranted)
    XCTAssertFalse(coordinator.state.systemAudioGranted)
  }
}
