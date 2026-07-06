import Foundation

public struct PTTSilentMicRecoveryPolicy: Sendable {
  public static let deadMicPeakThreshold = 5
  public static let minDeadTurnSeconds: TimeInterval = 0.25
  public static let consecutiveDeadTurnThreshold = 2

  public private(set) var consecutiveDeadMicTurns = 0

  public init() {}

  public mutating func recordDiscardedTurn(totalSec: TimeInterval, peak: Int) -> Bool {
    if totalSec >= Self.minDeadTurnSeconds && peak <= Self.deadMicPeakThreshold {
      consecutiveDeadMicTurns += 1
    } else {
      consecutiveDeadMicTurns = 0
    }
    return consecutiveDeadMicTurns >= Self.consecutiveDeadTurnThreshold
  }

  public mutating func recordSuccessfulTurn() {
    consecutiveDeadMicTurns = 0
  }

  public mutating func recordCaptureRebuild() {
    consecutiveDeadMicTurns = 0
  }
}

public protocol PushToTalkVADPredictor: AnyObject {
  func resetStates()
  func predict(_ samples: [Float]) -> Float
}

public enum PushToTalkTurnGate {
  public static let speechLikeRMSThreshold: Double = 260
  public static let maxSpeechZeroCrossingRate: Double = 0.24
  public static let minTurnAudioSeconds: Double = 0.35
  public static let minSpeechLikeSeconds: Double = 0.16

  public static func speechLikeAudioSeconds(
    pcm16k data: Data,
    rmsThreshold: Double = speechLikeRMSThreshold,
    maxZeroCrossingRate: Double = maxSpeechZeroCrossingRate
  ) -> (total: Double, speechLike: Double) {
    let samples = pcm16Samples(from: data)
    guard !samples.isEmpty else { return (0, 0) }

    let frameSamples = 320
    var speechLikeFrames = 0
    var i = 0
    while i + frameSamples <= samples.count {
      var sumSquares: Double = 0
      var zeroCrossings = 0
      var previous = Int(samples[i])
      for j in i..<(i + frameSamples) {
        let current = Int(samples[j])
        let sample = Double(current)
        sumSquares += sample * sample
        if j > i, (previous < 0 && current >= 0) || (previous >= 0 && current < 0) {
          zeroCrossings += 1
        }
        previous = current
      }
      let rms = (sumSquares / Double(frameSamples)).squareRoot()
      let zeroCrossingRate = Double(zeroCrossings) / Double(frameSamples - 1)
      if rms > rmsThreshold && zeroCrossingRate <= maxZeroCrossingRate {
        speechLikeFrames += 1
      }
      i += frameSamples
    }
    return (Double(samples.count) / 16_000.0, Double(speechLikeFrames) * 0.02)
  }

  public static func audioEnergy(pcm16k data: Data) -> (peak: Int, rms: Int) {
    let samples = pcm16Samples(from: data)
    guard !samples.isEmpty else { return (0, 0) }

    var peak = 0
    var sumSquares = 0.0
    for sample in samples {
      let value = Int(sample)
      peak = max(peak, abs(value))
      sumSquares += Double(value) * Double(value)
    }
    return (peak, Int((sumSquares / Double(samples.count)).squareRoot()))
  }

  public static func turnHasSpeech(pcm16k data: Data, vad: PushToTalkVADPredictor? = nil) -> Bool {
    let samples = pcm16Samples(from: data)
    guard Double(samples.count) / 16_000.0 >= minTurnAudioSeconds else { return false }

    let (total, speechLike) = speechLikeAudioSeconds(pcm16k: data)
    if total >= minTurnAudioSeconds && speechLike >= minSpeechLikeSeconds { return true }

    guard let vad, samples.count >= 512 else { return false }
    let floats = samples.map { Float($0) / 32_768.0 }

    vad.resetStates()
    var maxRun = 0
    var run = 0
    var speechFrames = 0
    var i = 0
    while i + 512 <= samples.count {
      let probability = vad.predict(Array(floats[i..<(i + 512)]))
      if probability > 0.4 {
        speechFrames += 1
        run += 1
        maxRun = max(maxRun, run)
      } else {
        run = 0
      }
      i += 512
    }
    return maxRun >= 3 || speechFrames >= 6
  }

  private static func pcm16Samples(from data: Data) -> [Int16] {
    let sampleCount = data.count / 2
    guard sampleCount > 0 else { return [] }

    return data.withUnsafeBytes { raw in
      var samples: [Int16] = []
      samples.reserveCapacity(sampleCount)
      for index in 0..<sampleCount {
        let low = UInt16(raw[index * 2])
        let high = UInt16(raw[index * 2 + 1]) << 8
        samples.append(Int16(bitPattern: high | low))
      }
      return samples
    }
  }
}
