import Foundation
@testable import IntentiveDesktopCore
import XCTest

final class ProactiveEffectRunnerTests: XCTestCase {
  func testPostMessageBackPresentsInThreadAndAcknowledges() throws {
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

    XCTAssertEqual(overlay.proactiveMessages, ["Take a reset"])
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

    XCTAssertTrue(overlay.proactiveMessages.isEmpty)
    XCTAssertTrue(runtime.acknowledgements.isEmpty)
  }

  func testMultipleProactiveMessagesStackChronologically() throws {
    let runtime = RecordingRuntimeClient()
    let overlay = RecordingOverlaySink()
    let runner = EffectRunner(overlay: overlay, runtimeClient: runtime)

    for (id, body) in [("pmb-1", "First"), ("pmb-2", "Second")] {
      try runner.handle(
        CompanionMessage(
          messageId: id,
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
}
