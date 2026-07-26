import Foundation
@testable import IntentiveDesktopCore
import XCTest

final class ProactiveEffectRunnerTests: XCTestCase {
  func testPostMessageBackPresentsInThreadAndAcknowledges() throws {
    let runtime = RecordingRuntimeClient()
    let overlay = RecordingOverlaySink()
    let windowId = "11111111-1111-4111-8111-111111111111"
    let runner = EffectRunner(
      overlay: overlay,
      runtimeClient: runtime,
      activeWindowId: { windowId }
    )

    let didPresent = try runner.handle(
      CompanionMessage(
        messageId: "pmb-1",
        windowId: windowId,
        body: "Take a reset",
        emittedAt: "2026-07-05T10:00:00.000Z",
        viaPostMessageBack: true
      )
    )

    XCTAssertTrue(didPresent)
    XCTAssertEqual(overlay.proactiveMessages, ["Take a reset"])
    XCTAssertEqual(runtime.acknowledgements, ["pmb-1"])
  }

  func testRegularReplyDoesNotPresentOrAcknowledgeAsEffect() throws {
    let runtime = RecordingRuntimeClient()
    let overlay = RecordingOverlaySink()
    let runner = EffectRunner(overlay: overlay, runtimeClient: runtime)

    let didPresent = try runner.handle(
      CompanionMessage(
        messageId: "reply-1",
        body: "Regular reply",
        emittedAt: "2026-07-05T10:00:00.000Z",
        viaPostMessageBack: false
      )
    )

    XCTAssertFalse(didPresent)
    XCTAssertTrue(overlay.proactiveMessages.isEmpty)
    XCTAssertTrue(runtime.acknowledgements.isEmpty)
  }

  func testWindowlessProactiveMessageDoesNotRevealFloatingBar() throws {
    let runtime = RecordingRuntimeClient()
    let overlay = RecordingOverlaySink()
    let runner = EffectRunner(
      overlay: overlay,
      runtimeClient: runtime,
      activeWindowId: { "11111111-1111-4111-8111-111111111111" }
    )

    let didPresent = try runner.handle(
      CompanionMessage(
        messageId: "windowless-pmb",
        body: "This lacks a Coaching Window",
        emittedAt: "2026-07-26T10:00:00.000Z",
        viaPostMessageBack: true
      )
    )

    XCTAssertFalse(didPresent)
    XCTAssertTrue(overlay.proactiveMessages.isEmpty)
    XCTAssertTrue(runtime.acknowledgements.isEmpty)
  }

  func testMultipleProactiveMessagesStackChronologically() throws {
    let runtime = RecordingRuntimeClient()
    let overlay = RecordingOverlaySink()
    let windowId = "11111111-1111-4111-8111-111111111111"
    let runner = EffectRunner(
      overlay: overlay,
      runtimeClient: runtime,
      activeWindowId: { windowId }
    )

    for (id, body) in [("pmb-1", "First"), ("pmb-2", "Second")] {
      try runner.handle(
        CompanionMessage(
          messageId: id,
          windowId: windowId,
          body: body,
          emittedAt: "2026-07-16T10:00:00.000Z",
          viaPostMessageBack: true
        )
      )
    }

    // Each PMB surfaces in the thread even while the bar is already open, and
    // every one is acknowledged.
    XCTAssertEqual(overlay.proactiveMessages, ["First", "Second"])
    XCTAssertEqual(runtime.acknowledgements, ["pmb-1", "pmb-2"])
  }

  func testStableMessageRetryAcknowledgesAgainWithoutRevealingTwice() throws {
    let runtime = RecordingRuntimeClient()
    let overlay = RecordingOverlaySink()
    let windowId = "11111111-1111-4111-8111-111111111111"
    let runner = EffectRunner(
      overlay: overlay,
      runtimeClient: runtime,
      activeWindowId: { windowId }
    )
    let opening = CompanionMessage(
      messageId: "opening:\(windowId)",
      windowId: windowId,
      body: "What important outcome should we protect?",
      emittedAt: "2026-07-26T10:00:00.000Z",
      viaPostMessageBack: true
    )

    XCTAssertTrue(try runner.handle(opening))
    XCTAssertFalse(try runner.handle(opening))

    XCTAssertEqual(overlay.proactiveMessages, ["What important outcome should we protect?"])
    XCTAssertEqual(
      runtime.acknowledgements,
      ["opening:\(windowId)", "opening:\(windowId)"]
    )
  }

  func testStaleCoachingWindowMessageDoesNotRevealFloatingBar() throws {
    let runtime = RecordingRuntimeClient()
    let overlay = RecordingOverlaySink()
    let runner = EffectRunner(
      overlay: overlay,
      runtimeClient: runtime,
      activeWindowId: { "11111111-1111-4111-8111-111111111111" }
    )

    let didPresent = try runner.handle(
      CompanionMessage(
        messageId: "stale-pmb",
        windowId: "22222222-2222-4222-8222-222222222222",
        body: "This belonged to an earlier window",
        emittedAt: "2026-07-26T10:00:00.000Z",
        viaPostMessageBack: true
      )
    )

    XCTAssertFalse(didPresent)
    XCTAssertTrue(overlay.proactiveMessages.isEmpty)
    XCTAssertTrue(runtime.acknowledgements.isEmpty)
  }

  func testLockedCoachingWindowMessageDoesNotRevealOrAcknowledge() throws {
    let runtime = RecordingRuntimeClient()
    let overlay = RecordingOverlaySink()
    let windowId = "33333333-3333-4333-8333-333333333333"
    let state = DesktopCoachingWindowState.locked(windowId: windowId)
    let runner = EffectRunner(
      overlay: overlay,
      runtimeClient: runtime,
      activeWindowId: { state.activeWindowId }
    )

    let didPresent = try runner.handle(
      CompanionMessage(
        messageId: "locked-pmb",
        windowId: windowId,
        body: "This must wait until unlock",
        emittedAt: "2026-07-26T10:00:00.000Z",
        viaPostMessageBack: true
      )
    )

    XCTAssertFalse(didPresent)
    XCTAssertTrue(overlay.proactiveMessages.isEmpty)
    XCTAssertTrue(runtime.acknowledgements.isEmpty)
  }
}
