import Foundation
import XCTest

final class RenovationAssetGuardTests: XCTestCase {
  func testStatusMenuPreservesExplicitItemEnablement() throws {
    let root = try repoRoot()
    let appDelegate = try String(
      contentsOf: root.appendingPathComponent(
        "apps/desktop/macos/Desktop/Sources/Intentive/IntentiveAppDelegate.swift"
      ),
      encoding: .utf8
    )

    XCTAssertTrue(
      appDelegate.contains("menu.autoenablesItems = false"),
      "AppKit must not override the Coaching and updater item states"
    )
  }

  func testOpenIntentiveCanRecreateTheSingletonPrimaryWindow() throws {
    let root = try repoRoot()
    let app = try String(
      contentsOf: root.appendingPathComponent(
        "apps/desktop/macos/Desktop/Sources/Intentive/IntentiveApp.swift"
      ),
      encoding: .utf8
    )
    let appDelegate = try String(
      contentsOf: root.appendingPathComponent(
        "apps/desktop/macos/Desktop/Sources/Intentive/IntentiveAppDelegate.swift"
      ),
      encoding: .utf8
    )

    XCTAssertTrue(
      app.contains("appDelegate.attach(")
        && app.contains("makePrimaryWindowContent:"),
      "The delegate must receive the Settings window factory before any scene appears"
    )
    XCTAssertFalse(
      app.contains(".onAppear {\n        appDelegate.attach("),
      "A background launch cannot wait for a hidden scene to attach its own reopen action"
    )
    XCTAssertTrue(
      appDelegate.contains("private var primaryWindowController: NSWindowController?"),
      "Open Intentive must retain one AppKit window controller"
    )
    XCTAssertTrue(
      appDelegate.contains("NSHostingController(rootView: makePrimaryWindowContent())"),
      "The singleton controller must be able to recreate the SwiftUI Settings surface"
    )
    XCTAssertTrue(
      appDelegate.contains("window.isReleasedWhenClosed = false"),
      "Closing Settings must leave one reusable singleton window"
    )
    XCTAssertTrue(
      appDelegate.contains(
        #"window.identifier = NSUserInterfaceItemIdentifier("intentive-primary-window")"#
      ),
      "Computer Use and acceptance need a stable primary-window identity"
    )
    XCTAssertTrue(
      appDelegate.contains("guard !didPlacePrimaryWindowForFirstShow")
        && appDelegate.contains(
          "DesktopPrimaryWindowPlacement.frameForFirstVisibleShow("
        ),
      "Only the first visible show may replace hidden AppKit placement"
    )
    XCTAssertFalse(
      appDelegate.contains("window.center()"),
      "Hidden background materialization must not center against an unsuitable screen"
    )
    let showWindow = try XCTUnwrap(
      appDelegate.range(of: "primaryWindowController?.showWindow(nil)")
    )
    let placeWindow = try XCTUnwrap(
      appDelegate.range(of: "placePrimaryWindowForFirstVisibleShowIfNeeded(window)")
    )
    let frontWindow = try XCTUnwrap(
      appDelegate.range(of: "window.makeKeyAndOrderFront(nil)")
    )
    XCTAssertLessThan(
      showWindow.lowerBound,
      frontWindow.lowerBound,
      "The retained singleton must be shown before it is made key"
    )
    XCTAssertLessThan(
      frontWindow.lowerBound,
      placeWindow.lowerBound,
      "Intentive placement must be the final first-show frame mutation after AppKit restoration"
    )
  }

  func testBackgroundLaunchReasonIsConfiguredBeforeHostedLaunchWorkBegins() throws {
    let root = try repoRoot()
    let appDelegate = try String(
      contentsOf: root.appendingPathComponent(
        "apps/desktop/macos/Desktop/Sources/Intentive/IntentiveAppDelegate.swift"
      ),
      encoding: .utf8
    )
    let configure = try XCTUnwrap(
      appDelegate.range(
        of: "model.configureCoachingLaunch(background: launchedInBackground)"
      )
    )
    let materialize = try XCTUnwrap(
      appDelegate.range(of: "ensurePrimaryWindow()?.orderOut(nil)")
    )

    XCTAssertLessThan(
      configure.lowerBound,
      materialize.lowerBound,
      "The --background launch reason must be fixed before MainWindowView starts launch reconciliation"
    )
  }

