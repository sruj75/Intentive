import Foundation
@testable import IntentiveDesktopCore
import XCTest

final class ProtocolFixturesTests: XCTestCase {
  func testDecodesSharedProtocolFixtures() throws {
    let fixtures = try repoRoot().appendingPathComponent("packages/protocol/test/fixtures")

    let perceptionData = try Data(contentsOf: fixtures.appendingPathComponent("perception-event.json"))
    let perception = try ProtocolEventCodec.decodePerceptionEvent(perceptionData)
    XCTAssertEqual(perception.type, "perception_event")
    XCTAssertEqual(perception.sourceClient, .desktop)
    XCTAssertEqual(perception.embeddingRef?.dim, perception.embeddingRef?.vector.count)

    let helloData = try Data(contentsOf: fixtures.appendingPathComponent("hello-ok.json"))
    let hello = try ProtocolEventCodec.decodeRuntimeToClientEvent(helloData)
    guard case .helloOk(let helloOk) = hello else {
      return XCTFail("expected hello_ok")
    }
    XCTAssertEqual(helloOk.sessionSnapshot.messages.first?.messageId, "user_1")

    let companionData = try Data(contentsOf: fixtures.appendingPathComponent("companion-message.json"))
    let companion = try ProtocolEventCodec.decodeRuntimeToClientEvent(companionData)
    guard case .companionMessage(let message) = companion else {
      return XCTFail("expected companion_message")
    }
    XCTAssertEqual(message.messageId, "companion_1")
  }

  func testRejectsUnknownKeysAndBadEmbeddingDimensions() throws {
    let stale = Data(
      """
      {"type":"perception_event","event_id":"x","source_client":"desktop","captured_at":"2026-07-05T10:00:00.000Z","period_start":"2026-07-05T10:00:00.000Z","period_end":"2026-07-05T10:00:00.000Z","artifact_type":"searchable_screen_record","summary":"x","signals":{},"sensitivity_label":"normal","retention_class":"screen_memory_30d","confidence":1,"local_record_ref":"local","snapshot_id":"old"}
      """.utf8)
    XCTAssertThrowsError(try ProtocolEventCodec.decodePerceptionEvent(stale))

    let badEmbedding = Data(
      """
      {"type":"perception_event","event_id":"x","source_client":"desktop","captured_at":"2026-07-05T10:00:00.000Z","period_start":"2026-07-05T10:00:00.000Z","period_end":"2026-07-05T10:00:00.000Z","artifact_type":"searchable_screen_record","summary":"x","signals":{},"embedding_ref":{"model_id":"m","dim":3,"vector":[1,2]},"sensitivity_label":"normal","retention_class":"screen_memory_30d","confidence":1,"local_record_ref":"local"}
      """.utf8)
    XCTAssertThrowsError(try ProtocolEventCodec.decodePerceptionEvent(badEmbedding))
  }

  func testDecodesSharedCoachingWindowFixturesAndAdvertisesCapability() throws {
    let fixtures = try repoRoot().appendingPathComponent("packages/protocol/test/fixtures")

    let started = try ProtocolEventCodec.decodeCoachingWindowStarted(
      Data(contentsOf: fixtures.appendingPathComponent("coaching-window-started.json"))
    )
    XCTAssertEqual(started.windowId, "11111111-1111-4111-8111-111111111111")
    XCTAssertEqual(started.reason, .appLaunch)

    let ended = try ProtocolEventCodec.decodeCoachingWindowEnded(
      Data(contentsOf: fixtures.appendingPathComponent("coaching-window-ended.json"))
    )
    XCTAssertEqual(ended.windowId, started.windowId)
    XCTAssertEqual(ended.reason, .pause)

    let presence = try ProtocolEventCodec.decodeCoachingWindowPresence(
      Data(contentsOf: fixtures.appendingPathComponent("coaching-window-presence.json"))
    )
    XCTAssertEqual(presence.windowId, started.windowId)
    XCTAssertEqual(presence.state, .active)

    let connect = ConnectEvent(
      authToken: "runtime-token",
      clientVersion: "desktop-preview",
      clientTz: "Asia/Kolkata",
      capabilities: [.desktopCoachingV1]
    )
    let encoded = try XCTUnwrap(
      JSONSerialization.jsonObject(with: ProtocolEventCodec.encode(connect)) as? [String: Any]
    )
    XCTAssertEqual(encoded["capabilities"] as? [String], ["desktop_coaching_v1"])
  }

  func testCoachingWindowFieldsRemainOptionalOnLegacyMessagesAndPerception() throws {
    let fixtures = try repoRoot().appendingPathComponent("packages/protocol/test/fixtures")
    let legacyPerception = try ProtocolEventCodec.decodePerceptionEvent(
      Data(contentsOf: fixtures.appendingPathComponent("perception-event.json"))
    )
    XCTAssertNil(legacyPerception.windowId)

    let legacyCompanion = try ProtocolEventCodec.decodeRuntimeToClientEvent(
      Data(contentsOf: fixtures.appendingPathComponent("companion-message.json"))
    )
    guard case .companionMessage(let message) = legacyCompanion else {
      return XCTFail("expected companion_message")
    }
    XCTAssertNil(message.windowId)
  }

  func testRejectsMalformedCoachingWindowUUIDTimestampAndLiteralType() {
    let malformedUUID = Data(
      """
      {"type":"coaching_window_started","window_id":"not-a-uuid","started_at":"2026-07-26T08:00:00.000Z","reason":"app_launch"}
      """.utf8
    )
    XCTAssertThrowsError(try ProtocolEventCodec.decodeCoachingWindowStarted(malformedUUID))

    let malformedTimestamp = Data(
      """
      {"type":"coaching_window_ended","window_id":"11111111-1111-4111-8111-111111111111","ended_at":"yesterday","reason":"pause"}
      """.utf8
    )
    XCTAssertThrowsError(try ProtocolEventCodec.decodeCoachingWindowEnded(malformedTimestamp))

    let wrongLiteral = Data(
      """
      {"type":"perception_event","window_id":"11111111-1111-4111-8111-111111111111","state":"active","changed_at":"2026-07-26T08:00:00.000Z"}
      """.utf8
    )
    XCTAssertThrowsError(try ProtocolEventCodec.decodeCoachingWindowPresence(wrongLiteral))
  }

  private func repoRoot() throws -> URL {
    var cursor = URL(fileURLWithPath: #filePath)
    while cursor.path != "/" {
      let candidate = cursor.appendingPathComponent("packages/protocol/test/fixtures")
      if FileManager.default.fileExists(atPath: candidate.path) {
        return cursor
      }
      cursor.deleteLastPathComponent()
    }
    throw NSError(domain: "IntentiveTests", code: 1, userInfo: [NSLocalizedDescriptionKey: "repo root not found"])
  }
}
