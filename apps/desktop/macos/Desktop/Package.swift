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
    .library(name: "IntentiveDesktopNativeAdapters", targets: ["IntentiveDesktopNativeAdapters"]),
    .library(name: "IntentiveDesktopNativeAssets", targets: ["IntentiveDesktopNativeAssets"]),
  ],
  targets: [
    .target(
      name: "IntentiveDesktopCore",
      path: "Sources/IntentiveDesktopCore"
    ),
    .target(
      name: "IntentiveDesktopNativeAdapters",
      dependencies: ["IntentiveDesktopCore"],
      path: "Sources/IntentiveDesktopNativeAdapters"
    ),
    .target(
      name: "IntentiveDesktopNativeAssets",
      path: "Sources",
      exclude: [
        "AppBuild.swift",
        "Audio",
        "BundleEnvironment.swift",
        "BundleExtension.swift",
        "Chat/ChatErrorState.swift",
        "ClientDeviceService.swift",
        "DesktopUpdatePolicyManager.swift",
        "FloatingControlBar/AIResponseView.swift",
        "FloatingControlBar/AskAIInputView.swift",
        "FloatingControlBar/DraggableAreaView.swift",
        "FloatingControlBar/FloatingBackgroundModifier.swift",
        "FloatingControlBar/FloatingBarVoicePlaybackService.swift",
        "FloatingControlBar/FloatingControlBarGeometry.swift",
        "FloatingControlBar/FloatingControlBarState.swift",
        "FloatingControlBar/FloatingControlBarView.swift",
        "FloatingControlBar/FloatingControlBarWindow.swift",
        "FloatingControlBar/GlobalShortcutManager.swift",
        "FloatingControlBar/PTTContextVocabularyProvider.swift",
        "FloatingControlBar/PushToTalkManager.swift",
        "FloatingControlBar/ResizeHandleView.swift",
        "FloatingControlBar/ScreenCaptureManager.swift",
        "FloatingControlBar/ShortcutSettings.swift",
        "FloatingControlBar/StreamingPCMPlayer.swift",
        "FloatingControlBar/SystemAudioMuteController.swift",
        "FloatingControlBar/VoiceWaveformBars.swift",
        "Intentive",
        "IntentiveDesktopCore",
        "IntentiveDesktopNativeAdapters",
        "LaunchAtLoginManager.swift",
        "LocalTranscriptionService.swift",
        "Logger.swift",
        "MainWindow",
        "ProactiveAssistants",
        "Resources/AppIcon.icns",
        "Resources/accessibility_permission.gif",
        "Resources/enable_notifications.gif",
        "Resources/folder_access.png",
        "Resources/full_disk_access.png",
        "Resources/microphone-settings.png",
        "Resources/permissions.gif",
        "Resources/tray_icon.png",
        "Rewind",
        "ScreenActivitySyncService.swift",
        "Theme",
        "TranscriptionRetryService.swift",
        "UpdaterViewModel.swift",
        "WhatsNewToast.swift",
      ],
      sources: [
        "IntentiveNativeBuildShims.swift",
        "AudioCaptureService.swift",
        "AudioLevelMonitor.swift",
        "AudioMixer.swift",
        "HardSecretDetector.swift",
        "Chat/StallDetector.swift",
        "Chat/StallThresholds.swift",
        "FloatingControlBar/FloatingBarNotchTransition.swift",
        "NotificationRegistrationRepair.swift",
        "ScreenCaptureService.swift",
        "ScreenRecordingPermissionPolicy.swift",
        "SpatialOverlay/SpatialOverlayCore.swift",
        "SpatialOverlay/SpatialOverlayDogfood.swift",
        "SpatialOverlay/SpatialOverlayGeometry.swift",
        "SpatialOverlay/SpatialOverlayRenderGeometry.swift",
        "SpatialOverlay/SpatialOverlayResolver.swift",
        "SystemAudioCaptureService.swift",
        "UpdateRelaunchWindowPolicy.swift",
        "VADGateService.swift",
      ],
      resources: [
        .process("Resources/silero_vad.onnx")
      ]
    ),
    .executableTarget(
      name: "Intentive",
      dependencies: ["IntentiveDesktopCore", "IntentiveDesktopNativeAdapters"],
      path: "Sources/Intentive"
    ),
    .testTarget(
      name: "IntentiveDesktopCoreTests",
      dependencies: ["IntentiveDesktopCore", "IntentiveDesktopNativeAssets"],
      path: "Tests",
      exclude: [
        // Restored Omi subsystem tests stay in-tree as renovation assets until
        // each subsystem is adapted behind the IntentiveDesktopCore seams.
        "ChatErrorStateTests.swift",
        "ClientDeviceServiceTests.swift",
        "DeferredUpdateInstallTests.swift",
        "FloatingBarGeometryTests.swift",
        "FloatingBarHeuristicsTests.swift",
        "FloatingBarVoiceResponseSettingsTests.swift",
        "FloatingControlBarStateTests.swift",
        "PTTVoiceUserMessageEarlyTests.swift",
        "PushToTalkStateMachineTests.swift",
        "RewindEncoderDiagnosticsSourceTests.swift",
        "RewindOCRQualityTests.swift",
        "RewindRetentionCleanupTests.swift",
        "RewindStorageVideoFrameExtractionTests.swift",
        "ScreenCaptureWebPTests.swift",
        "ScreenPrivacyExclusionTests.swift",
        "ShortcutSettingsTests.swift",
        "StreamingPCMPlaybackQueueTests.swift",
        "TranscriptionFinalizationStateMachineTests.swift",
        "TranscriptionSessionRecordTests.swift",
        "TranscriptionStorageRecoveryTests.swift",
        "UpdateFailureDiagnosticsTests.swift",
      ]
    ),
  ]
)
