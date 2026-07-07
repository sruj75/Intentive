import Foundation
import XCTest

final class RenovationAssetGuardTests: XCTestCase {
  func testSelectiveRestoreAssetsStayInTree() throws {
    let root = try repoRoot()
    let requiredPaths = [
      "apps/desktop/CHANGELOG.md",
      "apps/desktop/macos/Desktop/Sources/Intentive/DesktopOnboardingView.swift",
      "apps/desktop/macos/Desktop/Sources/IntentiveDesktopCore/DesktopOnboarding.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingFlow.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingView.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingStepScaffold.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingTrustStepView.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingPermissionStepView.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingNotificationStepView.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingFloatingBarShortcutStepView.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingFloatingBarDemoView.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingVoiceShortcutStepView.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingVoiceDemoView.swift",
      "apps/desktop/macos/Desktop/Sources/Rewind/Core/RewindDatabase.swift",
      "apps/desktop/macos/Desktop/Sources/Rewind/Core/RewindOCRService.swift",
      "apps/desktop/macos/Desktop/Sources/Rewind/Core/RewindStorage.swift",
      "apps/desktop/macos/Desktop/Sources/Rewind/Core/VideoChunkEncoder.swift",
      "apps/desktop/macos/Desktop/Sources/Rewind/Services/RewindIndexer.swift",
      "apps/desktop/macos/Desktop/Sources/Rewind/UI/RewindPage.swift",
      "apps/desktop/macos/Desktop/Sources/MainWindow/RewindOnlyView.swift",
      "apps/desktop/macos/Desktop/Sources/ProactiveAssistants/ProactiveAssistantsPlugin.swift",
      "apps/desktop/macos/Desktop/Sources/ProactiveAssistants/Core/CapturedFrame.swift",
      "apps/desktop/macos/Desktop/Sources/ProactiveAssistants/Core/ContextDetection.swift",
      "apps/desktop/macos/Desktop/Sources/ProactiveAssistants/Core/WindowMonitor.swift",
      "apps/desktop/macos/Desktop/Sources/ProactiveAssistants/Services/AssistantSettings.swift",
      "apps/desktop/macos/Desktop/Sources/ProactiveAssistants/Services/NotificationService.swift",
      "apps/desktop/macos/Desktop/Sources/ProactiveAssistants/Services/OverlayService.swift",
      "apps/desktop/macos/Desktop/Sources/ScreenCaptureService.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/FloatingControlBarWindow.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/FloatingControlBarState.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/FloatingControlBarView.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/AskAIInputView.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/AIResponseView.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/GlobalShortcutManager.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/PushToTalkManager.swift",
      "apps/desktop/macos/Desktop/Sources/AudioCaptureService.swift",
      "apps/desktop/macos/Desktop/Sources/SystemAudioCaptureService.swift",
      "apps/desktop/macos/Desktop/Sources/VADGateService.swift",
      "apps/desktop/macos/Desktop/Sources/LocalTranscriptionService.swift",
      "apps/desktop/macos/Desktop/Sources/DesktopUpdatePolicyManager.swift",
      "apps/desktop/macos/Desktop/Sources/UpdateRelaunchWindowPolicy.swift",
      "apps/desktop/macos/Desktop/Sources/UpdaterViewModel.swift",
      "apps/desktop/macos/Desktop/Sources/Theme/IntentiveChrome.swift",
      "apps/desktop/macos/Desktop/Sources/Theme/IntentiveColors.swift",
      "apps/desktop/macos/Desktop/Sources/Theme/IntentiveFont.swift",
      "apps/desktop/macos/Desktop/Sources/Theme/IntentiveTextEditor.swift",
      "apps/desktop/macos/Desktop/Sources/Resources/silero_vad.onnx",
      "apps/desktop/macos/Desktop/CWebP/module.modulemap",
      "apps/desktop/macos/Desktop/ObjCExceptionCatcher/include/ObjCExceptionCatcher.h",
      "marketing/README.md",
      "marketing/package.json",
      "marketing/src/Root.tsx",
      "marketing/src/screen-memory/ScreenMemoryComposition.tsx",
    ]

    let missing = requiredPaths.filter { path in
      !FileManager.default.fileExists(atPath: root.appendingPathComponent(path).path)
    }
    XCTAssertTrue(missing.isEmpty, "Selective Omi restore assets are missing: \(missing)")
  }

