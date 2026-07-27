import Foundation
@testable import IntentiveDesktopCore
import XCTest

@MainActor
final class DesktopCoachingWindowCoordinatorTests: XCTestCase {
  func testWindowIdentifiersAreCanonicalLowercaseAcrossLifecycleEffects() throws {
    let effects = RecordingCoachingWindowEffects()
    let coordinator = DesktopCoachingWindowCoordinator(
      initialEligibility: .allGranted,
      effects: effects,
      clientCapabilities: [.desktopCoachingV1],
      runtimeConnected: true,
      now: { Date(timeIntervalSince1970: 1_774_681_200) },
      makeUUID: { "ABCDEF12-3456-4789-ABCD-EF1234567890" }
    )

    try coordinator.handle(.launch(.appLaunch))

    let canonicalWindowId = "abcdef12-3456-4789-abcd-ef1234567890"
    XCTAssertEqual(coordinator.state, .active(windowId: canonicalWindowId))
    XCTAssertEqual(
      effects.actions,
      [
        "enqueue-start:\(canonicalWindowId):app_launch",
        "start-perception:\(canonicalWindowId)",
        "presence:\(canonicalWindowId):active",
      ]
    )
  }

  func testEligibleLaunchQueuesWindowBeforeStartingPerception() throws {
    let effects = RecordingCoachingWindowEffects()
    let coordinator = DesktopCoachingWindowCoordinator(
      initialEligibility: .allGranted,
      effects: effects,
      clientCapabilities: [.desktopCoachingV1],
      lockFile: CoachingWindowLockFile(url: temporaryLockURL()),
      runtimeConnected: true,
      now: { Date(timeIntervalSince1970: 1_774_681_200) },
      makeUUID: { "11111111-1111-4111-8111-111111111111" }
    )

    try coordinator.handle(.launch(.appLaunch))

    XCTAssertEqual(
      effects.actions,
      [
        "enqueue-start:11111111-1111-4111-8111-111111111111:app_launch",
        "start-perception:11111111-1111-4111-8111-111111111111",
        "presence:11111111-1111-4111-8111-111111111111:active",
      ]
    )
    XCTAssertEqual(
      coordinator.state,
      .active(windowId: "11111111-1111-4111-8111-111111111111")
    )
  }

  func testEligibilityRefreshCannotStartSensorsBeforeLaunchReconciliation() throws {
    let effects = RecordingCoachingWindowEffects()
    let coordinator = DesktopCoachingWindowCoordinator(
      initialEligibility: .allGranted,
      effects: effects,
      clientCapabilities: [.desktopCoachingV1],
      runtimeConnected: true,
      makeUUID: { "12121212-1212-4212-8212-121212121212" }
    )

    try coordinator.handle(
      .eligibilityChanged(.allGranted, eligibleStartReason: .permissionRestored)
    )

    XCTAssertEqual(coordinator.state, .inactive(.awaitingLaunch))
    XCTAssertEqual(effects.actions, [])

    try coordinator.handle(.launch(.appLaunch))

    XCTAssertEqual(
      effects.actions,
      [
        "enqueue-start:12121212-1212-4212-8212-121212121212:app_launch",
        "start-perception:12121212-1212-4212-8212-121212121212",
        "presence:12121212-1212-4212-8212-121212121212:active",
      ]
    )
  }

  func testUnverifiedCredentialWithoutDurableProfileCannotStartLifecycleOrSensors() throws {
    let effects = RecordingCoachingWindowEffects()
    var eligibility = DesktopCoachingEligibility.allGranted
    eligibility.isAuthenticated = DesktopCoachingProfileReadiness.isReady(
      verifiedUserID: nil,
      mountedDurableProfileUserID: nil
    )
    let coordinator = DesktopCoachingWindowCoordinator(
      initialEligibility: eligibility,
      effects: effects,
      clientCapabilities: [.desktopCoachingV1],
      runtimeConnected: true,
      makeUUID: { "10101010-1010-4010-8010-101010101010" }
    )

    try coordinator.handle(.launch(.loginLaunch))

    XCTAssertEqual(coordinator.state, .inactive(.ineligible))
    XCTAssertEqual(effects.actions, [])
  }

