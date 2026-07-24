import Foundation
@testable import IntentiveDesktopCore
import XCTest

/// Slice 05 — hybrid local semantic search over Screen Memory.
///
/// Renovated from Omi's `RewindViewModel.performSearch`: FTS results lead, then
/// on-device vector matches above the recall threshold are appended. The cloud
/// embedder is replaced by a local seam, so these tests inject a deterministic
/// embedder and prove recall, lexical-first ordering, and FTS fallback.
final class ScreenMemorySemanticSearchTests: XCTestCase {
  private struct Seed {
    let id: String
    let capturedAt: String
    let windowTitle: String
    let ocr: String
  }

  func testVectorRecallSurfacesSemanticMatchFtsMisses() async throws {
    let archive = try await seededArchive(
      embedder: ConceptSemanticEmbedder(),
      seeds: [
        Seed(id: idA, capturedAt: "2026-07-14T09:00:00.000Z", windowTitle: "Cluster", ocr: "kubernetes pods autoscaling replica set"),
        Seed(id: idB, capturedAt: "2026-07-14T09:01:00.000Z", windowTitle: "Billing", ocr: "stripe invoice billing subscription"),
      ]
    )

    // "k8s deployment scaling" shares no literal tokens with the orchestration
    // record, so FTS alone returns nothing.
    XCTAssertTrue(archive.search("k8s deployment scaling", limit: 10).isEmpty)

    let results = archive.semanticSearch("k8s deployment scaling", limit: 10)
    XCTAssertEqual(results.first?.record.id, idA)
    XCTAssertEqual(results.first?.matchedLexically, false)
    XCTAssertGreaterThan(results.first?.semanticSimilarity ?? 0, 0.9)
    XCTAssertFalse(results.contains { $0.record.id == idB })
  }

  func testLexicalHitsLeadAndSemanticRecallIsAppended() async throws {
    let archive = try await seededArchive(
      embedder: ConceptSemanticEmbedder(),
      seeds: [
        Seed(id: idC, capturedAt: "2026-07-14T10:00:00.000Z", windowTitle: "Cluster", ocr: "kubernetes deployment rollout"),
        Seed(id: idD, capturedAt: "2026-07-14T10:01:00.000Z", windowTitle: "Pods", ocr: "pods autoscaling replica"),
      ]
    )

    // "kubernetes deployment" is a literal hit on C; D shares no terms but is a
    // semantic neighbour, so it is recalled after the lexical result.
    let results = archive.semanticSearch("kubernetes deployment", limit: 10)
    XCTAssertEqual(results.first?.record.id, idC)
    XCTAssertEqual(results.first?.matchedLexically, true)
    let recalled = results.first { $0.record.id == idD }
    XCTAssertEqual(recalled?.matchedLexically, false)
  }

  func testSearchFallsBackToFtsWhenEmbedderUnavailable() async throws {
    let archive = try await seededArchive(
      embedder: DegradedSemanticEmbedder(),
      seeds: [
        Seed(id: idE, capturedAt: "2026-07-14T11:00:00.000Z", windowTitle: "Cluster", ocr: "kubernetes pods autoscaling"),
      ]
    )

    // Without the model, non-lexical recall is impossible while lexical search
    // still resolves through FTS.
    XCTAssertTrue(archive.semanticSearch("k8s scaling", limit: 10).isEmpty)
    let lexical = archive.semanticSearch("kubernetes", limit: 10)
    XCTAssertEqual(lexical.first?.record.id, idE)
    XCTAssertEqual(lexical.first?.matchedLexically, true)
  }

  func testAppleNaturalLanguageEmbedderIsSelfConsistentOrUnavailable() {
    let embedder = AppleNaturalLanguageSemanticEmbedder()
    guard embedder.isAvailable, let vector = embedder.embed("screen memory timeline") else {
      XCTAssertNil(embedder.embed("screen memory timeline"))
      return
    }
    let magnitude = sqrt(vector.reduce(Float(0)) { $0 + $1 * $1 })
    XCTAssertEqual(magnitude, 1, accuracy: 0.001)
    let repeated = embedder.embed("screen memory timeline") ?? []
    XCTAssertEqual(cosineSimilarity(vector, repeated), 1, accuracy: 0.001)
  }

  // MARK: - Harness