  func testDeletedOmiPlumbingStaysDeleted() throws {
    let root = try repoRoot()
    let removedPaths = [
      "apps/desktop/macos/Desktop/Sources/RealtimeOmni",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/RealtimeHubController.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/RawWebSocket.swift",
      "apps/desktop/macos/Desktop/Sources/Bluetooth",
      "apps/desktop/macos/Desktop/Sources/Audio/BleAudioProcessor.swift",
      "apps/desktop/macos/Desktop/Sources/Audio/BleAudioService.swift",
      "apps/desktop/macos/Desktop/Sources/Providers/ChatProvider.swift",
      "apps/desktop/macos/Desktop/Sources/Providers/AppProvider.swift",
      "apps/desktop/macos/Desktop/Sources/Generated/OmiToolManifest.generated.swift",
      "apps/desktop/macos/Desktop/Sources/LocalAgentAPIServer.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingWelcomeStepView.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingLanguageStepView.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingHowDidYouHearStepView.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingFileScanStepView.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingDataSourcesStepView.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingExportsStepView.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingGoalStepView.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingBYOKStepView.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingTasksStepView.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingChatView.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingImportEvidenceService.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingMemoryLogImportService.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingPromptSuggestions.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingWebResearchService.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingPagedIntroCoordinator.swift",
      "apps/desktop/macos/Desktop/Sources/PostOnboardingPromptViews.swift",
      "apps/desktop/macos/demo",
    ]

    let restoredByMistake = removedPaths.filter { path in
      FileManager.default.fileExists(atPath: root.appendingPathComponent(path).path)
    }
    XCTAssertTrue(restoredByMistake.isEmpty, "Deleted Omi plumbing came back: \(restoredByMistake)")

    let themeDirectory = root.appendingPathComponent("apps/desktop/macos/Desktop/Sources/Theme")
    let legacyThemeFiles = try FileManager.default.contentsOfDirectory(
      at: themeDirectory,
      includingPropertiesForKeys: nil
    )
    .filter { $0.pathExtension == "swift" && $0.lastPathComponent.hasPrefix("Omi") }
    XCTAssertTrue(legacyThemeFiles.isEmpty, "Legacy theme filenames came back: \(legacyThemeFiles)")
  }

  func testRestoredOnboardingFlowDoesNotReferenceRejectedOmiSteps() throws {
    let root = try repoRoot()
    let checkedFiles = [
      "apps/desktop/macos/Desktop/Sources/OnboardingFlow.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingView.swift",
    ]
    let rejectedFragments = [
      "OnboardingWelcomeStepView",
      "OnboardingLanguageStepView",
      "OnboardingHowDidYouHearStepView",
      "OnboardingFileScanStepView",
      "OnboardingDataSourcesStepView",
      "OnboardingExportsStepView",
      "OnboardingGoalStepView",
      "OnboardingBYOKStepView",
      "OnboardingTasksStepView",
      "OnboardingChatView",
      "OnboardingPagedIntroCoordinator",
      "BringYourOwnKeys",
      "HowDidYouHear",
      "DataSources",
      "FileScan",
    ]

    let offenders = try checkedFiles.flatMap { path in
      let contents = try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)
      return rejectedFragments
        .filter { contents.contains($0) }
        .map { "\(path):\($0)" }
    }

    XCTAssertTrue(offenders.isEmpty, "Rejected onboarding steps are still referenced: \(offenders)")
  }

  private func repoRoot() throws -> URL {
    var cursor = URL(fileURLWithPath: #filePath)
    while cursor.path != "/" {
      let candidate = cursor.appendingPathComponent("pnpm-workspace.yaml")
      if FileManager.default.fileExists(atPath: candidate.path) {
        return cursor
      }
      cursor.deleteLastPathComponent()
    }
    throw NSError(domain: "IntentiveTests", code: 1, userInfo: [NSLocalizedDescriptionKey: "repo root not found"])
  }
}