  func testRestoreBeforeLaunchPreservesStaleLockUntilCrashRecoveryClosesIt() throws {
    let lockURL = temporaryLockURL()
    let lockFile = CoachingWindowLockFile(url: lockURL)
    let staleIdentity = CoachingWindowIdentity(
      windowId: "13131313-1313-4313-8313-131313131313",
      startedAt: "2026-07-26T07:00:00.000Z"
    )
    try lockFile.write(staleIdentity)
    defer { try? FileManager.default.removeItem(at: lockURL.deletingLastPathComponent()) }
    let effects = RecordingCoachingWindowEffects()
    let coordinator = DesktopCoachingWindowCoordinator(
      initialEligibility: .allGranted,
      effects: effects,
      clientCapabilities: [.desktopCoachingV1],
      lockFile: lockFile,
      runtimeConnected: true,
      makeUUID: { "14141414-1414-4414-8414-141414141414" }
    )

    try coordinator.handle(
      .eligibilityChanged(.allGranted, eligibleStartReason: .appLaunch)
    )

    XCTAssertEqual(coordinator.state, .inactive(.awaitingLaunch))
    XCTAssertEqual(lockFile.read(), staleIdentity)
    XCTAssertEqual(effects.actions, [])

    try coordinator.handle(.launch(.appLaunch))

    XCTAssertEqual(
      effects.actions,
      [
        "stop-perception",
        "enqueue-end:13131313-1313-4313-8313-131313131313:crash",
        "enqueue-start:14141414-1414-4414-8414-141414141414:crash_recovery",
        "start-perception:14141414-1414-4414-8414-141414141414",
        "presence:14141414-1414-4414-8414-141414141414:active",
      ]
    )
    XCTAssertEqual(
      lockFile.read()?.windowId,
      "14141414-1414-4414-8414-141414141414"
    )
  }

  func testDuplicateLaunchDoesNotMisclassifyTheCurrentWindowAsCrashed() throws {
    let lockURL = temporaryLockURL()
    let lockFile = CoachingWindowLockFile(url: lockURL)
    defer { try? FileManager.default.removeItem(at: lockURL.deletingLastPathComponent()) }
    let effects = RecordingCoachingWindowEffects()
    let coordinator = DesktopCoachingWindowCoordinator(
      initialEligibility: .allGranted,
      effects: effects,
      clientCapabilities: [.desktopCoachingV1],
      lockFile: lockFile,
      runtimeConnected: true,
      makeUUID: { "15151515-1515-4515-8515-151515151515" }
    )
    try coordinator.handle(.launch(.appLaunch))
    effects.reset()

    try coordinator.handle(.launch(.appLaunch))

    XCTAssertEqual(effects.actions, [])
    XCTAssertEqual(
      coordinator.state,
      .active(windowId: "15151515-1515-4515-8515-151515151515")
    )
    XCTAssertEqual(
      lockFile.read()?.windowId,
      "15151515-1515-4515-8515-151515151515"
    )
  }

  func testIneligibleLaunchDefersStaleCrashCloseUntilAuthenticatedStorageIsReady() throws {
    let lockURL = temporaryLockURL()
    let lockFile = CoachingWindowLockFile(url: lockURL)
    let staleIdentity = CoachingWindowIdentity(
      windowId: "16161616-1616-4616-8616-161616161616",
      startedAt: "2026-07-26T07:00:00.000Z"
    )
    try lockFile.write(staleIdentity)
    defer { try? FileManager.default.removeItem(at: lockURL.deletingLastPathComponent()) }
    let effects = RecordingCoachingWindowEffects()
    let restoredEligibility = DesktopCoachingEligibility.allGranted.withMicrophone(false)
    let coordinator = DesktopCoachingWindowCoordinator(
      initialEligibility: restoredEligibility,
      effects: effects,
      clientCapabilities: [.desktopCoachingV1],
      lockFile: lockFile,
      runtimeConnected: true,
      makeUUID: { "17171717-1717-4717-8717-171717171717" }
    )

    try coordinator.handle(
      .eligibilityChanged(restoredEligibility, eligibleStartReason: .permissionRestored)
    )
    XCTAssertEqual(coordinator.state, .inactive(.ineligible))
    XCTAssertEqual(lockFile.read(), staleIdentity)

    try coordinator.handle(.launch(.appLaunch))

    XCTAssertEqual(effects.actions, [])
    XCTAssertEqual(coordinator.state, .inactive(.ineligible))
    XCTAssertEqual(lockFile.read(), staleIdentity)

    effects.reset()
    try coordinator.handle(
      .eligibilityChanged(.allGranted, eligibleStartReason: .permissionRestored)
    )

    XCTAssertEqual(
      effects.actions,
      [
        "stop-perception",
        "enqueue-end:16161616-1616-4616-8616-161616161616:crash",
        "enqueue-start:17171717-1717-4717-8717-171717171717:crash_recovery",
        "start-perception:17171717-1717-4717-8717-171717171717",
        "presence:17171717-1717-4717-8717-171717171717:active",
      ]
    )
  }

