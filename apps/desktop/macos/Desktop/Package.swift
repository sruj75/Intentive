// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "IntentiveDesktop",
  platforms: [
    .macOS("14.0")
  ],
  products: [
    .executable(name: "Intentive", targets: ["Intentive"]),
    .library(name: "IntentiveDesktopCore", targets: ["IntentiveDesktopCore"]),
  ],
  targets: [
    .target(
      name: "IntentiveDesktopCore",
      path: "Sources/IntentiveDesktopCore"
    ),
    .executableTarget(
      name: "Intentive",
      dependencies: ["IntentiveDesktopCore"],
      path: "Sources/Intentive"
    ),
    .testTarget(
      name: "IntentiveDesktopCoreTests",
      dependencies: ["IntentiveDesktopCore"],
      path: "Tests",
      exclude: [
        // Restored Omi subsystem tests stay in-tree as renovation assets until
        // each subsystem is adapted behind the IntentiveDesktopCore seams.
        "AudioMixerTests.swift",
        "ChatErrorStateTests.swift",
        "ClientDeviceServiceTests.swift",
        "DeferredUpdateInstallTests.swift",
        "FloatingBarGeometryTests.swift",
        "FloatingBarHeuristicsTests.swift",
        "FloatingBarNotchTransitionTests.swift",
        "FloatingBarVoiceResponseSettingsTests.swift",
        "FloatingControlBarStateTests.swift",
        "HardSecretDetectorTests.swift",
        "MeetingGatedSystemAudioTests.swift",
        "NotificationRegistrationRepairTests.swift",
        "PTTSilentMicRecoveryPolicyTests.swift",
        "PTTVoiceUserMessageEarlyTests.swift",
        "PushToTalkSpeechGateTests.swift",
        "PushToTalkStateMachineTests.swift",
        "RewindEncoderDiagnosticsSourceTests.swift",
        "RewindOCRQualityTests.swift",
        "RewindRetentionCleanupTests.swift",
        "RewindStorageVideoFrameExtractionTests.swift",
        "ScreenCaptureWebPTests.swift",
        "ScreenPrivacyExclusionTests.swift",
        "ScreenRecordingPermissionPolicyTests.swift",
        "ShortcutSettingsTests.swift",
        "SpatialOverlayDogfoodHarnessTests.swift",
        "SpatialOverlayGeometryTests.swift",
        "SpatialOverlayPlacementTests.swift",
        "SpatialOverlayResolverTests.swift",
        "StallDetectorTests.swift",
        "StreamingPCMPlaybackQueueTests.swift",
        "TranscriptionFinalizationStateMachineTests.swift",
        "TranscriptionSessionRecordTests.swift",
        "TranscriptionStorageRecoveryTests.swift",
        "UpdateFailureDiagnosticsTests.swift",
        "UpdateRelaunchWindowPolicyTests.swift",
      ]
    ),
  ]
)
