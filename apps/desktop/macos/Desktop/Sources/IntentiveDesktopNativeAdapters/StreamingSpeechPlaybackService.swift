@preconcurrency import AVFoundation
import CoreAudio
import Foundation
import IntentiveDesktopCore

public struct RunAnywhereSpeechSynthesizer: SpeechSynthesizer {
  private let client: any RunAnywhereVoiceClient

  public init(client: any RunAnywhereVoiceClient = DefaultRunAnywhereVoiceClient()) {
    self.client = client
  }

  public func synthesize(_ text: String) -> AsyncThrowingStream<Data, Error> {
    client.synthesize(text)
  }
}

@MainActor
public final class StreamingSpeechPlaybackService {
  private let synthesizer: any SpeechSynthesizer
  private let player: StreamingPCMPlayer
  private var task: Task<Void, Never>?
  private var pendingPlaybackFinish: (() -> Void)?
  private var hasScheduledPlayback = false

  public init(
    synthesizer: any SpeechSynthesizer,
    sampleRate: Double = 22_050
  ) {
    self.synthesizer = synthesizer
    player = StreamingPCMPlayer(sampleRate: sampleRate)
    player.onPlaybackScheduled = { [weak self] _ in
      self?.hasScheduledPlayback = true
    }
    player.onPlaybackIdle = { [weak self] _ in
      self?.finishPlayback()
    }
  }

  deinit {
    task?.cancel()
  }

  public func speak(_ text: String, onFinished: (() -> Void)? = nil) {
    stop()
    pendingPlaybackFinish = onFinished
    task = Task { [weak self, synthesizer] in
      do {
        for try await chunk in synthesizer.synthesize(text) {
          try Task.checkCancellation()
          self?.enqueue(chunk)
        }
      } catch is CancellationError {
      } catch {
      }
      self?.finishSynthesis()
    }
  }

  public func stop() {
    task?.cancel()
    task = nil
    pendingPlaybackFinish = nil
    hasScheduledPlayback = false
    player.stop()
  }

  private func enqueue(_ chunk: Data) {
    _ = player.enqueueFloat32PCM(chunk)
  }

  private func finishSynthesis() {
    task = nil
    if !hasScheduledPlayback {
      finishPlayback()
    }
  }

  private func finishPlayback() {
    hasScheduledPlayback = false
    let onFinished = pendingPlaybackFinish
    pendingPlaybackFinish = nil
    onFinished?()
  }
}

final class StreamingPCMPlaybackQueue<Buffer: AnyObject> {
  private(set) var scheduledBuffers: [Buffer] = []
  private(set) var generation = 0

  var isEmpty: Bool { scheduledBuffers.isEmpty }

  @discardableResult
  func appendScheduled(_ buffer: Buffer) -> Int {
    scheduledBuffers.append(buffer)
    return generation
  }

  @discardableResult
  func markPlayed(_ buffer: Buffer, generation completionGeneration: Int) -> Bool {
    guard completionGeneration == generation else { return false }
    if let index = scheduledBuffers.firstIndex(where: { $0 === buffer }) {
      scheduledBuffers.remove(at: index)
      return true
    }
    return false
  }

  func buffersToReplayAfterConfigurationChange() -> [Buffer] {
    let buffers = scheduledBuffers
    generation += 1
    scheduledBuffers.removeAll()
    return buffers
  }

  func clearForExplicitStop() {
    generation += 1
    scheduledBuffers.removeAll()
  }
}

@MainActor
final class StreamingPCMPlayer {
  private let engine = AVAudioEngine()
  private let player = AVAudioPlayerNode()
  private let format: AVAudioFormat
  private var configObserver: NSObjectProtocol?
  private let playbackQueue = StreamingPCMPlaybackQueue<AVAudioPCMBuffer>()
  private(set) var playbackEpoch = 0
  var onPlaybackScheduled: ((Int) -> Void)?
  var onPlaybackIdle: ((Int) -> Void)?