  func testDeferredCrashCloseKeepsLockUntilDurableEnqueueCanRetry() throws {
    let lockURL = temporaryLockURL()
    let lockFile = CoachingWindowLockFile(url: lockURL)
    let staleIdentity = CoachingWindowIdentity(
      windowId: "18181818-1818-4818-8818-181818181818",
      startedAt: "2026-07-26T07:00:00.000Z"
    )
    try lockFile.write(staleIdentity)
    defer { try? FileManager.default.removeItem(at: lockURL.deletingLastPathComponent()) }
    let effects = RecordingCoachingWindowEffects()
    effects.endFailuresRemaining = 1
    let ineligible = DesktopCoachingEligibility.allGranted.withMicrophone(false)
    let coordinator = DesktopCoachingWindowCoordinator(
      initialEligibility: ineligible,
      effects: effects,
      clientCapabilities: [.desktopCoachingV1],
      lockFile: lockFile,
      runtimeConnected: true,
      makeUUID: { "19191919-1919-4919-8919-191919191919" }
    )
    try coordinator.handle(.launch(.appLaunch))

    XCTAssertThrowsError(
      try coordinator.handle(
        .eligibilityChanged(.allGranted, eligibleStartReason: .permissionRestored)
      )
    )

    XCTAssertEqual(lockFile.read(), staleIdentity)
    XCTAssertEqual(coordinator.state, .inactive(.ineligible))
    XCTAssertEqual(
      effects.actions,
      [
        "stop-perception",
        "enqueue-end:18181818-1818-4818-8818-181818181818:crash",
      ]
    )

    effects.reset()
    try coordinator.handle(
      .eligibilityChanged(.allGranted, eligibleStartReason: .permissionRestored)
    )

    XCTAssertEqual(
      effects.actions,
      [
        "stop-perception",
        "enqueue-end:18181818-1818-4818-8818-181818181818:crash",
        "enqueue-start:19191919-1919-4919-8919-191919191919:crash_recovery",
        "start-perception:19191919-1919-4919-8919-191919191919",
        "presence:19191919-1919-4919-8919-191919191919:active",
      ]
    )
    XCTAssertEqual(
      lockFile.read()?.windowId,
      "19191919-1919-4919-8919-191919191919"
    )
  }

  func testLockStopsPerceptionAndUnlockResumesSameWindowWithoutAnotherStart() throws {
    let effects = RecordingCoachingWindowEffects()
    let coordinator = DesktopCoachingWindowCoordinator(
      initialEligibility: .allGranted,
      effects: effects,
      clientCapabilities: [.desktopCoachingV1],
      runtimeConnected: true,
      makeUUID: { "22222222-2222-4222-8222-222222222222" }
    )
    try coordinator.handle(.launch(.appLaunch))
    effects.reset()

    try coordinator.handle(.screenLocked)
    XCTAssertEqual(
      effects.actions,
      [
        "stop-perception",
        "presence:22222222-2222-4222-8222-222222222222:locked",
      ]
    )
    XCTAssertEqual(
      coordinator.state,
      .locked(windowId: "22222222-2222-4222-8222-222222222222")
    )

    effects.reset()
    try coordinator.handle(.screenUnlocked)
    XCTAssertEqual(
      effects.actions,
      [
        "start-perception:22222222-2222-4222-8222-222222222222",
        "presence:22222222-2222-4222-8222-222222222222:active",
      ]
    )
    XCTAssertEqual(
      coordinator.state,
      .active(windowId: "22222222-2222-4222-8222-222222222222")
    )
  }

