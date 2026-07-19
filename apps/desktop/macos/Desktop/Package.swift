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
    .library(name: "OmiTheme", targets: ["OmiTheme"]),
  ],
  dependencies: [
    // Omi's production release boundaries, renovated behind Intentive-owned
    // UpdaterClient / TelemetryClient seams (Slice 13).
    .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.9.0"),
    .package(url: "https://github.com/getsentry/sentry-cocoa.git", exact: "8.58.0"),
    .package(url: "https://github.com/PostHog/posthog-ios.git", from: "3.0.0"),
    .package(
      url: "https://github.com/microsoft/onnxruntime-swift-package-manager.git",
      exact: "1.24.2"
    ),
    // On-device Parakeet STT (CoreML/ANE) for passive audio sensing;
    // pinned to the 0.14.x API Omi's transcription mechanism was written against.
    .package(
      url: "https://github.com/FluidInference/FluidAudio.git",
      .upToNextMinor(from: "0.14.8")
    ),
  ],
  targets: [
    // Byte-identical visual primitives copied from Omi commit
    // c55f2925eba6d98f0c1658535425f7405e5d5b9b. See OMI_PROVENANCE.md.
    .target(
      name: "OmiTheme",
      path: "Sources/OmiImported/Theme"
    ),
    .target(
      name: "IntentiveDesktopCore",
      path: "Sources/IntentiveDesktopCore"
    ),
    .target(
      name: "IntentiveDesktopOmiArchive",
      dependencies: ["IntentiveDesktopCore"],
      path: "Sources/Rewind/Core",
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
        .product(name: "onnxruntime", package: "onnxruntime-swift-package-manager"),
        .product(name: "FluidAudio", package: "FluidAudio"),
      ],
      path: "Sources/IntentiveDesktopNativeAdapters",
      resources: [
        // Silero VAD weights for the microphone voice-activity gate.
        .process("Resources/silero_vad.onnx")
      ]
    ),
    .target(
      name: "IntentiveDesktopNativeAssets",
      dependencies: [
        "IntentiveDesktopCore",
      ],
      path: "Sources",
      exclude: [
        // These are separate SwiftPM targets sharing the repository's Sources root.
        "Intentive",
        "IntentiveDesktopCore",
        "IntentiveDesktopNativeAdapters",
        "Resources/AppIcon.icns",
        "Rewind",
        "OmiImported",
      ],
      sources: [
        "IntentiveNativeBuildShims.swift",
        // Intentive floating control bar: Omi's real bar (View / Window / State)
        // and its leaf views (composer, notch geometry, theme) surgically adapted
        // at the seams by IntentiveBarCompat and driven by
        // a compact, Core-wired Manager we own (ADR-0008).
        "Theme/IntentiveChrome.swift",
        "Theme/IntentiveColors.swift",
        "Theme/IntentiveFont.swift",
        "Theme/IntentiveTextEditor.swift",
        // Omi's real paged onboarding scaffold and permission/trust cards,
        // adapted to Intentive chrome and public application seams (Slice 11).
        "OnboardingPermissionStepView.swift",
        "OnboardingStepScaffold.swift",
        "OnboardingTrustStepView.swift",
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
        "ProactiveAssistants/Services/OverlayService.swift",
        "ProactiveAssistants/UI/GlowBorderView.swift",
        "ProactiveAssistants/UI/GlowEdgeWindow.swift",
        "ProactiveAssistants/UI/GlowGeometry.swift",
        "ProactiveAssistants/UI/GlowOverlayWindow.swift",
        "ScreenRecordingPermissionPolicy.swift",
        "SystemAudioCaptureService.swift",
      ]
    ),
    .executableTarget(
      name: "Intentive",
      dependencies: [
        "IntentiveDesktopCore",
        "IntentiveDesktopNativeAdapters",
        "IntentiveDesktopNativeAssets",
        "IntentiveDesktopOmiArchive",
        .product(name: "Sparkle", package: "Sparkle"),
        .product(name: "Sentry", package: "sentry-cocoa"),
        .product(name: "PostHog", package: "posthog-ios"),
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
      path: "Tests"
    ),
  ]
)
