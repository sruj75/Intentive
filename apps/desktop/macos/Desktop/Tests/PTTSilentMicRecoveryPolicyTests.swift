import XCTest

@testable import IntentiveDesktopCore

final class PTTSilentMicRecoveryPolicyTests: XCTestCase {
  func testRepeatedDeadMicTurnsRequestRecovery() {
    var policy = PTTSilentMicRecoveryPolicy()

    XCTAssertFalse(policy.recordDiscardedTurn(totalSec: 1.0, peak: 0))
    XCTAssertEqual(policy.consecutiveDeadMicTurns, 1)

    XCTAssertTrue(policy.recordDiscardedTurn(totalSec: 1.0, peak: 0))
    XCTAssertEqual(policy.consecutiveDeadMicTurns, 2)
  }

  func testShortSilentTapDoesNotCountAsDeadMic() {
    var policy = PTTSilentMicRecoveryPolicy()

    XCTAssertFalse(policy.recordDiscardedTurn(totalSec: 0.05, peak: 0))
    XCTAssertEqual(policy.consecutiveDeadMicTurns, 0)
  }

  func testQuietButNonZeroTurnResetsDeadMicCounter() {
    var policy = PTTSilentMicRecoveryPolicy()

    XCTAssertFalse(policy.recordDiscardedTurn(totalSec: 1.0, peak: 0))
    XCTAssertFalse(
      policy.recordDiscardedTurn(
        totalSec: 1.0,
        peak: PTTSilentMicRecoveryPolicy.deadMicPeakThreshold + 1
      )
    )
    XCTAssertEqual(policy.consecutiveDeadMicTurns, 0)
  }

  func testSuccessfulTurnResetsDeadMicCounter() {
    var policy = PTTSilentMicRecoveryPolicy()

    XCTAssertFalse(policy.recordDiscardedTurn(totalSec: 1.0, peak: 0))
    policy.recordSuccessfulTurn()

    XCTAssertEqual(policy.consecutiveDeadMicTurns, 0)
  }
}