  func testSleepEndsWindowAndWakeStartsANewOne() throws {
    let effects = RecordingCoachingWindowEffects()
    var ids = [
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ]
    let coordinator = DesktopCoachingWindowCoordinator(
      initialEligibility: .allGranted,
      effects: effects,
      clientCapabilities: [.desktopCoachingV1],
      runtimeConnected: true,
      makeUUID: { ids.removeFirst() }
    )
    try coordinator.handle(.launch(.appLaunch))
    effects.reset()

    try coordinator.handle(.systemSleep)
    XCTAssertEqual(
      effects.actions,
      [
        "stop-perception",
        "enqueue-end:33333333-3333-4333-8333-333333333333:system_sleep",
      ]
    )
    XCTAssertEqual(coordinator.state, .inactive(.sleeping))

    effects.reset()
    try coordinator.handle(.systemWake)
    XCTAssertEqual(
      effects.actions,
      [
        "enqueue-start:44444444-4444-4444-8444-444444444444:system_wake",
        "start-perception:44444444-4444-4444-8444-444444444444",
        "presence:44444444-4444-4444-8444-444444444444:active",
      ]
    )
  }

  func testPauseStopsEverythingAndExplicitResumeBeginsFreshWindow() throws {
    let effects = RecordingCoachingWindowEffects()
    var ids = [
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
    ]
    let coordinator = DesktopCoachingWindowCoordinator(
      initialEligibility: .allGranted,
      effects: effects,
      clientCapabilities: [.desktopCoachingV1],
      runtimeConnected: true,
      makeUUID: { ids.removeFirst() }
    )
    try coordinator.handle(.launch(.appLaunch))
    effects.reset()

    try coordinator.handle(.pauseRequested)
    XCTAssertEqual(
      effects.actions,
      [
        "stop-perception",
        "enqueue-end:55555555-5555-4555-8555-555555555555:pause",
      ]
    )
    XCTAssertEqual(coordinator.state, .paused)

    effects.reset()
    try coordinator.handle(.resumeRequested)
    XCTAssertEqual(
      effects.actions,
      [
        "enqueue-start:66666666-6666-4666-8666-666666666666:user_resume",
        "start-perception:66666666-6666-4666-8666-666666666666",
        "presence:66666666-6666-4666-8666-666666666666:active",
      ]
    )
  }

  func testSleepAndWakeWhilePausedPreserveExplicitPause() throws {
    let effects = RecordingCoachingWindowEffects()
    let coordinator = DesktopCoachingWindowCoordinator(
      initialEligibility: .allGranted,
      effects: effects,
      clientCapabilities: [.desktopCoachingV1],
      runtimeConnected: true,
      makeUUID: { "67676767-6767-4767-8767-676767676767" }
    )
    try coordinator.handle(.launch(.appLaunch))
    try coordinator.handle(.pauseRequested)
    effects.reset()

    try coordinator.handle(.systemSleep)
    try coordinator.handle(.systemWake)

    XCTAssertEqual(coordinator.state, .paused)
    XCTAssertEqual(effects.actions, [])
  }

