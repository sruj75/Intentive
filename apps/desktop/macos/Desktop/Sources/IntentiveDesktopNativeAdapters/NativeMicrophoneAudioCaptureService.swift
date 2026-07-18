import AVFoundation
import CoreAudio
import Foundation
import IntentiveDesktopCore

public enum NativeMicrophoneAudioCaptureError: Error, Equatable, LocalizedError {
  case microphonePermissionDenied
  case inputUnavailable
  case conversionUnavailable
  case conversionFailed(String)
  case ioProcCreationFailed(OSStatus)
  case deviceStartFailed(OSStatus)

  public var errorDescription: String? {
    switch self {
    case .microphonePermissionDenied: return "Microphone permission is required for passive audio sensing."
    case .inputUnavailable: return "No microphone input is available."
    case .conversionUnavailable: return "The microphone input could not be converted to 16 kHz mono PCM."
    case .conversionFailed(let message): return "Microphone audio conversion failed: \(message)"
    case .ioProcCreationFailed(let status): return "Microphone IOProc creation failed: \(status)"
    case .deviceStartFailed(let status): return "Microphone device start failed: \(status)"
    }
  }
}

/// Continuous CoreAudio microphone source renovated from Omi's
/// `AudioCaptureService`. It uses the default input device's IOProc rather than
/// periodically creating AVAudioEngine taps.
public final class NativeMicrophoneAudioCaptureService: @unchecked Sendable,
  PassiveAudioStreamingSource
{
  private let queue = DispatchQueue(label: "com.intentive.passive-audio.microphone")
  private let lock = NSLock()
  private var deviceID = kAudioObjectUnknown
  private var ioProcID: AudioDeviceIOProcID?
  private var converter: AVAudioConverter?
  private var inputFormat: AVAudioFormat?
  private var targetFormat: AVAudioFormat?
  private var handler: (@Sendable (Data) -> Void)?
  private var running = false

  public init() {}

  public var isRunning: Bool { lock.withLock { running } }

  public func start(onPCM16k: @escaping @Sendable (Data) -> Void) async throws {
    let status = AVCaptureDevice.authorizationStatus(for: .audio)
    guard status == .authorized else { throw NativeMicrophoneAudioCaptureError.microphonePermissionDenied }
    if isRunning { return }
    try await withCheckedThrowingContinuation { continuation in
      queue.async { [weak self] in
        guard let self else { continuation.resume(); return }
        do { try self.startOnQueue(handler: onPCM16k); continuation.resume() }
        catch { continuation.resume(throwing: error) }
      }
    }
  }

  public func stop() {
    let snapshot: (AudioObjectID, AudioDeviceIOProcID?) = lock.withLock {
      let result = (deviceID, ioProcID)
      deviceID = kAudioObjectUnknown
      ioProcID = nil
      handler = nil
      converter = nil
      inputFormat = nil
      targetFormat = nil
      running = false
      return result
    }
    queue.async {
      if let proc = snapshot.1, snapshot.0 != kAudioObjectUnknown {
        AudioDeviceStop(snapshot.0, proc)
        AudioDeviceDestroyIOProcID(snapshot.0, proc)
      }
    }
  }

  public func clearPendingBuffers() { converter?.reset() }

  private func startOnQueue(handler: @escaping @Sendable (Data) -> Void) throws {
    var inputDevice = kAudioObjectUnknown
    var size = UInt32(MemoryLayout<AudioObjectID>.size)
    var address = AudioObjectPropertyAddress(
      mSelector: kAudioHardwarePropertyDefaultInputDevice,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )
    guard AudioObjectGetPropertyData(
      AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &inputDevice) == noErr,
      inputDevice != kAudioObjectUnknown
    else { throw NativeMicrophoneAudioCaptureError.inputUnavailable }

    var stream = AudioStreamBasicDescription()
    size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
    address = AudioObjectPropertyAddress(
      mSelector: kAudioDevicePropertyStreamFormat,
      mScope: kAudioDevicePropertyScopeInput,
      mElement: kAudioObjectPropertyElementMain
    )
    guard AudioObjectGetPropertyData(inputDevice, &address, 0, nil, &size, &stream) == noErr,
      let sourceFormat = AVAudioFormat(streamDescription: &stream),
      let destination = AVAudioFormat(
        commonFormat: .pcmFormatFloat32, sampleRate: 16_000, channels: 1, interleaved: false),
      let converter = AVAudioConverter(from: sourceFormat, to: destination)
    else { throw NativeMicrophoneAudioCaptureError.conversionUnavailable }

    var proc: AudioDeviceIOProcID?
    let createStatus = AudioDeviceCreateIOProcIDWithBlock(&proc, inputDevice, queue) {
      [weak self] _, input, _, _, _ in self?.handle(input)
    }
    guard createStatus == noErr, let proc else {
      throw NativeMicrophoneAudioCaptureError.ioProcCreationFailed(createStatus)
    }
    let startStatus = AudioDeviceStart(inputDevice, proc)
    guard startStatus == noErr else {
      AudioDeviceDestroyIOProcID(inputDevice, proc)
      throw NativeMicrophoneAudioCaptureError.deviceStartFailed(startStatus)
    }
    lock.withLock {
      deviceID = inputDevice
      ioProcID = proc
      self.converter = converter
      inputFormat = sourceFormat
      targetFormat = destination
      self.handler = handler
      running = true
    }
  }

  private func handle(_ input: UnsafePointer<AudioBufferList>?) {
    guard let input else { return }
    let snapshot = lock.withLock { (running, inputFormat, converter, targetFormat, handler) }
    guard snapshot.0, let source = snapshot.1, let converter = snapshot.2,
      let target = snapshot.3, let handler = snapshot.4 else { return }
    let buffers = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: input))
    guard let first = buffers.first, first.mDataByteSize > 0 else { return }
    let bytesPerFrame = max(1, Int(source.streamDescription.pointee.mBytesPerFrame))
    let frames = AVAudioFrameCount(Int(first.mDataByteSize) / bytesPerFrame)
    guard frames > 0, let sourceBuffer = AVAudioPCMBuffer(pcmFormat: source, frameCapacity: frames)
    else { return }
    sourceBuffer.frameLength = frames
    let destinationBuffers = UnsafeMutableAudioBufferListPointer(sourceBuffer.mutableAudioBufferList)
    for (index, destination) in destinationBuffers.enumerated() where index < buffers.count {
      guard let src = buffers[index].mData, let dst = destination.mData else { continue }
      memcpy(dst, src, min(Int(destination.mDataByteSize), Int(buffers[index].mDataByteSize)))
    }
    if let data = try? Self.pcm16kMonoData(from: sourceBuffer, converter: converter, targetFormat: target),
      !data.isEmpty { handler(data) }
  }

  public static func pcm16kMonoData(
    from buffer: AVAudioPCMBuffer,
    converter: AVAudioConverter,
    targetFormat: AVAudioFormat
  ) throws -> Data {
    let capacity = AVAudioFrameCount(max(1, ceil(Double(buffer.frameLength) * targetFormat.sampleRate / buffer.format.sampleRate) + 32))
    guard let output = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: capacity) else {
      throw NativeMicrophoneAudioCaptureError.conversionUnavailable
    }
    var supplied = false
    var error: NSError?
    let status = converter.convert(to: output, error: &error) { _, outStatus in
      if supplied { outStatus.pointee = .noDataNow; return nil }
      supplied = true; outStatus.pointee = .haveData; return buffer
    }
    guard status != .error else {
      throw NativeMicrophoneAudioCaptureError.conversionFailed(error?.localizedDescription ?? "unknown error")
    }
    return encodePCM16LE(fromMonoFloat32: output)
  }

  public static func encodePCM16LE(fromMonoFloat32 buffer: AVAudioPCMBuffer) -> Data {
    guard let channel = buffer.floatChannelData?[0] else { return Data() }
    var data = Data(capacity: Int(buffer.frameLength) * 2)
    for index in 0..<Int(buffer.frameLength) {
      var sample = Int16((min(1, max(-1, channel[index])) * Float(Int16.max)).rounded()).littleEndian
      withUnsafeBytes(of: &sample) { data.append(contentsOf: $0) }
    }
    return data
  }
}

private extension NSLock {
  func withLock<T>(_ body: () -> T) -> T { lock(); defer { unlock() }; return body() }
}
