import Accelerate
import Foundation
import NaturalLanguage

/// On-device semantic embedding for Screen Memory search.
///
/// Renovated from Omi's `OCREmbeddingService`/`EmbeddingService`, which embedded
/// concatenated OCR text and did disk-based vDSP cosine vector search. Omi called
/// Gemini in the cloud; Intentive's boundary keeps every frame and its text on the
/// Mac, so the cloud embedder is replaced by Apple `NaturalLanguage` behind this
/// seam. The vDSP cosine search, the `[app] title\nocr` embedding text, and the
/// pre-normalized-vector convention are preserved.
public protocol LocalSemanticEmbedding: Sendable {
  /// Stable identifier for the embedding space (diagnostics only; never synced).
  var identifier: String { get }
  /// Whether the underlying model is loaded and can produce vectors.
  var isAvailable: Bool { get }
  /// A unit-length vector for `text`, or `nil` when the model is unavailable or
  /// the text carries no embeddable signal.
  func embed(_ text: String) -> [Float]?
}

public extension LocalSemanticEmbedding {
  /// Prepend app context for better retrieval — Omi's `formatForEmbedding`.
  func formatForEmbedding(ocrText: String, appName: String, windowTitle: String?) -> String {
    var result = "[\(appName)]"
    if let title = windowTitle, !title.isEmpty {
      result += " \(title)"
    }
    result += "\n\(ocrText)"
    return result
  }
}

/// Cosine similarity via Accelerate vDSP. Vectors are pre-normalized so the dot
/// product is the cosine — the exact mechanism Omi used. Mismatched or empty
/// input scores `0` so "no signal" reads as "no relevance".
public func cosineSimilarity(_ lhs: [Float], _ rhs: [Float]) -> Float {
  guard lhs.count == rhs.count, !lhs.isEmpty else { return 0 }
  var dot: Float = 0
  vDSP_dotpr(lhs, 1, rhs, 1, &dot, vDSP_Length(lhs.count))
  return dot
}

/// Serialize a normalized vector to a BLOB, mirroring Omi's `floatsToData`.
public func semanticVectorData(_ floats: [Float]) -> Data {
  floats.withUnsafeBufferPointer { Data(buffer: $0) }
}

/// Decode a BLOB back into a vector, mirroring Omi's `dataToFloats`. Unlike Omi
/// it does not assume a fixed dimension — a model change simply yields a
/// non-matching length that cosine similarity scores as `0`.
public func semanticVector(from data: Data) -> [Float]? {
  guard !data.isEmpty, data.count % MemoryLayout<Float>.size == 0 else { return nil }
  return data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
}

/// Apple `NaturalLanguage` sentence embedding with a word-embedding fallback.
/// Fully on-device: no network, nothing leaves the Mac.
public struct AppleNaturalLanguageSemanticEmbedder: LocalSemanticEmbedding {
  private let sentenceEmbedding: NLEmbedding?
  private let wordEmbedding: NLEmbedding?

  public init(language: NLLanguage = .english) {
    sentenceEmbedding = NLEmbedding.sentenceEmbedding(for: language)
    wordEmbedding = NLEmbedding.wordEmbedding(for: language)
  }

  public var identifier: String { "apple-nl-sentence-v1" }

  public var isAvailable: Bool { sentenceEmbedding != nil || wordEmbedding != nil }

  public func embed(_ text: String) -> [Float]? {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    if let sentenceEmbedding, let vector = sentenceEmbedding.vector(for: trimmed) {
      return normalize(vector.map(Float.init))
    }
    return averagedWordVector(trimmed)
  }

  private func averagedWordVector(_ text: String) -> [Float]? {
    guard let wordEmbedding else { return nil }
    let tokens = text
      .lowercased()
      .split { !$0.isLetter && !$0.isNumber }
      .map(String.init)
    guard !tokens.isEmpty else { return nil }
    var accumulator: [Float] = []
    var matched = 0
    for token in tokens {
      guard let vector = wordEmbedding.vector(for: token) else { continue }
      if accumulator.isEmpty { accumulator = [Float](repeating: 0, count: vector.count) }
      for index in vector.indices { accumulator[index] += Float(vector[index]) }
      matched += 1
    }
    guard matched > 0 else { return nil }
    return normalize(accumulator.map { $0 / Float(matched) })
  }

  private func normalize(_ vector: [Float]) -> [Float]? {
    var magnitude: Float = 0
    vDSP_svesq(vector, 1, &magnitude, vDSP_Length(vector.count))
    guard magnitude > 0 else { return nil }
    var divisor = magnitude.squareRoot()
    var result = [Float](repeating: 0, count: vector.count)
    vDSP_vsdiv(vector, 1, &divisor, &result, 1, vDSP_Length(vector.count))
    return result
  }
}

/// A ranked Screen Memory search result. `matchedLexically` distinguishes an FTS
/// hit from a vector-only semantic recall, mirroring Omi's merge where FTS
/// results lead and above-threshold vector matches are appended. Local only.
public struct ScreenMemoryRankedResult: Equatable, Sendable {
  public let record: ScreenMemoryRecord
  public let matchedLexically: Bool
  public let semanticSimilarity: Float?

  public init(record: ScreenMemoryRecord, matchedLexically: Bool, semanticSimilarity: Float?) {
    self.record = record
    self.matchedLexically = matchedLexically
    self.semanticSimilarity = semanticSimilarity
  }

  public var recordID: ScreenMemoryRecordID? {
    UUID(uuidString: record.id).map(ScreenMemoryRecordID.init)
  }
}

/// Threshold above which a vector-only match is recalled — Omi's `> 0.5`.
public let screenMemorySemanticRecallThreshold: Float = 0.5
