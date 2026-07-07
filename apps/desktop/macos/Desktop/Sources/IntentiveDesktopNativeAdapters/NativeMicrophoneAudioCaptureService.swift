import AVFoundation
import Foundation
import IntentiveDesktopCore

public enum NativeMicrophoneAudioCaptureError: Error, Equatable, LocalizedError {
  case microphonePermissionDenied
  case inputUnavailable
  case conversionUnavailable
  case conversionFailed(String)
  case noAudioCaptured

  public var errorDescription: String? {
    switch self {
    case .microphonePermissionDenied:
      return "Microphone permission is required for push-to-talk."
    case .inputUnavailable:
      return "No microphone input is available."
    case .conversionUnavailable:
      return "The microphone input could not be converted to 16 kHz mono PCM."
    case .conversionFailed(let message):
      return "Microphone audio conversion failed: \(message)"
    case .noAudioCaptured:
      return "No microphone audio was captured."
    }
  }
}

public final class NativeMicrophoneAudioCaptureService: AudioCaptureService {
  private let captureDuration: TimeInterval

  public init(captureDuration: TimeInterval = 5.0) {
    self.captureDuration = captureDuration
  }

  public func capturePushToTalkAudio() async throws -> Data {
    let status = AVCaptureDevice.authorizationStatus(for: .audio)
    if status == .notDetermined {
      let granted = await AVCaptureDevice.requestAccess(for: .audio)
      guard granted else { throw NativeMicrophoneAudioCaptureError.microphonePermissionDenied }
    } else {
      guard status == .authorized else {
        throw NativeMicrophoneAudioCaptureError.microphonePermissionDenied
      }
    }

    return try await MicrophoneCaptureRun(duration: captureDuration).start()
  }

  static func pcm16kMonoData(
    from buffer: AVAudioPCMBuffer,
    converter: AVAudioConverter,
    targetFormat: AVAudioFormat
  ) throws -> Data {
    let ratio = targetFormat.sampleRate / buffer.format.sampleRate
    let frameCapacity = AVAudioFrameCount(max(1, ceil(Double(buffer.frameLength) * ratio) + 32))
    guard let output = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: frameCapacity) else {
      throw NativeMicrophoneAudioCaptureError.conversionUnavailable
    }

    var didProvideInput = false
    var conversionError: NSError?
    let status = converter.convert(to: output, error: &conversionError) { _, outStatus in
      if didProvideInput {
        outStatus.pointee = .noDataNow
        return nil
      }
      didProvideInput = true
      outStatus.pointee = .haveData
      return buffer
    }

    if status == .error {
      throw NativeMicrophoneAudioCaptureError.conversionFailed(
        conversionError?.localizedDescription ?? "unknown error"
      )
    }
    return encodePCM16LE(fromMonoFloat32: output)
  }

  static func encodePCM16LE(fromMonoFloat32 buffer: AVAudioPCMBuffer) -> Data {
    guard let channel = buffer.floatChannelData?[0] else { return Data() }
    let frameLength = Int(buffer.frameLength)
    var data = Data(capacity: frameLength * 2)

    for index in 0..<frameLength {
      let clamped = min(1.0, max(-1.0, channel[index]))
      var sample = Int16((clamped * Float(Int16.max)).rounded()).littleEndian
      withUnsafeBytes(of: &sample) { data.append(contentsOf: $0) }
    }
    return data
  }
}

public final class NativePushToTalkAudioRecorder {
  private var run: ManualMicrophoneCaptureRun?

  public init() {}

  public func start() async throws {
    let status = AVCaptureDevice.authorizationStatus(for: .audio)
    if status == .notDetermined {
      let granted = await AVCaptureDevice.requestAccess(for: .audio)
      guard granted else { throw NativeMicrophoneAudioCaptureError.microphonePermissionDenied }
    } else {
      guard status == .authorized else {
        throw NativeMicrophoneAudioCaptureError.microphonePermissionDenied
      }
    }

    let next = ManualMicrophoneCaptureRun()
    try next.start()
    run = next
  }

  public func stop() throws -> Data {
    guard let run else {
      throw NativeMicrophoneAudioCaptureError.noAudioCaptured
    }
    self.run = nil
    return try run.stop()
  }

  public func cancel() {
    run?.cancel()
    run = nil
  }
}

