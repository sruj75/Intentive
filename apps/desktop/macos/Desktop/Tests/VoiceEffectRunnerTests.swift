import Foundation
@testable import IntentiveDesktopCore
import XCTest

final class VoiceEffectRunnerTests: XCTestCase {
  func testPushToTalkTranscribesSpeechAndSendsUserMessage() async throws {
    let runtime = RecordingRuntimeClient()
    let ptt = PushToTalkManager(
      audioCapture: FixedAudioCapture(pcm16k: sinePCM16k(seconds: 0.7, frequency: 220, amplitude: 3500)),
      transcription: FixedTranscription(text: "What should I focus on?"),
      runtimeClient: runtime
    )

    let message = try await ptt.captureAndSend()
    XCTAssertEqual(message?.body, "What should I focus on?")
    XCTAssertEqual(runtime.userMessages, ["What should I focus on?"])
  }

  func testPushToTalkDefaultTranscriptionDoesNotSendFabricatedMessage() async throws {
    let runtime = RecordingRuntimeClient()
    let ptt = PushToTalkManager(
      audioCapture: FixedAudioCapture(pcm16k: sinePCM16k(seconds: 0.7, frequency: 220, amplitude: 3500)),
      runtimeClient: runtime
    )

    do {
      _ = try await ptt.captureAndSend()
      XCTFail("Expected default push-to-talk transcription to be unavailable")
    } catch let error as PushToTalkTranscriptionError {
      XCTAssertEqual(error, .unavailable)
    }
    XCTAssertTrue(runtime.userMessages.isEmpty)
  }

  func testPushToTalkIgnoresSilence() async throws {
    let runtime = RecordingRuntimeClient()
    let transcription = RecordingTranscription(text: "ignored")
    let ptt = PushToTalkManager(
      audioCapture: FixedAudioCapture(pcm16k: pcm16k(seconds: 1.0) { _ in 0 }),
      transcription: transcription,
      runtimeClient: runtime
    )

    let message = try await ptt.captureAndSend()
    XCTAssertNil(message)
    XCTAssertTrue(runtime.userMessages.isEmpty)
    XCTAssertEqual(transcription.callCount, 0)
  }

  func testPushToTalkRejectsBroadbandNoiseBeforeTranscription() async throws {
    let runtime = RecordingRuntimeClient()
    let transcription = RecordingTranscription(text: "ignored")
    var state: UInt64 = 0x1234abcd
    let noise = pcm16k(seconds: 1.0) { _ in
      state = state &* 6364136223846793005 &+ 1442695040888963407
      let normalized = Double(Int64(bitPattern: state >> 16) % 20001 - 10000) / 10000.0
      return Int16(max(-12000, min(12000, Int(normalized * 12000))))
    }
    let ptt = PushToTalkManager(
      audioCapture: FixedAudioCapture(pcm16k: noise),
      transcription: transcription,
      runtimeClient: runtime
    )

    let message = try await ptt.captureAndSend()
    XCTAssertNil(message)
    XCTAssertTrue(runtime.userMessages.isEmpty)
    XCTAssertEqual(transcription.callCount, 0)
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
  var pcm16k: Data

  func capturePushToTalkAudio() async throws -> Data {
    pcm16k
  }
}

private struct FixedTranscription: LocalTranscriptionService {
  var text: String

  func transcribe(_ pcm16k: Data) async throws -> String {
    text
  }
}

private final class RecordingTranscription: LocalTranscriptionService {
  private(set) var callCount = 0
  var text: String

  init(text: String) {
    self.text = text
  }

  func transcribe(_ pcm16k: Data) async throws -> String {
    callCount += 1
    return text
  }
}

private func sinePCM16k(seconds: Double, frequency: Double, amplitude: Double) -> Data {
  pcm16k(seconds: seconds) { sampleIndex in
    let t = Double(sampleIndex) / 16_000.0
    return Int16((sin(2 * Double.pi * frequency * t) * amplitude).rounded())
  }
}

private func pcm16k(seconds: Double, sample: (Int) -> Int16) -> Data {
  let sampleCount = Int((seconds * 16_000).rounded())
  var data = Data(capacity: sampleCount * 2)
  for i in 0..<sampleCount {
    var value = sample(i).littleEndian
    withUnsafeBytes(of: &value) { data.append(contentsOf: $0) }
  }
  return data
}
