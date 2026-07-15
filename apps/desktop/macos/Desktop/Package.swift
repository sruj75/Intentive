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
    .library(name: "IntentiveDesktopOmiArchive", targets: ["IntentiveDesktopOmiArchive"]),
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
      name: "IntentiveDesktopOmiArchive",
      dependencies: ["IntentiveDesktopCore"],
      path: "Sources/Rewind/Core",
      exclude: [
        "ActionItemModels.swift",
        "ActionItemStorage.swift",
        "GoalRecord.swift",
        "GoalStorage.swift",
        "MemoryModels.swift",
        "MemoryStorage.swift",
        "ObservationRecord.swift",
        "ProactiveModels.swift",
        "ProactiveStorage.swift",
        "RewindDatabase.swift",
        "RewindModels.swift",
        "RewindOCRService.swift",
        "StagedTaskStorage.swift",
        "TableDocumented.swift",
        "TaskChatMessageStorage.swift",
        "TranscriptionModels.swift",
        "TranscriptionStorage.swift",
      ],
      sources: [
        "VideoChunkEncoder.swift",
        "RewindStorage.swift",
      ]
    ),
    .target(
      name: "IntentiveDesktopNativeAdapters",
      dependencies: [
        "IntentiveDesktopCore",
        "IntentiveDesktopOmiArchive",
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
        // Omi's floating bar is restored verbatim (View/Window/State + the leaf
        // views below) and adapted at the seams via IntentiveBarCompat (ADR-0008).
        // Only the subsystems ADR-0007 removed stay shelved as renovation
        // reference: the real voice-playback service, the Omi push-to-talk capture
        // stack, and their audio plumbing — the bar drives inert stubs instead.
        "FloatingControlBar/FloatingBarVoicePlaybackService.swift",
        "FloatingControlBar/GlobalShortcutManager.swift",
        "FloatingControlBar/PTTContextVocabularyProvider.swift",
        "FloatingControlBar/PushToTalkManager.swift",
        "FloatingControlBar/ScreenCaptureManager.swift",
        "FloatingControlBar/ShortcutSettings.swift",
        "FloatingControlBar/StreamingPCMPlayer.swift",
        "FloatingControlBar/SystemAudioMuteController.swift",
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
        // The renovated Omi encoder/storage files compile in the dedicated
        // IntentiveDesktopOmiArchive target above. The remaining database/UI/
        // brain assets stay shelved until their bounded renovation slices.
        "Rewind/Core",
        "Rewind/Services",
        "Rewind/UI",
        "ScreenActivitySyncService.swift",
        "SileroPushToTalkVADPredictor.swift",
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
        // Intentive floating control bar: Omi's real bar (View / Window / State)
        // and its leaf views (composer, notch geometry, purple waveform, theme)
        // salvaged as-is, adapted at the seams by IntentiveBarCompat and driven by
        // a compact, Core-wired Manager we own (ADR-0008).
        "Theme/IntentiveChrome.swift",
        "Theme/IntentiveColors.swift",
        "Theme/IntentiveFont.swift",
        "Theme/IntentiveTextEditor.swift",
        "FloatingControlBar/AIResponseView.swift",
        "FloatingControlBar/AskAIInputView.swift",
        "FloatingControlBar/DraggableAreaView.swift",
        "FloatingControlBar/FloatingBackgroundModifier.swift",
        "FloatingControlBar/FloatingBarNotchTransition.swift",
        "FloatingControlBar/FloatingControlBarGeometry.swift",
        "FloatingControlBar/FloatingControlBarManager.swift",
        "FloatingControlBar/FloatingControlBarState.swift",
        "FloatingControlBar/FloatingControlBarView.swift",
        "FloatingControlBar/FloatingControlBarWindow.swift",
        "FloatingControlBar/IntentiveBarCompat.swift",
        "FloatingControlBar/ResizeHandleView.swift",
        "FloatingControlBar/VoiceWaveformBars.swift",
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
        "IntentiveDesktopOmiArchive",
      ],
      path: "Sources/Intentive"
    ),
    .testTarget(
      name: "IntentiveDesktopCoreTests",
      dependencies: [
        "IntentiveDesktopCore",
        "IntentiveDesktopNativeAdapters",
        "IntentiveDesktopNativeAssets",
        "IntentiveDesktopOmiArchive",
      ],
      path: "Tests",
      exclude: [
        // Restored Omi subsystem tests stay in-tree as renovation assets until
        // each subsystem is adapted behind the IntentiveDesktopCore seams.
        "ChatErrorStateTests.swift",
        "ClientDeviceServiceTests.swift",
        "DeferredUpdateInstallTests.swift",
        "FloatingBarHeuristicsTests.swift",
        "FloatingBarVoiceResponseSettingsTests.swift",
        "PTTVoiceUserMessageEarlyTests.swift",
        "PushToTalkStateMachineTests.swift",
        "RewindEncoderDiagnosticsSourceTests.swift",
        "RewindOCRQualityTests.swift",
        "RewindRetentionCleanupTests.swift",
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