  func testShippedSettingsExposeExplicitAnalyticsConsentControl() throws {
    let root = try repoRoot()
    let settingsPage = try String(
      contentsOf: root.appendingPathComponent(
        "apps/desktop/macos/Desktop/Sources/OmiImported/MainWindow/Pages/SettingsPage.swift"
      ),
      encoding: .utf8
    )
    let settingsContract = try String(
      contentsOf: root.appendingPathComponent(
        "apps/desktop/macos/Desktop/Sources/OmiImported/MainWindow/SettingsSidebar.swift"
      ),
      encoding: .utf8
    )
    let adapter = try String(
      contentsOf: root.appendingPathComponent(
        "apps/desktop/macos/Desktop/Sources/Intentive/IntentiveDesktopPresentationAdapter.swift"
      ),
      encoding: .utf8
    )

    XCTAssertTrue(settingsContract.contains("var analyticsEnabled: Bool { get set }"))
    XCTAssertTrue(settingsPage.contains(#"accessibilityIdentifier("privacy-analytics-toggle")"#))
    XCTAssertTrue(settingsPage.contains("Off until you choose to share anonymous product usage"))
    XCTAssertTrue(adapter.contains("set { model.setAnalyticsEnabled(newValue) }"))
  }

  func testPinnedOmiThemeRemainsByteIdentical() throws {
    let root = try repoRoot()
    let expectedBlobs = [
      "OmiButtonStyle.swift": "82dad1c6fda05cae2a65f1b9f01e2ba6f9b7fab2",
      "OmiChrome.swift": "e15e13b916df08776426ef1eefa03e6ea5bda8fe",
      "OmiColors.swift": "5a42662ea9c20d7fa5796ffe3be9befa2fd56850",
      "OmiFont.swift": "d2b0b767baed4567ff80fa4ebfa78e393096cdf4",
      "OmiMotion.swift": "3a88560f94449043797ce96fffe1da3f505e3075",
      "OmiSpacing.swift": "3ce994c5615fb058bc059dbc469e8cb76288981e",
      "OmiToggleStyle.swift": "6f13f4af5ac4ec08676345ffc04558304aaa979d",
      "OmiType.swift": "8215b50256b63b45fe5e4b9fe0a70e57de9e3770",
    ]
    for (name, expected) in expectedBlobs {
      let relative = "apps/desktop/macos/Desktop/Sources/OmiImported/Theme/\(name)"
      XCTAssertEqual(try gitBlobHash(root: root, relativePath: relative), expected, "Omi theme drifted: \(name)")
    }
  }

  func testCriticalRenovatedOmiMechanismsStayCompiled() throws {
    let root = try repoRoot()
    let requiredPaths = [
      "apps/desktop/macos/Desktop/Sources/IntentiveDesktopCore/DesktopOnboarding.swift",
      "apps/desktop/macos/Desktop/Sources/Intentive/IntentiveDesktopPresentationAdapter.swift",
      "apps/desktop/macos/Desktop/Sources/OmiImported/SignInView.swift",
      "apps/desktop/macos/Desktop/Sources/OmiImported/MainWindow/SettingsSidebar.swift",
      "apps/desktop/macos/Desktop/Sources/OmiImported/MainWindow/Pages/SettingsPage.swift",
      "apps/desktop/macos/Desktop/Sources/Rewind/Core/RewindStorage.swift",
      "apps/desktop/macos/Desktop/Sources/Rewind/Core/VideoChunkEncoder.swift",
      "apps/desktop/macos/Desktop/Sources/ProactiveAssistants/Services/OverlayService.swift",
      "apps/desktop/macos/Desktop/Sources/ProactiveAssistants/UI/GlowBorderView.swift",
      "apps/desktop/macos/Desktop/Sources/ProactiveAssistants/UI/GlowEdgeWindow.swift",
      "apps/desktop/macos/Desktop/Sources/ProactiveAssistants/UI/GlowOverlayWindow.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/FloatingBackgroundModifier.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/FloatingBarNotchTransition.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/FloatingControlBarGeometry.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/FloatingControlBarManager.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/FloatingControlBarWindow.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/FloatingControlBarState.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/FloatingControlBarView.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/AskAIInputView.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/AIResponseView.swift",
      "apps/desktop/macos/Desktop/Sources/SystemAudioCaptureService.swift",
      "apps/desktop/macos/Desktop/Sources/Theme/IntentiveChrome.swift",
      "apps/desktop/macos/Desktop/Sources/Theme/IntentiveColors.swift",
      "apps/desktop/macos/Desktop/Sources/Theme/IntentiveFont.swift",
      "apps/desktop/macos/Desktop/Sources/Theme/IntentiveTextEditor.swift",
      "apps/desktop/macos/Desktop/Sources/IntentiveDesktopNativeAdapters/Resources/silero_vad.onnx",
    ]

    let missing = requiredPaths.filter { path in
      !FileManager.default.fileExists(atPath: root.appendingPathComponent(path).path)
    }
    XCTAssertTrue(missing.isEmpty, "Critical renovated Omi mechanisms are missing: \(missing)")

    let manifest = try String(
      contentsOf: root.appendingPathComponent("apps/desktop/macos/Desktop/Package.swift"),
      encoding: .utf8
    )
    let requiredCompiledPaths = [
      "VideoChunkEncoder.swift",
      "RewindStorage.swift",
      "FloatingControlBarWindow.swift",
      "FloatingControlBarState.swift",
      "FloatingControlBarView.swift",
      "FloatingBackgroundModifier.swift",
      "FloatingBarNotchTransition.swift",
      "FloatingControlBarGeometry.swift",
      "FloatingControlBarManager.swift",
      "IntentiveDesktopPresentation",
      "OverlayService.swift",
      "GlowBorderView.swift",
      "GlowEdgeWindow.swift",
      "GlowOverlayWindow.swift",
      "SystemAudioCaptureService.swift",
    ]
    let uncompiled = requiredCompiledPaths.filter { !manifest.contains($0) }
    XCTAssertTrue(uncompiled.isEmpty, "Critical renovated assets left the package graph: \(uncompiled)")
  }

  func testIntentivePresentationAPIsDoNotUseOmiNames() throws {
    let root = try repoRoot()
    let presentationPaths = [
      "apps/desktop/macos/Desktop/Sources/Intentive/IntentiveDesktopPresentationAdapter.swift",
      "apps/desktop/macos/Desktop/Sources/OmiImported/SignInView.swift",
      "apps/desktop/macos/Desktop/Sources/OmiImported/MainWindow/SettingsSidebar.swift",
      "apps/desktop/macos/Desktop/Sources/OmiImported/MainWindow/Pages/SettingsPage.swift",
    ]
    let staleDeclaration = try NSRegularExpression(
      pattern: #"\b(?:public|private|final)?\s*(?:enum|protocol|struct|class)\s+Omi[A-Za-z0-9_]*\b"#
    )
    let staleHelper = try NSRegularExpression(pattern: #"\bfunc\s+omi[A-Z][A-Za-z0-9_]*\b"#)
    let stalePaths = try presentationPaths.filter { path in
      let source = try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)
      let range = NSRange(source.startIndex..., in: source)
      return staleDeclaration.firstMatch(in: source, range: range) != nil
        || staleHelper.firstMatch(in: source, range: range) != nil
        || source.contains("omi-settings-window")
    }

    XCTAssertTrue(stalePaths.isEmpty, "Intentive presentation APIs still use Omi names: \(stalePaths)")
    XCTAssertFalse(
      try presentationPaths.contains { path in
        try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)
          .contains("skipCurrentSetupStep")
      },
      "Removed setup Skip action remains in the presentation contract"
    )

    let manifest = try String(
      contentsOf: root.appendingPathComponent("apps/desktop/macos/Desktop/Package.swift"),
      encoding: .utf8
    )
    XCTAssertFalse(manifest.contains("OmiDesktopUI"), "Stale Omi presentation target remains in package graph")
  }

  func testRejectedCapabilitiesAndMigrationStubsStayDeleted() throws {
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
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/FloatingBarVoicePlaybackService.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/PTTContextVocabularyProvider.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/PushToTalkManager.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/StreamingPCMPlayer.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/SystemAudioMuteController.swift",
      "apps/desktop/macos/Desktop/Sources/FloatingControlBar/VoiceWaveformBars.swift",
      "apps/desktop/macos/Desktop/Sources/IntentiveDesktopCore/PushToTalkTurnGate.swift",
      "apps/desktop/macos/Desktop/Sources/IntentiveDesktopNativeAdapters/NativePushToTalkShortcutMonitor.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingVoiceShortcutStepView.swift",
      "apps/desktop/macos/Desktop/Sources/OnboardingVoiceDemoView.swift",
      "apps/desktop/macos/Desktop/Sources/SpatialOverlay/SpatialOverlayDogfood.swift",
      "apps/desktop/macos/Desktop/Tests/DictationComposerTests.swift",
      "apps/desktop/macos/Desktop/Tests/PTTSilentMicRecoveryPolicyTests.swift",
      "apps/desktop/macos/Desktop/Tests/PTTVoiceUserMessageEarlyTests.swift",
      "apps/desktop/macos/Desktop/Tests/PushToTalkShortcutStateMachineTests.swift",
      "apps/desktop/macos/Desktop/Tests/PushToTalkSpeechGateTests.swift",
      "apps/desktop/macos/Desktop/Tests/PushToTalkStateMachineTests.swift",
      "apps/desktop/macos/Desktop/Tests/SpatialOverlayDogfoodHarnessTests.swift",
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
      "apps/desktop/macos/Desktop/Sources/Intentive/DesktopOnboardingView.swift",
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

  func testPackageManifestHasNoStaleFileOrTestExclusions() throws {
    let root = try repoRoot()
    let manifest = try String(
      contentsOf: root.appendingPathComponent("apps/desktop/macos/Desktop/Package.swift"),
      encoding: .utf8
    )
    let forbiddenExclusions = [
      "ActionItemModels.swift",
      "FloatingBarVoicePlaybackService.swift",
      "OnboardingVoiceDemoView.swift",
      "SpatialOverlayDogfood.swift",
      "ChatErrorStateTests.swift",
      "PTTVoiceUserMessageEarlyTests.swift",
      "TranscriptionStorageRecoveryTests.swift",
    ]
    let stale = forbiddenExclusions.filter(manifest.contains)
    XCTAssertTrue(stale.isEmpty, "Stale production/test exclusions remain: \(stale)")
  }

  func testCompiledProductHasNoRejectedCapabilityOrUserFacingOmiStrings() throws {
    let root = try repoRoot()
    let sourceRoot = root.appendingPathComponent("apps/desktop/macos/Desktop/Sources")
    let compiledRoots = [
      sourceRoot.appendingPathComponent("IntentiveDesktopCore"),
      sourceRoot.appendingPathComponent("IntentiveDesktopNativeAdapters"),
      sourceRoot.appendingPathComponent("Intentive"),
      sourceRoot.appendingPathComponent("FloatingControlBar"),
    ]
    let forbiddenFragments = [
      "PushToTalk",
      "push-to-talk",
      "DictationComposer",
      "FloatingBarVoicePlaybackService",
      "AgentPillsManager",
      "SpatialOverlayDogfood",
      "FloatingBarNotificationContext",
      "onPlayPause",
      "onShareLink",
      "flushQueuedNotificationsIfPossible",
      "clearPendingNotificationContext",
      "\"Omi Chat\"",
      "\"Ask Omi\"",
      "\"Ask omi\"",
    ]

    let files = try compiledRoots.flatMap(swiftFilesRecursively)
    let offenders = try files.flatMap { file in
      let contents = try String(contentsOf: file, encoding: .utf8)
      let relativePath = file.path.replacingOccurrences(of: root.path + "/", with: "")
      return forbiddenFragments
        .filter(contents.contains)
        .map { "\(relativePath):\($0)" }
    }

    XCTAssertTrue(offenders.isEmpty, "Rejected capability or user-facing Omi strings remain compiled: \(offenders)")
  }

  func testSettingsWindowShipsRewindWhileFloatingBarRemainsSoleChatSurface() throws {
    let root = try repoRoot()
    let mainWindow = try String(
      contentsOf: root.appendingPathComponent("apps/desktop/macos/Desktop/Sources/Intentive/MainWindowView.swift"),
      encoding: .utf8
    )
    XCTAssertFalse(mainWindow.contains("ChatView("))
    XCTAssertFalse(mainWindow.contains("ConversationView("))
    XCTAssertFalse(mainWindow.contains("OnboardingChatView("))
    XCTAssertFalse(mainWindow.contains("struct ScreenMemoryView"))
    XCTAssertFalse(mainWindow.contains("struct ScreenMemoryThumbnail"))
    XCTAssertFalse(mainWindow.contains("struct UtilitySettingsView"))

    let app = try String(
      contentsOf: root.appendingPathComponent("apps/desktop/macos/Desktop/Sources/Intentive/IntentiveApp.swift"),
      encoding: .utf8
    )
    XCTAssertFalse(app.contains("Search Screen Memory"))
    XCTAssertFalse(app.contains("intentiveFocusScreenMemorySearch"))

    let acceptance = try String(
      contentsOf: root.appendingPathComponent("apps/desktop/macos/AcceptanceDriver/main.swift"),
      encoding: .utf8
    )
    for legacyIdentifier in [
      "sidebar-screenMemory", "sidebar-sensing", "sidebar-account", "sidebar-diagnostics",
      "sensing-screen-memory-toggle", "sensing-passive-audio-toggle",
    ] {
      XCTAssertFalse(acceptance.contains(legacyIdentifier), "Old Intentive UI acceptance path remains: \(legacyIdentifier)")
    }
    for rewindIdentifier in [
      "screen_memory_search_field", "screen_memory_previous_day", "screen_memory_next_day",
      "screen_memory_app_filter_", "screen_memory_frame_", "screen_memory_scrub_forward",
      "screen_memory_current_frame", "screen_memory_delete_frame", "screen_memory_clear_local_data",
    ] {
      XCTAssertTrue(
        acceptance.contains(rewindIdentifier),
        "Shipped Rewind acceptance does not drive \(rewindIdentifier)"
      )
    }
    XCTAssertFalse(
      acceptance.contains("/v1/fixtures/rewind-smoke"),
      "Rewind acceptance must drive the shipped Settings UI, not a headless bridge substitute"
    )
  }

  private func swiftFilesRecursively(at root: URL) throws -> [URL] {
    guard let enumerator = FileManager.default.enumerator(
      at: root,
      includingPropertiesForKeys: [.isRegularFileKey]
    ) else { return [] }
    return enumerator.compactMap { item in
      guard let url = item as? URL, url.pathExtension == "swift" else { return nil }
      return url
    }
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

  private func gitBlobHash(root: URL, relativePath: String) throws -> String {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/git")
    process.arguments = ["-C", root.path, "hash-object", relativePath]
    let output = Pipe()
    process.standardOutput = output
    try process.run()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else {
      throw NSError(domain: "IntentiveTests", code: 2, userInfo: [NSLocalizedDescriptionKey: "git hash-object failed"])
    }
    return String(decoding: output.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }
}
