import Foundation
import IntentiveDesktopCore
import XCTest

final class DesktopLaunchConfigurationTests: XCTestCase {
  func testDeterministicLaunchAssemblesUtilityShellAndTextOnlyFloatingBar() {
    let profileRoot = URL(fileURLWithPath: "/tmp/intentive-assembled-profile", isDirectory: true)

    let configuration = DesktopLaunchConfiguration.assembledTest(
      profileRoot: profileRoot,
      permissions: .init(screenRecording: .granted, microphone: .denied),
      authentication: .signedIn(userID: "fixture-user"),
      runtime: .connected
    )

    XCTAssertEqual(configuration.profileRoot, profileRoot)
    XCTAssertEqual(configuration.surface.mainWindowSections, [.home, .screenMemory, .settings])
    XCTAssertEqual(configuration.surface.conversationSurface, .floatingBar)
    XCTAssertEqual(configuration.surface.conversationInput, .textOnly)
    XCTAssertEqual(configuration.surface.setupSurface, .utilityMainWindow)
    XCTAssertEqual(configuration.permissions.screenRecording, .granted)
    XCTAssertEqual(configuration.permissions.microphone, .denied)
    XCTAssertEqual(configuration.authentication, .signedIn(userID: "fixture-user"))
    XCTAssertEqual(configuration.runtime, .connected)

    XCTAssertFalse(configuration.systemBoundaries.captureEnabled)
    XCTAssertFalse(configuration.systemBoundaries.networkEnabled)
    XCTAssertFalse(configuration.systemBoundaries.updatesEnabled)
    XCTAssertFalse(configuration.systemBoundaries.telemetryEnabled)

    let forbiddenCapabilities: Set<DesktopCapability> = [
      .voiceInput,
      .dictation,
      .pushToTalk,
      .textToSpeech,
      .providerCredentials,
      .localAgentBrain,
      .mainWindowChat,
      .subagentInterface,
      .toolCallInterface,
      .productMacOSNotification,
    ]
    XCTAssertTrue(configuration.surface.capabilities.isDisjoint(with: forbiddenCapabilities))
  }

  func testAssemblerConsumesInjectedConfigurationAtTheCompositionBoundary() {
    let configuration = DesktopLaunchConfiguration.assembledTest(
      profileRoot: URL(fileURLWithPath: "/tmp/intentive-assembled-profile", isDirectory: true),
      permissions: .init(screenRecording: .granted, microphone: .denied),
      authentication: .signedIn(userID: "fixture-user"),
      runtime: .connected
    )

    let composition = DesktopApplicationAssembler.assemble(configuration: configuration)

    XCTAssertEqual(composition.mainWindowSections, [.home, .screenMemory, .settings])
    XCTAssertEqual(composition.activeSystemBoundaries, [])
    XCTAssertEqual(composition.permissions.screenRecording, .granted)
    XCTAssertEqual(composition.authentication, .signedIn(userID: "fixture-user"))
    XCTAssertEqual(composition.runtime, .connected)
    XCTAssertEqual(composition.setupSurface, .utilityMainWindow)
    XCTAssertFalse(composition.deliversProductMacOSNotifications)
    XCTAssertTrue(composition.offersFloatingBarComposer)
  }
}