  init(sampleRate: Double = 22_050) {
    format = AVAudioFormat(
      commonFormat: .pcmFormatFloat32,
      sampleRate: sampleRate,
      channels: 1,
      interleaved: false
    )!
    engine.attach(player)
    engine.connect(player, to: engine.mainMixerNode, format: format)
    configObserver = NotificationCenter.default.addObserver(
      forName: .AVAudioEngineConfigurationChange,
      object: engine,
      queue: .main
    ) { [weak self] _ in
      Task { @MainActor in
        guard let self else { return }
        let buffersToReplay = self.playbackQueue.buffersToReplayAfterConfigurationChange()
        self.player.stop()
        self.engine.stop()
        self.engine.disconnectNodeOutput(self.player)
        self.engine.connect(self.player, to: self.engine.mainMixerNode, format: self.format)
        _ = self.ensureRunning()
        for buffer in buffersToReplay {
          self.schedule(buffer)
        }
      }
    }
  }

  deinit {
    if let configObserver {
      NotificationCenter.default.removeObserver(configObserver)
    }
  }

  @discardableResult
  func enqueueFloat32PCM(_ data: Data) -> Bool {
    let sampleCount = data.count / 4
    guard sampleCount > 0,
      let buffer = AVAudioPCMBuffer(
        pcmFormat: format,
        frameCapacity: AVAudioFrameCount(sampleCount)
      )
    else { return false }

    buffer.frameLength = AVAudioFrameCount(sampleCount)
    let channel = buffer.floatChannelData![0]
    data.withUnsafeBytes { raw in
      for index in 0..<sampleCount {
        let offset = index * 4
        let bits = UInt32(raw[offset])
          | (UInt32(raw[offset + 1]) << 8)
          | (UInt32(raw[offset + 2]) << 16)
          | (UInt32(raw[offset + 3]) << 24)
        channel[index] = min(1.0, max(-1.0, Float32(bitPattern: bits)))
      }
    }

    guard ensureRunning() else { return false }
    schedule(buffer)
    return true
  }

  @discardableResult
  func enqueuePCM16LE(_ data: Data) -> Bool {
    let sampleCount = data.count / 2
    guard sampleCount > 0 else { return false }
    var floatData = Data(capacity: sampleCount * 4)
    data.withUnsafeBytes { raw in
      for index in 0..<sampleCount {
        let low = UInt16(raw[index * 2])
        let high = UInt16(raw[index * 2 + 1]) << 8
        let pcm = Int16(bitPattern: high | low)
        var value = (Float32(pcm) / 32_768.0).bitPattern.littleEndian
        withUnsafeBytes(of: &value) { floatData.append(contentsOf: $0) }
      }
    }
    return enqueueFloat32PCM(floatData)
  }

  func stop() {
    playbackEpoch += 1
    playbackQueue.clearForExplicitStop()
    player.stop()
    engine.stop()
  }

  private func ensureRunning() -> Bool {
    if !engine.isRunning {
      engine.prepare()
      do {
        try engine.start()
      } catch {
        return false
      }
    }
    if !player.isPlaying {
      player.play()
    }
    return player.isPlaying
  }

  private func schedule(_ buffer: AVAudioPCMBuffer) {
    playbackEpoch += 1
    let scheduledPlaybackEpoch = playbackEpoch
    onPlaybackScheduled?(scheduledPlaybackEpoch)
    let generation = playbackQueue.appendScheduled(buffer)
    player.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self, weak buffer] _ in
      Task { @MainActor in
        guard let self, let buffer else { return }
        let didMarkPlayed = self.playbackQueue.markPlayed(buffer, generation: generation)
        if didMarkPlayed, self.playbackQueue.isEmpty {
          self.onPlaybackIdle?(scheduledPlaybackEpoch)
        }
      }
    }
  }
}

@MainActor
public final class SystemAudioMuteController {
  public static let shared = SystemAudioMuteController()

  private var mutedDevice: AudioDeviceID?
  private var restoreVolumes: [(channel: UInt32, value: Float32)] = []
  private var usedVolumeFallback = false

  private init() {}

  public func muteForSpeechCapture() {
    guard mutedDevice == nil else { return }
    guard let device = Self.defaultOutputDevice() else { return }
    guard Self.isDeviceRunningSomewhere(device) else { return }
    if Self.deviceIsMuted(device) == true { return }

    if Self.setMute(device, muted: true) {
      mutedDevice = device
      usedVolumeFallback = false
      return
    }

    let saved = Self.zeroVolume(device)
    if !saved.isEmpty {
      restoreVolumes = saved
      mutedDevice = device
      usedVolumeFallback = true
    }
  }

