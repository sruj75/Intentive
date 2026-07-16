import Foundation
@testable import IntentiveDesktopCore
import XCTest

final class ProactiveEffectRunnerTests: XCTestCase {
  func testPostMessageBackPresentsInAppAndAcknowledges() throws {
    let runtime = RecordingRuntimeClient()
    let overlay = RecordingOverlaySink()
    let runner = EffectRunner(overlay: overlay, runtimeClient: runtime)

    try runner.handle(
      CompanionMessage(
        messageId: "pmb-1",
        body: "Take a reset",
        emittedAt: "2026-07-05T10:00:00.000Z",
        viaPostMessageBack: true
      )
    )

    XCTAssertEqual(overlay.nudges, ["Take a reset"])
    XCTAssertEqual(runtime.acknowledgements, ["pmb-1"])
  }

  func testRegularReplyDoesNotPresentOrAcknowledgeAsEffect() throws {
    let runtime = RecordingRuntimeClient()
    let overlay = RecordingOverlaySink()
    let runner = EffectRunner(overlay: overlay, runtimeClient: runtime)

    try runner.handle(
      CompanionMessage(
        messageId: "reply-1",
        body: "Regular reply",
        emittedAt: "2026-07-05T10:00:00.000Z",
        viaPostMessageBack: false
      )
    )

    XCTAssertTrue(overlay.nudges.isEmpty)
    XCTAssertTrue(runtime.acknowledgements.isEmpty)
  }

  func testEngagedConversationAcknowledgesWithoutPresentingAgain() throws {
    let runtime = RecordingRuntimeClient()
    let overlay = RecordingOverlaySink(isEngaged: true)
    let runner = EffectRunner(overlay: overlay, runtimeClient: runtime)

    try runner.handle(
      CompanionMessage(
        messageId: "pmb-engaged",
        body: "You are already here",
        emittedAt: "2026-07-16T10:00:00.000Z",
        viaPostMessageBack: true
      )
    )

    XCTAssertTrue(overlay.nudges.isEmpty)
    XCTAssertEqual(runtime.acknowledgements, ["pmb-engaged"])
  }

  func testSnoozeSuppressesPresentationWithoutSuppressingAcknowledgement() throws {
    let runtime = RecordingRuntimeClient()
    let overlay = RecordingOverlaySink(isSnoozed: true)
    let runner = EffectRunner(overlay: overlay, runtimeClient: runtime)
    var now = Date(timeIntervalSince1970: 1_000)
    let snooze = ProactivePresentationSnooze(now: { now })
    snooze.snooze(for: 120)

    try runner.handle(
      CompanionMessage(
        messageId: "pmb-snoozed",
        body: "Held quietly",
        emittedAt: "2026-07-16T10:00:00.000Z",
        viaPostMessageBack: true
      )
    )

    XCTAssertTrue(snooze.isActive)
    XCTAssertTrue(overlay.nudges.isEmpty)
    XCTAssertEqual(runtime.acknowledgements, ["pmb-snoozed"])

    now.addTimeInterval(120)
    overlay.isSnoozed = snooze.isActive
    try runner.handle(
      CompanionMessage(
        messageId: "pmb-after-snooze",
        body: "Visible again",
        emittedAt: "2026-07-16T10:02:00.000Z",
        viaPostMessageBack: true
      )
    )

    XCTAssertEqual(overlay.nudges, ["Visible again"])
    XCTAssertEqual(runtime.acknowledgements, ["pmb-snoozed", "pmb-after-snooze"])
  }
}
