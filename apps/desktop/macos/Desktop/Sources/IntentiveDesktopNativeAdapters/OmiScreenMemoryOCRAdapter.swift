import AppKit
import CoreGraphics
import Foundation
import IntentiveDesktopCore
import Vision

/// Intentive's native Screen Memory OCR boundary, surgically adapted from
/// Omi's `RewindOCRService` recognition and perceptual-deduplication behavior.
public struct OmiScreenMemoryOCRAdapter: ScreenMemoryImageAnalyzing {
  public static let recognitionLevel = VNRequestTextRecognitionLevel.accurate
  public static let usesLanguageCorrection = true
  public static let recognitionLanguages = ["en-US"]
  public static let duplicateThreshold = ScreenMemoryArchive.perceptualDuplicateThreshold

  public init() {}

  public func perceptualHash(imageData: Data) throws -> UInt64 {
    Self.dHash(of: try Self.capturedImage(from: imageData))
  }

  public func recognizeText(imageData: Data) async throws -> ScreenMemoryOCRResult {
    try await Task.detached(priority: .userInitiated) {
      let image = try Self.capturedImage(from: imageData)
      return try await Self.extractTextWithBounds(from: image)
    }.value
  }

  private static func capturedImage(from imageData: Data) throws -> CGImage {
    guard let nsImage = NSImage(data: imageData) else {
      throw OmiScreenMemoryOCRAdapterError.invalidImage
    }
    var rect = NSRect(origin: .zero, size: nsImage.size)
    guard let image = nsImage.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
      throw OmiScreenMemoryOCRAdapterError.invalidImage
    }
    return image
  }

  /// Omi's 9x8 grayscale difference hash. Adjacent horizontal pixels produce
  /// one bit each, yielding a stable 64-bit perceptual fingerprint.
  public static func dHash(of image: CGImage) -> UInt64 {
    let width = 9
    let height = 8
    guard
      let context = CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width,
        space: CGColorSpaceCreateDeviceGray(),
        bitmapInfo: CGImageAlphaInfo.none.rawValue
      )
    else {
      return 0
    }

    context.interpolationQuality = .low
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    guard let data = context.data else { return 0 }
    let pixels = data.assumingMemoryBound(to: UInt8.self)

    var hash: UInt64 = 0
    for row in 0..<height {
      for column in 0..<(width - 1) {
        let index = row * width + column
        if pixels[index] > pixels[index + 1] {
          hash |= 1 << (row * (width - 1) + column)
        }
      }
    }
    return hash
  }

  private static func extractTextWithBounds(from image: CGImage) async throws -> ScreenMemoryOCRResult {
    try await withCheckedThrowingContinuation { continuation in
      let request = VNRecognizeTextRequest { request, error in
        if let error {
          continuation.resume(
            throwing: OmiScreenMemoryOCRAdapterError.ocrFailed(error.localizedDescription)
          )
          return
        }

        let observations = Array((request.results as? [VNRecognizedTextObservation]) ?? [])
        var blocks: [ScreenMemoryOCRBlock] = []
        var lines: [String] = []
        for observation in observations {
          guard let candidate = observation.topCandidates(1).first else { continue }
          let bounds = observation.boundingBox
          guard
            bounds.origin.x.isFinite,
            bounds.origin.y.isFinite,
            bounds.width.isFinite,
            bounds.height.isFinite
          else {
            continue
          }
          blocks.append(
            ScreenMemoryOCRBlock(
              text: candidate.string,
              x: Self.rounded(Double(bounds.origin.x)),
              y: Self.rounded(Double(bounds.origin.y)),
              width: Self.rounded(Double(bounds.width)),
              height: Self.rounded(Double(bounds.height)),
              confidence: Self.rounded(Double(candidate.confidence))
            )
          )
          lines.append(candidate.string)
        }
        continuation.resume(
          returning: ScreenMemoryOCRResult(fullText: lines.joined(separator: "\n"), blocks: blocks)
        )
      }

      request.recognitionLevel = Self.recognitionLevel
      request.usesLanguageCorrection = Self.usesLanguageCorrection
      request.recognitionLanguages = Self.recognitionLanguages

      do {
        try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
      } catch {
        continuation.resume(
          throwing: OmiScreenMemoryOCRAdapterError.ocrFailed(error.localizedDescription)
        )
      }
    }
  }

  private static func rounded(_ value: Double) -> Double {
    (value * 1_000).rounded() / 1_000
  }
}

public enum OmiScreenMemoryOCRAdapterError: Error, Equatable, LocalizedError {
  case invalidImage
  case ocrFailed(String)

  public var errorDescription: String? {
    switch self {
    case .invalidImage:
      return "Screen Memory OCR received an invalid captured image."
    case .ocrFailed(let message):
      return "Screen Memory OCR failed: \(message)"
    }
  }
}