  public func restoreAfterSpeechCapture() {
    guard let device = mutedDevice else { return }
    if usedVolumeFallback {
      for volume in restoreVolumes {
        _ = Self.setVolume(device, channel: volume.channel, value: volume.value)
      }
    } else {
      _ = Self.setMute(device, muted: false)
    }
    mutedDevice = nil
    restoreVolumes = []
    usedVolumeFallback = false
  }

  private static func defaultOutputDevice() -> AudioDeviceID? {
    var address = AudioObjectPropertyAddress(
      mSelector: kAudioHardwarePropertyDefaultOutputDevice,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )
    var device = AudioDeviceID(0)
    var size = UInt32(MemoryLayout<AudioDeviceID>.size)
    let status = AudioObjectGetPropertyData(
      AudioObjectID(kAudioObjectSystemObject),
      &address,
      0,
      nil,
      &size,
      &device
    )
    guard status == noErr, device != 0 else { return nil }
    return device
  }

  private static func isDeviceRunningSomewhere(_ device: AudioDeviceID) -> Bool {
    var address = AudioObjectPropertyAddress(
      mSelector: kAudioDevicePropertyDeviceIsRunningSomewhere,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )
    var running = UInt32(0)
    var size = UInt32(MemoryLayout<UInt32>.size)
    let status = AudioObjectGetPropertyData(device, &address, 0, nil, &size, &running)
    return status == noErr && running != 0
  }

  private static func muteAddress() -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(
      mSelector: kAudioDevicePropertyMute,
      mScope: kAudioObjectPropertyScopeOutput,
      mElement: kAudioObjectPropertyElementMain
    )
  }

  private static func deviceIsMuted(_ device: AudioDeviceID) -> Bool? {
    var address = muteAddress()
    guard AudioObjectHasProperty(device, &address) else { return nil }
    var muted = UInt32(0)
    var size = UInt32(MemoryLayout<UInt32>.size)
    guard AudioObjectGetPropertyData(device, &address, 0, nil, &size, &muted) == noErr else { return nil }
    return muted != 0
  }

  @discardableResult
  private static func setMute(_ device: AudioDeviceID, muted: Bool) -> Bool {
    var address = muteAddress()
    var settable = DarwinBoolean(false)
    guard AudioObjectHasProperty(device, &address),
      AudioObjectIsPropertySettable(device, &address, &settable) == noErr,
      settable.boolValue
    else { return false }
    var value: UInt32 = muted ? 1 : 0
    let size = UInt32(MemoryLayout<UInt32>.size)
    return AudioObjectSetPropertyData(device, &address, 0, nil, size, &value) == noErr
  }

  private static func volumeAddress(_ channel: UInt32) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(
      mSelector: kAudioDevicePropertyVolumeScalar,
      mScope: kAudioObjectPropertyScopeOutput,
      mElement: channel
    )
  }

  private static func getVolume(_ device: AudioDeviceID, channel: UInt32) -> Float32? {
    var address = volumeAddress(channel)
    guard AudioObjectHasProperty(device, &address) else { return nil }
    var value = Float32(0)
    var size = UInt32(MemoryLayout<Float32>.size)
    guard AudioObjectGetPropertyData(device, &address, 0, nil, &size, &value) == noErr else { return nil }
    return value
  }

  @discardableResult
  private static func setVolume(_ device: AudioDeviceID, channel: UInt32, value: Float32) -> Bool {
    var address = volumeAddress(channel)
    var settable = DarwinBoolean(false)
    guard AudioObjectHasProperty(device, &address),
      AudioObjectIsPropertySettable(device, &address, &settable) == noErr,
      settable.boolValue
    else { return false }
    var nextValue = value
    let size = UInt32(MemoryLayout<Float32>.size)
    return AudioObjectSetPropertyData(device, &address, 0, nil, size, &nextValue) == noErr
  }

  private static func zeroVolume(_ device: AudioDeviceID) -> [(channel: UInt32, value: Float32)] {
    let main = kAudioObjectPropertyElementMain
    if let prior = getVolume(device, channel: main), setVolume(device, channel: main, value: 0) {
      return [(channel: main, value: prior)]
    }
    var saved: [(channel: UInt32, value: Float32)] = []
    for channel: UInt32 in [1, 2] {
      if let prior = getVolume(device, channel: channel), setVolume(device, channel: channel, value: 0) {
        saved.append((channel: channel, value: prior))
      }
    }
    return saved
  }
}
