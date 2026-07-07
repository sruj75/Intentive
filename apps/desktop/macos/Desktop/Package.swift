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
  dependencies: [
    .package(
      url: "https://github.com/microsoft/onnxruntime-swift-package-manager.git",
      exact: "1.24.2"
    ),
    .package(
      url: "https://github.com/RunanywhereAI/runanywhere-sdks",
      revision: "3ebae86014588d8c06a548540c6c14aeb017de1d"
    ),
  ],
  targets: [
    .target(
      name: "IntentiveDesktopCore",
      path: "Sources/IntentiveDesktopCore"
    ),
    .target(
      name: "IntentiveDesktopNativeAdapters",
      dependencies: [
        "IntentiveDesktopCore",
        .product(name: "RunAnywhere", package: "runanywhere-sdks"),
        .product(name: "RunAnywhereONNX", package: "runanywhere-sdks"),
        .product(name: "onnxruntime", package: "onnxruntime-swift-package-manager"),
      ],
      path: "Sources/IntentiveDesktopNativeAdapters"
    ),
    .target(
      name: "IntentiveDesktopNativeAssets",
      dependencies: [
        "IntentiveDesktopCore",
      ],
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
        "OnboardingFloatingBarDemoView.swift",
        "OnboardingFloatingBarShortcutStepView.swift",
        "OnboardingFlow.swift",
        "OnboardingNotificationStepView.swift",
        "OnboardingPermissionStepView.swift",
        "OnboardingStepScaffold.swift",
        "OnboardingTrustStepView.swift",
        "OnboardingView.swift",
        "OnboardingVoiceDemoView.swift",
        "OnboardingVoiceShortcutStepView.swift",
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
        "SileroPushToTalkVADPredictor.swift",
        "Theme",
        "TranscriptionRetryService.swift",
        "UpdaterViewModel.swift",
        "VADGateService.swift",
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
      ],
      resources: [
        .process("Resources/silero_vad.onnx")
      ]
    ),
    .executableTarget(
      name: "Intentive",
      dependencies: [
        "IntentiveDesktopCore",
        "IntentiveDesktopNativeAdapters",
        "IntentiveDesktopNativeAssets",
      ],
      path: "Sources/Intentive"
    ),
    .testTarget(
      name: "IntentiveDesktopCoreTests",
      dependencies: [
        "IntentiveDesktopCore",
        "IntentiveDesktopNativeAdapters",
        "IntentiveDesktopNativeAssets",
      ],
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
        "TranscriptionFinalizationStateMachineTests.swift",
        "TranscriptionSessionRecordTests.swift",
        "TranscriptionStorageRecoveryTests.swift",
        "UpdateFailureDiagnosticsTests.swift",
      ]
    ),
  ]
)
