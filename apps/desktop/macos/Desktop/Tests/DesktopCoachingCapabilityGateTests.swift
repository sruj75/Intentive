import Foundation
@testable import IntentiveDesktopCore
import XCTest

/// The Coaching Window is what the Desktop negotiates `desktop_coaching_v1`
/// for. If a build starts one without having advertised the capability, the
/// Runtime rejects `coaching_window_started`, `coaching_window_presence`, and
/// every window-stamped `perception_event` with `invalid_connect`, so nothing
/// is ever acknowledged and the durable outbox re-sends on every drain.
///
/// These tests pin the capability policy to the coordinator the way production
/// composes them, so the two cannot drift apart.
@MainActor
final class DesktopCoachingCapabilityGateTests: XCTestCase {
  func testPublicReleaseBuildNeverStartsACoachingWindow() throws {
    let bundleID = "com.heyintentive.desktop"
    XCTAssertNil(
      DesktopClientCapabilityPolicy.clientCapabilities(bundleID: bundleID, environment: [:]),
      "precondition: the public release build negotiates no coaching capability"
    )

    let effects = CapabilityGateEffectsSpy()
    let coordinator = makeCoordinator(bundleID: bundleID, effects: effects)

    try coordinator.handle(.launch(.appLaunch))

    XCTAssertNil(
      coordinator.state.windowId,
      "a build with no negotiated capability must not mint a window_id"
    )
    XCTAssertEqual(
      effects.actions,
      [],
      "no coaching lifecycle event and no perception may be produced without the capability"
    )
  }

  func testPublicReleaseBuildStaysClosedAcrossTheWholeLifecycle() throws {
    let effects = CapabilityGateEffectsSpy()
    let coordinator = makeCoordinator(bundleID: "com.heyintentive.desktop", effects: effects)

    try coordinator.handle(.launch(.appLaunch))
    try coordinator.handle(.runtimeConnectionChanged(true))
    try coordinator.handle(.systemSleep)
    try coordinator.handle(.systemWake)
    try coordinator.handle(.screenLocked)
    try coordinator.handle(.screenUnlocked)
    try coordinator.handle(.resumeRequested)
    try coordinator.handle(
      .eligibilityChanged(.allGranted, eligibleStartReason: .permissionRestored)
    )

    XCTAssertNil(coordinator.state.windowId)
    XCTAssertEqual(effects.actions, [])
  }

  func testFounderPreviewBuildStillOpensACoachingWindow() throws {
    let bundleID = "com.heyintentive.desktop.preview"
    XCTAssertEqual(
      DesktopClientCapabilityPolicy.clientCapabilities(bundleID: bundleID, environment: [:]),
      [.desktopCoachingV1],
      "precondition: the founder preview build negotiates the coaching capability"
    )

    let effects = CapabilityGateEffectsSpy()
    let coordinator = makeCoordinator(bundleID: bundleID, effects: effects)

    try coordinator.handle(.launch(.appLaunch))

    XCTAssertEqual(
      coordinator.state,
      .active(windowId: "11111111-1111-4111-8111-111111111111")
    )
    XCTAssertEqual(
      effects.actions,
      [
        "enqueue-start:11111111-1111-4111-8111-111111111111:app_launch",
        "start-perception:11111111-1111-4111-8111-111111111111",
      ]
    )
  }

  /// Compose the coordinator exactly as the app does: the capability the client
  /// will advertise on `connect` decides whether coaching runs at all.
  private func makeCoordinator(
    bundleID: String,
    effects: CapabilityGateEffectsSpy
  ) -> DesktopCoachingWindowCoordinator {
    let capabilities = DesktopClientCapabilityPolicy.clientCapabilities(
      bundleID: bundleID,
      environment: [:]
    )
    return DesktopCoachingWindowCoordinator(
      initialEligibility: .allGranted,
      effects: effects,
      clientCapabilities: capabilities,
      makeUUID: { "11111111-1111-4111-8111-111111111111" }
    )
  }
}

private extension DesktopCoachingEligibility {
  static let allGranted = DesktopCoachingEligibility(
    isAuthenticated: true,
    onboardingComplete: true,
    screenRecordingGranted: true,
    microphoneGranted: true,
    accessibilityGranted: true,
    systemAudioGranted: true
  )
}

private final class CapabilityGateEffectsSpy: DesktopCoachingWindowEffects {
  private(set) var actions: [String] = []

  func enqueueWindowStarted(_ event: CoachingWindowStarted) throws {
    actions.append("enqueue-start:\(event.windowId):\(event.reason.rawValue)")
  }

  func enqueueWindowEnded(_ event: CoachingWindowEnded) throws {
    actions.append("enqueue-end:\(event.windowId):\(event.reason.rawValue)")
  }

  func sendWindowPresence(_ event: CoachingWindowPresence) throws {
    actions.append("presence:\(event.windowId):\(event.state.rawValue)")
  }

  func startPerception(windowId: String) {
    actions.append("start-perception:\(windowId)")
  }

  func stopPerception() {
    actions.append("stop-perception")
  }
}
