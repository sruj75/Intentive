import IntentiveDesktopCore
import XCTest

final class PushToTalkShortcutStateMachineTests: XCTestCase {
  func testHoldStartsRecordingAndSendsOnRelease() {
    var machine = PushToTalkShortcutStateMachine()

    XCTAssertEqual(machine.shortcutDown(at: 10), [.startRecording])
    XCTAssertEqual(machine.state, .listening)

    XCTAssertEqual(machine.shortcutUp(at: 11), [.stopRecordingAndSend])
    XCTAssertEqual(machine.state, .finalizing)

    machine.finishProcessing()
    XCTAssertEqual(machine.state, .idle)
  }

  func testQuickTapHoldsRecordingDuringLockDecisionThenSendsOnTimeout() {
    var machine = PushToTalkShortcutStateMachine(doubleTapThreshold: 0.4, tapToLockMaxHoldDuration: 0.22)

    XCTAssertEqual(machine.shortcutDown(at: 10), [.startRecording])
    XCTAssertEqual(
      machine.shortcutUp(at: 10.1),
      [.stopRecordingAndHoldForLock, .schedulePendingLockTimeout(after: 0.4)]
    )
    XCTAssertEqual(machine.state, .pendingLockDecision)

    XCTAssertEqual(machine.pendingLockTimeout(), [.sendPendingRecording])
    XCTAssertEqual(machine.state, .finalizing)
  }

  func testSecondTapBeforeTimeoutLocksAndNextTapFinalizes() {
    var machine = PushToTalkShortcutStateMachine()

    _ = machine.shortcutDown(at: 10)
    _ = machine.shortcutUp(at: 10.1)

    XCTAssertEqual(
      machine.shortcutDown(at: 10.3),
      [.cancelPendingLockTimeout, .discardPendingRecording, .startRecording]
    )
    XCTAssertEqual(machine.state, .lockedListening)

    XCTAssertEqual(machine.shortcutUp(at: 10.35), [])
    XCTAssertEqual(machine.shortcutDown(at: 12), [.stopRecordingAndSend])
    XCTAssertEqual(machine.state, .finalizing)
  }

  func testCancelResetsStateAndClearsPendingRecording() {
    var machine = PushToTalkShortcutStateMachine()

    _ = machine.shortcutDown(at: 10)
    _ = machine.shortcutUp(at: 10.1)

    XCTAssertEqual(machine.cancel(), [.cancelPendingLockTimeout, .discardPendingRecording])
    XCTAssertEqual(machine.state, .idle)
    XCTAssertEqual(machine.pendingLockTimeout(), [])
  }
}
