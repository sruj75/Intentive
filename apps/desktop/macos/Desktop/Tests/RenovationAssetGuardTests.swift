import Foundation
import XCTest

final class RenovationAssetGuardTests: XCTestCase {
  func testSelectiveRestoreAssetsStayInTree() throws {
    let root = try repoRoot()
    let requiredPaths = [
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
      "apps/desktop/macos/Desktop/Sources/Resources/silero_vad.onnx",
      "apps/desktop/macos/Desktop/CWebP/module.modulemap",
      "apps/desktop/macos/Desktop/ObjCExceptionCatcher/include/ObjCExceptionCatcher.h",
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
    ]

    let restoredByMistake = removedPaths.filter { path in
      FileManager.default.fileExists(atPath: root.appendingPathComponent(path).path)
    }
    XCTAssertTrue(restoredByMistake.isEmpty, "Deleted Omi plumbing came back: \(restoredByMistake)")
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