private final class MicrophoneCaptureRun {
  private let duration: TimeInterval
  private let engine = AVAudioEngine()
  private let lock = NSLock()
  private var continuation: CheckedContinuation<Data, Error>?
  private var completed = false
  private var captured = Data()

  init(duration: TimeInterval) {
    self.duration = duration
  }

  func start() async throws -> Data {
    try await withCheckedThrowingContinuation { continuation in
      self.continuation = continuation
      do {
        try startEngine()
      } catch {
        complete(.failure(error))
      }
    }
  }

  private func startEngine() throws {
    let input = engine.inputNode
    let inputFormat = input.outputFormat(forBus: 0)
    guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
      throw NativeMicrophoneAudioCaptureError.inputUnavailable
    }
    guard
      let targetFormat = AVAudioFormat(
        commonFormat: .pcmFormatFloat32,
        sampleRate: 16_000,
        channels: 1,
        interleaved: false
      ),
      let converter = AVAudioConverter(from: inputFormat, to: targetFormat)
    else {
      throw NativeMicrophoneAudioCaptureError.conversionUnavailable
    }

    input.installTap(onBus: 0, bufferSize: 1_024, format: inputFormat) { [weak self] buffer, _ in
      guard let self else { return }
      do {
        let data = try NativeMicrophoneAudioCaptureService.pcm16kMonoData(
          from: buffer,
          converter: converter,
          targetFormat: targetFormat
        )
        append(data)
      } catch {
        complete(.failure(error))
      }
    }

    do {
      try engine.start()
    } catch {
      input.removeTap(onBus: 0)
      throw error
    }

    Task { [weak self] in
      guard let self else { return }
      try? await Task.sleep(nanoseconds: UInt64(max(0.1, duration) * 1_000_000_000))
      finish()
    }
  }

  private func append(_ data: Data) {
    guard !data.isEmpty else { return }
    lock.lock()
    if !completed {
      captured.append(data)
    }
    lock.unlock()
  }

  private func finish() {
    lock.lock()
    let data = captured
    lock.unlock()

    guard !data.isEmpty else {
      complete(.failure(NativeMicrophoneAudioCaptureError.noAudioCaptured))
      return
    }
    complete(.success(data))
  }

  private func complete(_ result: Result<Data, Error>) {
    lock.lock()
    guard !completed else {
      lock.unlock()
      return
    }
    completed = true
    let continuation = continuation
    self.continuation = nil
    lock.unlock()

    engine.inputNode.removeTap(onBus: 0)
    engine.stop()

    switch result {
    case .success(let data):
      continuation?.resume(returning: data)
    case .failure(let error):
      continuation?.resume(throwing: error)
    }
  }
}

private final class ManualMicrophoneCaptureRun {
  private let engine = AVAudioEngine()
  private let lock = NSLock()
  private var completed = false
  private var captured = Data()

  func start() throws {
    let input = engine.inputNode
    let inputFormat = input.outputFormat(forBus: 0)
    guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
      throw NativeMicrophoneAudioCaptureError.inputUnavailable
    }
    guard
      let targetFormat = AVAudioFormat(
        commonFormat: .pcmFormatFloat32,
        sampleRate: 16_000,
        channels: 1,
        interleaved: false
      ),
      let converter = AVAudioConverter(from: inputFormat, to: targetFormat)
    else {
      throw NativeMicrophoneAudioCaptureError.conversionUnavailable
    }

    input.installTap(onBus: 0, bufferSize: 1_024, format: inputFormat) { [weak self] buffer, _ in
      guard let self else { return }
      do {
        let data = try NativeMicrophoneAudioCaptureService.pcm16kMonoData(
          from: buffer,
          converter: converter,
          targetFormat: targetFormat
        )
        append(data)
      } catch {
        cancel()
      }
    }

    do {
      try engine.start()
    } catch {
      input.removeTap(onBus: 0)
      throw error
    }
  }

  func stop() throws -> Data {
    let data = finish()
    guard !data.isEmpty else {
      throw NativeMicrophoneAudioCaptureError.noAudioCaptured
    }
    return data
  }

  func cancel() {
    _ = finish()
  }

  private func append(_ data: Data) {
    guard !data.isEmpty else { return }
    lock.lock()
    if !completed {
      captured.append(data)
    }
    lock.unlock()
  }

  private func finish() -> Data {
    lock.lock()
    guard !completed else {
      let data = captured
      lock.unlock()
      return data
    }
    completed = true
    let data = captured
    lock.unlock()

    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    return data
  }
}