  func testPrelaunchSleepAndWakeCannotBypassCrashRecoveryGate() throws {
    let lockURL = temporaryLockURL()
    let lockFile = CoachingWindowLockFile(url: lockURL)
    let staleIdentity = CoachingWindowIdentity(
      windowId: "68686868-6868-4868-8868-686868686868",
      startedAt: "2026-07-26T07:00:00.000Z"
    )
    try lockFile.write(staleIdentity)
    defer { try? FileManager.default.removeItem(at: lockURL.deletingLastPathComponent()) }
    let effects = RecordingCoachingWindowEffects()
    let coordinator = DesktopCoachingWindowCoordinator(
      initialEligibility: .allGranted,
      effects: effects,
      clientCapabilities: [.desktopCoachingV1],
      lockFile: lockFile,
      runtimeConnected: true,
      makeUUID: { "69696969-6969-4969-8969-696969696969" }
    )

    try coordinator.handle(.systemSleep)
    try coordinator.handle(.systemWake)

    XCTAssertEqual(coordinator.state, .inactive(.awaitingLaunch))
    XCTAssertEqual(effects.actions, [])
    XCTAssertEqual(lockFile.read(), staleIdentity)

    try coordinator.handle(.launch(.appLaunch))

    XCTAssertEqual(
      effects.actions,
      [
        "stop-perception",
        "enqueue-end:68686868-6868-4868-8868-686868686868:crash",
        "enqueue-start:69696969-6969-4969-8969-696969696969:crash_recovery",
        "start-perception:69696969-6969-4969-8969-696969696969",
        "presence:69696969-6969-4969-8969-696969696969:active",
      ]
    )
  }

  func testPermissionLossEndsWindowAndRestoringFinalGrantStartsANewOne() throws {
    let effects = RecordingCoachingWindowEffects()
    var ids = [
      "77777777-7777-4777-8777-777777777777",
      "88888888-8888-4888-8888-888888888888",
    ]
    let coordinator = DesktopCoachingWindowCoordinator(
      initialEligibility: .allGranted,
      effects: effects,
      clientCapabilities: [.desktopCoachingV1],
      runtimeConnected: true,
      makeUUID: { ids.removeFirst() }
    )
    try coordinator.handle(.launch(.appLaunch))
    effects.reset()

    var permissionLost = DesktopCoachingEligibility.allGranted
    permissionLost.microphoneGranted = false
    try coordinator.handle(
      .eligibilityChanged(permissionLost, eligibleStartReason: .permissionRestored)
    )
    XCTAssertEqual(
      effects.actions,
      [
        "stop-perception",
        "enqueue-end:77777777-7777-4777-8777-777777777777:permission_lost",
      ]
    )
    XCTAssertEqual(coordinator.state, .inactive(.ineligible))

    effects.reset()
    try coordinator.handle(
      .eligibilityChanged(.allGranted, eligibleStartReason: .permissionRestored)
    )
    XCTAssertEqual(
      effects.actions,
      [
        "enqueue-start:88888888-8888-4888-8888-888888888888:permission_restored",
        "start-perception:88888888-8888-4888-8888-888888888888",
        "presence:88888888-8888-4888-8888-888888888888:active",
      ]
    )
  }

  func testRevokingAnyRequiredSensorPermissionEndsTheActiveWindowFailClosed() throws {
    let revokedPermissions: [(String, (inout DesktopCoachingEligibility) -> Void)] = [
      ("screen", { $0.screenRecordingGranted = false }),
      ("microphone", { $0.microphoneGranted = false }),
      ("accessibility", { $0.accessibilityGranted = false }),
      ("system-audio", { $0.systemAudioGranted = false }),
    ]

    for (permission, revoke) in revokedPermissions {
      let effects = RecordingCoachingWindowEffects()
      let coordinator = DesktopCoachingWindowCoordinator(
        initialEligibility: .allGranted,
        effects: effects,
        clientCapabilities: [.desktopCoachingV1],
        makeUUID: { "79797979-7979-4979-8979-797979797979" }
      )
      try coordinator.handle(.launch(.appLaunch))
      effects.reset()
      var eligibility = DesktopCoachingEligibility.allGranted
      revoke(&eligibility)

      try coordinator.handle(
        .eligibilityChanged(eligibility, eligibleStartReason: .permissionRestored)
      )

      XCTAssertEqual(
        effects.actions,
        [
          "stop-perception",
          "enqueue-end:79797979-7979-4979-8979-797979797979:permission_lost",
        ],
        "permission: \(permission)"
      )
      XCTAssertEqual(
        coordinator.state,
        .inactive(.ineligible),
        "permission: \(permission)"
      )
    }
  }