  private let idA = "AAAA0000-0000-0000-0000-000000000001"
  private let idB = "BBBB0000-0000-0000-0000-000000000002"
  private let idC = "CCCC0000-0000-0000-0000-000000000003"
  private let idD = "DDDD0000-0000-0000-0000-000000000004"
  private let idE = "EEEE0000-0000-0000-0000-000000000005"

  private func seededArchive(
    embedder: any LocalSemanticEmbedding,
    seeds: [Seed]
  ) async throws -> ScreenMemoryArchive {
    let analyzer = ScriptedAnalyzer(
      steps: seeds.enumerated().map { index, seed in
        // Spread hashes widely so distinct frames never dedup by perceptual hash.
        (hash: 0x9E37_79B9_7F4A_7C15 &* UInt64(index + 1), ocr: seed.ocr)
      }
    )
    let ids = seeds.map { UUID(uuidString: $0.id)! }
    let idFactory = FixtureSequentialIDs(ids: ids)
    let archive = try ScreenMemoryArchive(
      profile: try ScreenMemoryProfile(userID: "semantic-user", rootURL: temporaryDirectory()),
      imageAnalyzer: analyzer,
      idFactory: { idFactory.next() },
      semanticEmbedder: embedder
    )
    for seed in seeds {
      _ = try await archive.ingest(
        ScreenMemoryCaptureInput(
          userID: archive.userID,
          imageData: Data([UInt8.random(in: 0 ... 255)]),
          capturedAt: seed.capturedAt,
          appBundleID: "com.intentive.fixture",
          appName: "Fixture",
          windowTitle: seed.windowTitle
        )
      )
    }
    return archive
  }

  private func temporaryDirectory() throws -> URL {
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("ScreenMemorySemanticSearchTests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }
}

/// Maps text into a tiny concept space so tests can assert semantic recall
/// without depending on the OS language model.
private struct ConceptSemanticEmbedder: LocalSemanticEmbedding {
  var identifier: String { "concept-test-v1" }
  var isAvailable: Bool { true }

  private static let concepts: [String: [String]] = [
    "orchestration": ["kubernetes", "k8s", "pods", "pod", "autoscaling", "scaling", "replica", "deployment", "rollout", "cluster", "set"],
    "payments": ["stripe", "invoice", "billing", "subscription", "payment", "charge"],
    "design": ["figma", "mockup", "layout", "color", "canvas"],
  ]

  func embed(_ text: String) -> [Float]? {
    let tokens = Set(text.lowercased().split { !$0.isLetter && !$0.isNumber }.map(String.init))
    var vector = [Float](repeating: 0, count: Self.conceptOrder.count)
    for (index, concept) in Self.conceptOrder.enumerated() {
      let keywords = Self.concepts[concept] ?? []
      vector[index] = Float(keywords.filter(tokens.contains).count)
    }
    let magnitude = sqrt(vector.reduce(Float(0)) { $0 + $1 * $1 })
    guard magnitude > 0 else { return nil }
    return vector.map { $0 / magnitude }
  }

  private static let conceptOrder = concepts.keys.sorted()
}

private struct DegradedSemanticEmbedder: LocalSemanticEmbedding {
  var identifier: String { "degraded" }
  var isAvailable: Bool { false }
  func embed(_ text: String) -> [Float]? { nil }
}

private final class FixtureSequentialIDs: @unchecked Sendable {
  private let lock = NSLock()
  private var ids: [UUID]
  init(ids: [UUID]) { self.ids = ids }
  func next() -> UUID { lock.withLock { ids.removeFirst() } }
}

private final class ScriptedAnalyzer: ScreenMemoryImageAnalyzing, @unchecked Sendable {
  private let lock = NSLock()
  private var steps: [(hash: UInt64, ocr: String)]
  private var cursor = 0

  init(steps: [(hash: UInt64, ocr: String)]) { self.steps = steps }

  func perceptualHash(imageData: Data) throws -> UInt64 {
    lock.withLock { cursor < steps.count ? steps[cursor].hash : 0 }
  }

  func recognizeText(imageData: Data) async throws -> ScreenMemoryOCRResult {
    lock.withLock {
      guard cursor < steps.count else { return ScreenMemoryOCRResult(fullText: "", blocks: []) }
      let ocr = steps[cursor].ocr
      cursor += 1
      return ScreenMemoryOCRResult(fullText: ocr, blocks: [])
    }
  }
}
