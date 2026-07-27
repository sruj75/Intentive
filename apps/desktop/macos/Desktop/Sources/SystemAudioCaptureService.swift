import Foundation
import AVFoundation
import CoreAudio
import IntentiveDesktopCore

/// One logical Float32 buffer supplied by CoreAudio.
///
/// CoreAudio may supply all channels interleaved in one buffer or split channels
/// across multiple non-interleaved buffers. `channelCount` describes the layout
/// of this buffer's `samples`.
public struct SystemAudioFloat32Buffer: Sendable {
    public let samples: [Float32]
    public let channelCount: Int

    public init(samples: [Float32], channelCount: Int) {
        self.samples = samples
        self.channelCount = channelCount
    }
}

/// Normalizes CoreAudio's interleaved or non-interleaved Float32 buffers to mono.
public enum SystemAudioPCMDownmixer {
    public static func downmix(
        buffers: [SystemAudioFloat32Buffer],
        expectedChannelCount: Int
    ) -> [Float32]? {
        guard expectedChannelCount > 0, !buffers.isEmpty else { return nil }

        var frameCount: Int?
        var actualChannelCount = 0
        for buffer in buffers {
            guard buffer.channelCount > 0,
                  !buffer.samples.isEmpty,
                  buffer.samples.count.isMultiple(of: buffer.channelCount) else {
                return nil
            }

            let bufferFrameCount = buffer.samples.count / buffer.channelCount
            if let frameCount {
                guard bufferFrameCount == frameCount else { return nil }
            } else {
                frameCount = bufferFrameCount
            }
            actualChannelCount += buffer.channelCount
        }

        guard actualChannelCount == expectedChannelCount,
              let frameCount,
              frameCount > 0 else {
            return nil
        }

        var mono = [Float32](repeating: 0, count: frameCount)
        for buffer in buffers {
            for frame in 0..<frameCount {
                let frameStart = frame * buffer.channelCount
                for channel in 0..<buffer.channelCount {
                    mono[frame] += buffer.samples[frameStart + channel]
                }
            }
        }

        let divisor = Float32(actualChannelCount)
        for frame in mono.indices {
            mono[frame] /= divisor
        }
        return mono
    }
}

/// Service for capturing system audio using Core Audio Taps (macOS 14.4+)
/// Captures all system audio output and converts to 16-bit PCM at 16kHz for transcription
@available(macOS 14.4, *)
public class SystemAudioCaptureService: @unchecked Sendable {

    public init() {
        audioQueue.setSpecific(key: audioQueueKey, value: 1)
    }

    // MARK: - Types

    /// Callback for receiving audio chunks
    typealias AudioChunkHandler = (Data) -> Void

    /// Callback for receiving audio levels (0.0 - 1.0)
    typealias AudioLevelHandler = (Float) -> Void

    enum SystemAudioCaptureError: LocalizedError {
        case tapCreationFailed(OSStatus)
        case aggregateDeviceFailed(OSStatus)
        case ioProcCreationFailed(OSStatus)
        case deviceStartFailed(OSStatus)
        case formatError
        case converterCreationFailed
        case unsupportedOS

        var errorDescription: String? {
            switch self {
            case .tapCreationFailed(let status):
                return "Failed to create process tap: \(status)"
            case .aggregateDeviceFailed(let status):
                return "Failed to create aggregate device: \(status)"
            case .ioProcCreationFailed(let status):
                return "Failed to create IO proc: \(status)"
            case .deviceStartFailed(let status):
                return "Failed to start audio device: \(status)"
            case .formatError:
                return "Failed to get audio format"
            case .converterCreationFailed:
                return "Failed to create audio converter"
            case .unsupportedOS:
                return "System audio capture requires macOS 14.4 or later"
            }
        }
    }

    // MARK: - Properties

    private var tapID: AudioObjectID = kAudioObjectUnknown
    private var aggregateDeviceID: AudioObjectID = kAudioObjectUnknown
    private var ioProcID: AudioDeviceIOProcID?
    private var isCapturing = false
    private var onAudioChunk: AudioChunkHandler?
    private var onAudioLevel: AudioLevelHandler?
    private let stateLock = NSRecursiveLock()
    private var starting = false
    private var generation: UInt64 = 0