  func testLiveReattestationEndsOnAccessibilityRevocationAndRestartsAfterRestoration() throws {
    let effects = RecordingCoachingWindowEffects()
    var liveEligibility = DesktopCoachingEligibility.allGranted
    var ids = [
      "80808080-8080-4080-8080-808080808080",
      "81818181-8181-4181-8181-818181818181",
    ]
    let coordinator = DesktopCoachingWindowCoordinator(
      initialEligibility: liveEligibility,
      effects: effects,
      clientCapabilities: [.desktopCoachingV1],
      eligibilityAttestation: { liveEligibility },
      makeUUID: { ids.removeFirst() }
    )
    try coordinator.handle(.launch(.appLaunch))
    effects.reset()

    liveEligibility.accessibilityGranted = false
    XCTAssertFalse(try coordinator.reattestEligibility())
    XCTAssertEqual(
      effects.actions,
      [
        "stop-perception",
        "enqueue-end:80808080-8080-4080-8080-808080808080:permission_lost",
      ]
    )
    XCTAssertEqual(coordinator.state, .inactive(.ineligible))

    effects.reset()
    liveEligibility.accessibilityGranted = true
    XCTAssertTrue(try coordinator.reattestEligibility())
    XCTAssertEqual(
      effects.actions,
      [
        "enqueue-start:81818181-8181-4181-8181-818181818181:permission_restored",
        "start-perception:81818181-8181-4181-8181-818181818181",
      ]
    )
    XCTAssertEqual(
      coordinator.state,
      .active(windowId: "81818181-8181-4181-8181-818181818181")
    )
  }

  func testReconnectOnlyReattestsCurrentWindow() throws {
    let effects = RecordingCoachingWindowEffects()
    let coordinator = DesktopCoachingWindowCoordinator(
      initialEligibility: .allGranted,
      effects: effects,
      clientCapabilities: [.desktopCoachingV1],
      runtimeConnected: false,
      makeUUID: { "99999999-9999-4999-8999-999999999999" }
    )
    try coordinator.handle(.launch(.appLaunch))
    effects.reset()

    try coordinator.handle(.runtimeConnectionChanged(true))

    XCTAssertEqual(
      effects.actions,
      ["presence:99999999-9999-4999-8999-999999999999:active"]
    )
    XCTAssertEqual(
      coordinator.state,
      .active(windowId: "99999999-9999-4999-8999-999999999999")
    )
  }

