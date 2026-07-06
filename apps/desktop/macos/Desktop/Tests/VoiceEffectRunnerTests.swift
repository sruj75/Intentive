import Foundation
@testable import IntentiveDesktopCore
import XCTest

final class VoiceEffectRunnerTests: XCTestCase {
  func testPushToTalkTranscribesSpeechAndSendsUserMessage() async throws {
    let runtime = RecordingRuntimeClient()
    let ptt = PushToTalkManager(
      audioCapture: FixedAudioCapture(samples: [0.2, 0.1, -0.2]),
      voiceGate: EnergyVoiceActivityGate(threshold: 0.01),
      transcription: FixedTranscription(text: "What should I focus on?"),
      runtimeClient: runtime
    )

    let message = try await ptt.captureAndSend()
    XCTAssertEqual(message?.body, "What should I focus on?")
    XCTAssertEqual(runtime.userMessages, ["What should I focus on?"])
  }

  func testPushToTalkIgnoresSilence() async throws {
    let runtime = RecordingRuntimeClient()
    let ptt = PushToTalkManager(
      audioCapture: FixedAudioCapture(samples: [0.0, 0.001]),
      voiceGate: EnergyVoiceActivityGate(threshold: 0.01),
      transcription: FixedTranscription(text: "ignored"),
      runtimeClient: runtime
    )

    let message = try await ptt.captureAndSend()
    XCTAssertNil(message)
    XCTAssertTrue(runtime.userMessages.isEmpty)
  }

  func testEffectRunnerDeliversPostMessageBackAndAcks() throws {
    let runtime = RecordingRuntimeClient()
    let notifications = RecordingNotificationSink()
    let overlay = RecordingOverlaySink()
    let runner = EffectRunner(notifications: notifications, overlay: overlay, runtimeClient: runtime)

    try runner.handle(
      CompanionMessage(
        messageId: "pmb-1",
        body: "Take a reset",
        emittedAt: "2026-07-05T10:00:00.000Z",
        viaPostMessageBack: true
      )
    )

    XCTAssertEqual(notifications.delivered.first?.body, "Take a reset")
    XCTAssertEqual(overlay.nudges, ["Take a reset"])
    XCTAssertEqual(runtime.acknowledgements, ["pmb-1"])
  }

  func testEffectRunnerIgnoresRegularReplies() throws {
    let runtime = RecordingRuntimeClient()
    let notifications = RecordingNotificationSink()
    let overlay = RecordingOverlaySink()
    let runner = EffectRunner(notifications: notifications, overlay: overlay, runtimeClient: runtime)

    try runner.handle(
      CompanionMessage(
        messageId: "reply-1",
        body: "Regular reply",
        emittedAt: "2026-07-05T10:00:00.000Z",
        viaPostMessageBack: false
      )
    )

    XCTAssertTrue(notifications.delivered.isEmpty)
    XCTAssertTrue(overlay.nudges.isEmpty)
    XCTAssertTrue(runtime.acknowledgements.isEmpty)
  }
}

private struct FixedAudioCapture: AudioCaptureService {
  var samples: [Float]

  func capturePushToTalkAudio() async throws -> [Float] {
    samples
  }
}

private struct FixedTranscription: LocalTranscriptionService {
  var text: String

  func transcribe(_ samples: [Float]) async throws -> String {
    text
  }
}