    /// Target sample rate for local transcription and Runtime voice turns.
    private let targetSampleRate: Double = 16000

    // Resampling
    private var audioConverter: AVAudioConverter?
    private var inputFormat: AVAudioFormat?
    private var targetFormat: AVAudioFormat?
    private var sourceSampleRate: Double = 0.0
    private var sourceChannelCount = 0

    // Tap UUID for identification
    private let tapUUID = UUID()

    /// Dedicated queue serializing CoreAudio device operations. Starts run
    /// asynchronously; stop waits on this queue so returning from `stop()` is
    /// the physical privacy boundary.
    private let audioQueue = DispatchQueue(label: "com.intentive.systemaudiocapture.device")
    private let audioQueueKey = DispatchSpecificKey<UInt8>()

    // MARK: - Permission Checking

    /// Check if system audio capture permission is available
    /// Note: Core Audio Taps don't have a preflight API like screen capture.
    /// Permission is granted implicitly on first use, or may require entitlements.
    static func checkPermission() -> Bool {
        // For Core Audio Taps, there's no explicit permission API.
        // The system will prompt when we first try to create a tap.
        // Return true to indicate we can attempt capture.
        return true
    }

    /// Request system audio capture permission
    /// Returns true if permission is available (macOS 14.4+)
    static func requestPermission() async -> Bool {
        // Core Audio Taps permission is handled at capture time
        return true
    }

    // MARK: - Public Methods