  func testRelaunchClosesCrashLockBeforeStartingFreshWindow() throws {
    let lockURL = temporaryLockURL()
    let lockFile = CoachingWindowLockFile(url: lockURL)
    try lockFile.write(
      CoachingWindowIdentity(
        windowId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        startedAt: "2026-07-26T07:00:00.000Z"
      )
    )
    defer { try? FileManager.default.removeItem(at: lockURL.deletingLastPathComponent()) }
    let effects = RecordingCoachingWindowEffects()
    let coordinator = DesktopCoachingWindowCoordinator(
      initialEligibility: .allGranted,
      effects: effects,
      clientCapabilities: [.desktopCoachingV1],
      lockFile: lockFile,
      runtimeConnected: true,
      makeUUID: { "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }
    )

    try coordinator.handle(.launch(.appLaunch))

    XCTAssertEqual(
      effects.actions,
      [
        "stop-perception",
        "enqueue-end:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:crash",
        "enqueue-start:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:crash_recovery",
        "start-perception:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "presence:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:active",
      ]
    )
  }

  func testSignOutStopsPerceptionBeforeEndingWindow() throws {
    let effects = RecordingCoachingWindowEffects()
    let coordinator = DesktopCoachingWindowCoordinator(
      initialEligibility: .allGranted,
      effects: effects,
      clientCapabilities: [.desktopCoachingV1],
      makeUUID: { "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }
    )
    try coordinator.handle(.launch(.appLaunch))
    effects.reset()

    try coordinator.handle(.signOut)

    XCTAssertEqual(
      effects.actions,
      [
        "stop-perception",
        "enqueue-end:cccccccc-cccc-4ccc-8ccc-cccccccccccc:sign_out",
      ]
    )
    XCTAssertEqual(coordinator.state, .inactive(.signedOut))
  }

  func testSignInAfterSignOutStartsAFreshWindow() throws {
    let effects = RecordingCoachingWindowEffects()
    var ids = [
      "cacacaca-caca-4aca-8aca-cacacacacaca",
      "cbcbcbcb-cbcb-4bcb-8bcb-cbcbcbcbcbcb",
    ]
    let coordinator = DesktopCoachingWindowCoordinator(
      initialEligibility: .allGranted,
      effects: effects,
      clientCapabilities: [.desktopCoachingV1],
      runtimeConnected: true,
      makeUUID: { ids.removeFirst() }
    )
    try coordinator.handle(.launch(.appLaunch))
    try coordinator.handle(.signOut)
    effects.reset()

    try coordinator.handle(
      .eligibilityChanged(.allGranted, eligibleStartReason: .signIn)
    )

    XCTAssertEqual(
      coordinator.state,
      .active(windowId: "cbcbcbcb-cbcb-4bcb-8bcb-cbcbcbcbcbcb")
    )
    XCTAssertEqual(
      effects.actions,
      [
        "enqueue-start:cbcbcbcb-cbcb-4bcb-8bcb-cbcbcbcbcbcb:sign_in",
        "start-perception:cbcbcbcb-cbcb-4bcb-8bcb-cbcbcbcbcbcb",
        "presence:cbcbcbcb-cbcb-4bcb-8bcb-cbcbcbcbcbcb:active",
      ]
    )
  }

  func testQuitStopsPerceptionBeforeEndingWindow() throws {
    let effects = RecordingCoachingWindowEffects()
    let coordinator = DesktopCoachingWindowCoordinator(
      initialEligibility: .allGranted,
      effects: effects,
      clientCapabilities: [.desktopCoachingV1],
      makeUUID: { "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }
    )
    try coordinator.handle(.launch(.appLaunch))
    effects.reset()

    try coordinator.handle(.quit)

    XCTAssertEqual(
      effects.actions,
      [
        "stop-perception",
        "enqueue-end:dddddddd-dddd-4ddd-8ddd-dddddddddddd:quit",
      ]
    )
    XCTAssertEqual(coordinator.state, .inactive(.quit))
  }

  func testFailedEndKeepsWindowIdentitySoPauseCanRetryDurably() throws {
    let effects = RecordingCoachingWindowEffects()
    effects.endFailuresRemaining = 1
    let coordinator = DesktopCoachingWindowCoordinator(
      initialEligibility: .allGranted,
      effects: effects,
      clientCapabilities: [.desktopCoachingV1],
      makeUUID: { "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" }
    )
    try coordinator.handle(.launch(.appLaunch))
    effects.reset()

    XCTAssertThrowsError(try coordinator.handle(.pauseRequested))
    XCTAssertEqual(
      coordinator.state,
      .active(windowId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")
    )
    XCTAssertEqual(
      effects.actions,
      [
        "stop-perception",
        "enqueue-end:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee:pause",
      ]
    )

    effects.reset()
    try coordinator.handle(.pauseRequested)
    XCTAssertEqual(coordinator.state, .paused)
    XCTAssertEqual(
      effects.actions,
      [
        "stop-perception",
        "enqueue-end:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee:pause",
      ]
    )
  }

  private func temporaryLockURL() -> URL {
    FileManager.default.temporaryDirectory
      .appendingPathComponent("DesktopCoachingWindowCoordinatorTests-\(UUID().uuidString)")
      .appendingPathComponent("intentive_coaching_window.lock")
  }
}

@MainActor
private final class RecordingCoachingWindowEffects: DesktopCoachingWindowEffects {
  private(set) var actions: [String] = []
  var endFailuresRemaining = 0

  func reset() {
    actions.removeAll()
  }

  func enqueueWindowStarted(_ event: CoachingWindowStarted) throws {
    actions.append("enqueue-start:\(event.windowId):\(event.reason.rawValue)")
  }

  func enqueueWindowEnded(_ event: CoachingWindowEnded) throws {
    actions.append("enqueue-end:\(event.windowId):\(event.reason.rawValue)")
    if endFailuresRemaining > 0 {
      endFailuresRemaining -= 1
      throw RecordingEffectError.endRejected
    }
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

private enum RecordingEffectError: Error {
  case endRejected
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

  func withMicrophone(_ granted: Bool) -> DesktopCoachingEligibility {
    var copy = self
    copy.microphoneGranted = granted
    return copy
  }
}