    /// Start capturing system audio
    /// - Parameters:
    ///   - onAudioChunk: Callback receiving 16-bit PCM audio data chunks at 16kHz mono
    ///   - onAudioLevel: Optional callback receiving normalized audio level (0.0 - 1.0)
    func startCapture(onAudioChunk: @escaping AudioChunkHandler, onAudioLevel: AudioLevelHandler? = nil) async throws {
        let startGeneration: UInt64? = stateLock.withLock {
            guard !isCapturing, !starting else { return nil }
            generation &+= 1
            starting = true
            return generation
        }
        guard let startGeneration else {
            log("SystemAudioCapture: Already capturing")
            return
        }

        // All CoreAudio HAL calls (CreateTap, CreateAggregateDevice, AudioDeviceStart) are
        // synchronous IPC to coreaudiod via mach_msg. After wake from sleep the daemon can
        // take seconds to respond, blocking the caller. Dispatch the entire setup to audioQueue,
        // mirroring the pattern already used in stopCapture().
        do {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                audioQueue.async { [weak self] in
                    guard let self else {
                        continuation.resume(throwing: CancellationError())
                        return
                    }
                    do {
                        try self.startCaptureOnQueue(
                            generation: startGeneration,
                            onAudioChunk: onAudioChunk,
                            onAudioLevel: onAudioLevel
                        )
                        continuation.resume()
                    } catch {
                        continuation.resume(throwing: error)
                    }
                }
            }
        } catch {
            stateLock.withLock {
                guard generation == startGeneration else { return }
                starting = false
            }
            throw error
        }
    }

    /// Performs all blocking CoreAudio HAL setup. Must be called on audioQueue, not the main thread.
    private func startCaptureOnQueue(
        generation startGeneration: UInt64,
        onAudioChunk: @escaping AudioChunkHandler,
        onAudioLevel: AudioLevelHandler?
    ) throws {
        // 1. Create tap description for all system audio
        let tapDescription = CATapDescription(stereoGlobalTapButExcludeProcesses: [])
        tapDescription.uuid = tapUUID
        tapDescription.name = "Intentive System Audio Tap"
        tapDescription.muteBehavior = .unmuted  // Don't mute playback

        // 2. Create the process tap
        var status = AudioHardwareCreateProcessTap(tapDescription, &tapID)
        guard status == noErr else {
            throw SystemAudioCaptureError.tapCreationFailed(status)
        }
        log("SystemAudioCapture: Created tap with ID \(tapID)")

        // 3. Create aggregate device with tap
        //
        // IMPORTANT: drift compensation is enabled per-tap via kAudioSubTapDriftCompensationKey.
        // Without it, the aggregate device's clock can drift relative to the real output device,
        // and the system resamples on every IO cycle to compensate. That resampling produces
        // periodic crackling/artifacts in *all* system audio playback (music, calls, etc.) even
        // though we're only reading from the tap. Enabling drift compensation tells CoreAudio
        // to reconcile clocks at the sub-tap level, eliminating the artifacts.
        // CoreAudio expects a CFNumber here ("non-zero value indicates that drift compensation
        // is enabled" — see <CoreAudio/AudioHardware.h>), not a CFBoolean.
        let aggregateDescription: [String: Any] = [
            kAudioAggregateDeviceNameKey as String: "Intentive System Audio Tap Device",
            kAudioAggregateDeviceUIDKey as String: "intentive.systemaudio.\(tapUUID.uuidString)",
            kAudioAggregateDeviceIsPrivateKey as String: true,
            kAudioAggregateDeviceTapListKey as String: [
                [
                    kAudioSubTapUIDKey as String: tapUUID.uuidString,
                    kAudioSubTapDriftCompensationKey as String: NSNumber(value: 1),
                    kAudioSubTapDriftCompensationQualityKey as String:
                        NSNumber(value: kAudioAggregateDriftCompensationMaxQuality),
                ]
            ],
            kAudioAggregateDeviceTapAutoStartKey as String: true
        ]

        status = AudioHardwareCreateAggregateDevice(aggregateDescription as CFDictionary, &aggregateDeviceID)
        guard status == noErr else {
            cleanupTap()
            throw SystemAudioCaptureError.aggregateDeviceFailed(status)
        }
        log("SystemAudioCapture: Created aggregate device with ID \(aggregateDeviceID)")

        // 4. Get audio format from the tap
        guard let format = getStreamFormat(for: aggregateDeviceID) else {
            cleanup()
            throw SystemAudioCaptureError.formatError
        }

        sourceSampleRate = format.mSampleRate
        sourceChannelCount = Int(format.mChannelsPerFrame)
        log("SystemAudioCapture: Source format - \(format.mSampleRate)Hz, \(format.mChannelsPerFrame) channels, \(format.mBitsPerChannel) bits")

        // 5. Normalize every CoreAudio layout to mono before sample-rate conversion.
        guard let inputFmt = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: format.mSampleRate,
            channels: 1,
            interleaved: false
        ) else {
            cleanup()
            throw SystemAudioCaptureError.formatError
        }
        self.inputFormat = inputFmt

        // Target format: 16kHz mono Float32 (we'll convert to Int16 manually)
        guard let targetFmt = AVAudioFormat(
            standardFormatWithSampleRate: targetSampleRate,
            channels: 1
        ) else {
            cleanup()
            throw SystemAudioCaptureError.converterCreationFailed
        }
        self.targetFormat = targetFmt

        // Create audio converter for resampling
        guard let converter = AVAudioConverter(from: inputFmt, to: targetFmt) else {
            cleanup()
            throw SystemAudioCaptureError.converterCreationFailed
        }
        self.audioConverter = converter

        // 6. Create IO proc for audio callbacks
        status = AudioDeviceCreateIOProcIDWithBlock(&ioProcID, aggregateDeviceID, nil) {
            [weak self] inNow, inInputData, inInputTime, outOutputData, inOutputTime in
            self?.handleAudioInput(inInputData, timestamp: inInputTime)
        }

        guard status == noErr else {
            cleanup()
            throw SystemAudioCaptureError.ioProcCreationFailed(status)
        }

        // 7. Start the device
        status = AudioDeviceStart(aggregateDeviceID, ioProcID)
        guard status == noErr else {
            cleanup()
            throw SystemAudioCaptureError.deviceStartFailed(status)
        }

        let accepted = stateLock.withLock {
            guard generation == startGeneration, starting else { return false }
            self.onAudioChunk = onAudioChunk
            self.onAudioLevel = onAudioLevel
            isCapturing = true
            starting = false
            return true
        }
        guard accepted else {
            cleanup()
            throw CancellationError()
        }
        log("SystemAudioCapture: Started capturing system audio")
    }

    /// Stop capturing system audio
    func stopCapture() {
        stateLock.withLock {
            generation &+= 1
            starting = false
            isCapturing = false
            onAudioChunk = nil
            onAudioLevel = nil
        }
        performOnAudioQueueSynchronously { cleanup() }

        log("SystemAudioCapture: Stopped capturing")
    }

    /// Wait until every previously enqueued Core Audio operation, including
    /// physical tap/device teardown from `stopCapture()`, has completed.
    ///
    /// The onboarding authorization probe uses this barrier before it records
    /// System Audio as prepared. That prevents the real Coaching source from
    /// racing a disposable aggregate device that is still being destroyed.
    public func waitForCaptureStop() async {
        await withCheckedContinuation { continuation in
            audioQueue.async {
                continuation.resume()
            }
        }
    }

    /// Check if currently capturing
    var capturing: Bool {
        stateLock.withLock { isCapturing }
    }

    // MARK: - Private Methods

    /// Get stream format for a device
    private func getStreamFormat(for deviceID: AudioObjectID) -> AudioStreamBasicDescription? {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyStreamFormat,
            mScope: kAudioDevicePropertyScopeInput,
            mElement: kAudioObjectPropertyElementMain
        )

        var format = AudioStreamBasicDescription()
        var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)

        let status = AudioObjectGetPropertyData(
            deviceID,
            &address,
            0,
            nil,
            &size,
            &format
        )

        return status == noErr ? format : nil
    }

    /// Handle incoming audio data from the tap
    private func handleAudioInput(_ inputData: UnsafePointer<AudioBufferList>?, timestamp: UnsafePointer<AudioTimeStamp>?) {
        stateLock.lock()
        defer { stateLock.unlock() }
        let callbackGeneration = generation
        guard isCapturing,
              let inputData,
              let converter = audioConverter,
              let targetFmt = targetFormat else { return }

        let audioBuffers = UnsafeMutableAudioBufferListPointer(
            UnsafeMutablePointer(mutating: inputData)
        )
        var logicalBuffers: [SystemAudioFloat32Buffer] = []
        logicalBuffers.reserveCapacity(audioBuffers.count)
        for buffer in audioBuffers {
            let channelCount = Int(buffer.mNumberChannels)
            let byteCount = Int(buffer.mDataByteSize)
            guard channelCount > 0,
                  byteCount > 0,
                  byteCount.isMultiple(of: MemoryLayout<Float32>.size),
                  let data = buffer.mData else {
                return
            }

            let sampleCount = byteCount / MemoryLayout<Float32>.size
            let samples = Array(
                UnsafeBufferPointer(
                    start: data.assumingMemoryBound(to: Float32.self),
                    count: sampleCount
                )
            )
            logicalBuffers.append(
                SystemAudioFloat32Buffer(samples: samples, channelCount: channelCount)
            )
        }

        guard let monoSamples = SystemAudioPCMDownmixer.downmix(
            buffers: logicalBuffers,
            expectedChannelCount: sourceChannelCount
        ) else {
            return
        }
        let frameCount = AVAudioFrameCount(monoSamples.count)

        // Create input AVAudioPCMBuffer
        guard let inputFmt = inputFormat,
              let inputBuffer = AVAudioPCMBuffer(pcmFormat: inputFmt, frameCapacity: frameCount) else { return }

        inputBuffer.frameLength = frameCount

        guard let destination = inputBuffer.floatChannelData?[0] else { return }
        monoSamples.withUnsafeBufferPointer { samples in
            if let source = samples.baseAddress {
                destination.update(from: source, count: samples.count)
            }
        }

        // Calculate output frame count based on sample rate conversion
        let outputFrameCapacity = AVAudioFrameCount(ceil(Double(frameCount) * targetSampleRate / sourceSampleRate))
        guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: targetFmt, frameCapacity: outputFrameCapacity) else { return }

        // Convert using input block pattern
        var error: NSError?
        var hasConsumedInput = false

        let inputBlock: AVAudioConverterInputBlock = { inNumPackets, outStatus in
            if hasConsumedInput {
                outStatus.pointee = .noDataNow
                return nil
            }
            hasConsumedInput = true
            outStatus.pointee = .haveData
            return inputBuffer
        }

        converter.convert(to: outputBuffer, error: &error, withInputFrom: inputBlock)

        if let error = error {
            logError("SystemAudioCapture: Conversion error", error: error)
            return
        }

        // Convert Float32 to Int16 linear PCM for local speech processing.
        guard let channelData = outputBuffer.floatChannelData?[0] else { return }

        let processedFrameLength = Int(outputBuffer.frameLength)
        var pcmData = [Int16]()
        pcmData.reserveCapacity(processedFrameLength)

        for i in 0..<processedFrameLength {
            let sample = channelData[i]
            // Clamp and convert to Int16 range (-32768 to 32767)
            let pcmSample = Int16(max(-32768, min(32767, sample * 32767)))
            pcmData.append(pcmSample)
        }

        // Convert to Data
        let byteData = pcmData.withUnsafeBufferPointer { buffer in
            return Data(buffer: buffer)
        }

        // Calculate and report audio level (RMS normalized to 0.0 - 1.0)
        if let levelHandler = onAudioLevel, !pcmData.isEmpty {
            let sumOfSquares: Float = pcmData.reduce(0.0) { acc, sample in
                let normalized = Float(sample) / 32767.0
                return acc + normalized * normalized
            }
            let rms = sqrt(sumOfSquares / Float(pcmData.count))
            // Clamp to 0.0 - 1.0 range
            let level = min(Float(1.0), max(Float(0.0), rms))
            DispatchQueue.main.async { [weak self] in
                guard self?.isCaptureActive(generation: callbackGeneration) == true else {
                    return
                }
                levelHandler(level)
            }
        }

        // Send to callback
        guard isCapturing, generation == callbackGeneration else { return }
        onAudioChunk?(byteData)
    }

    private func isCaptureActive(generation candidate: UInt64) -> Bool {
        stateLock.withLock {
            isCapturing && generation == candidate
        }
    }

    private func performOnAudioQueueSynchronously(_ operation: () -> Void) {
        if DispatchQueue.getSpecific(key: audioQueueKey) != nil {
            operation()
        } else {
            audioQueue.sync(execute: operation)
        }
    }

    /// Clean up tap resources
    private func cleanupTap() {
        if tapID != kAudioObjectUnknown {
            AudioHardwareDestroyProcessTap(tapID)
            tapID = kAudioObjectUnknown
        }
    }

    /// Clean up all resources
    private func cleanup() {
        if let procID = ioProcID, aggregateDeviceID != kAudioObjectUnknown {
            AudioDeviceStop(aggregateDeviceID, procID)
            AudioDeviceDestroyIOProcID(aggregateDeviceID, procID)
            ioProcID = nil
        }

        if aggregateDeviceID != kAudioObjectUnknown {
            AudioHardwareDestroyAggregateDevice(aggregateDeviceID)
            aggregateDeviceID = kAudioObjectUnknown
        }

        cleanupTap()

        audioConverter = nil
        inputFormat = nil
        targetFormat = nil
        sourceSampleRate = 0.0
        sourceChannelCount = 0
    }

    deinit {
        stateLock.withLock {
            generation &+= 1
            starting = false
            isCapturing = false
            onAudioChunk = nil
            onAudioLevel = nil
        }
        performOnAudioQueueSynchronously { cleanup() }
    }
}

@available(macOS 14.4, *)
extension SystemAudioCaptureService: PassiveAudioStreamingSource {
    public var isRunning: Bool { capturing }
    public func start(onPCM16k: @escaping @Sendable (Data) -> Void) async throws {
        try await startCapture(onAudioChunk: onPCM16k)
    }
    public func stop() { stopCapture() }
    public func clearPendingBuffers() {
        performOnAudioQueueSynchronously {
            stateLock.withLock {
                audioConverter?.reset()
            }
        }
    }
}
