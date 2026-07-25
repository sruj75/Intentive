import Foundation
@testable import IntentiveDesktopCore
import XCTest

@MainActor
final class DesktopRuntimeSessionTests: XCTestCase {
  func testRestoreConnectsRuntimeThroughControlPlaneRoute() async throws {
    let auth = FakeAuthAdapter(token: "user-jwt")
    let controlPlane = FakeDesktopControlPlane(
      accountState: AccountState(
        userId: "user-1",
        hasAgentInstance: true,
        hasDesktopClient: true
      ),
      routingResult: .ok(
        AgentRoute(
          agentInstanceId: "agent-1",
          wsURL: URL(string: "wss://runtime.test")!,
          runtimeJWT: "runtime-jwt"
        )
      )
    )
    let socket = SessionFakeRuntimeSocket()
    let runtime = RuntimeAdapter(socket: socket, clientVersion: "desktop-test")
    let session = DesktopRuntimeSessionCoordinator(
      auth: auth,
      controlPlane: controlPlane,
      device: ClientDeviceService(deviceId: "fingerprint-1"),
      runtime: runtime,
      capturePermissionGranted: { true },
      timeZone: { TimeZone(identifier: "Asia/Kolkata")! }
    )

    let state = await session.restoreAndConnect()

    XCTAssertEqual(state, .connecting)
    XCTAssertEqual(session.accountState?.userId, "user-1")
    XCTAssertEqual(session.registeredDeviceId, "device-row-1")
    XCTAssertEqual(controlPlane.registeredFingerprints, ["fingerprint-1"])
    XCTAssertEqual(controlPlane.getMeCapturePermissionSignals, [true])
    XCTAssertEqual(controlPlane.routingCapturePermissionSignals, [true])
    XCTAssertEqual(socket.connectedURL, URL(string: "wss://runtime.test")!)
    XCTAssertEqual(socket.connectedJWT, "runtime-jwt")
    let connect = try XCTUnwrap(socket.sentObjects.first)
    XCTAssertEqual(connect["type"] as? String, "connect")
    XCTAssertEqual(connect["auth_token"] as? String, "runtime-jwt")
    XCTAssertEqual(connect["client_kind"] as? String, "desktop")
    XCTAssertEqual(connect["client_tz"] as? String, "Asia/Kolkata")
  }

  func testMissingRestoredTokenStopsAtSignedOut() async {
    let auth = FakeAuthAdapter(token: nil)
    let controlPlane = FakeDesktopControlPlane()
    let socket = SessionFakeRuntimeSocket()
    let session = DesktopRuntimeSessionCoordinator(
      auth: auth,
      controlPlane: controlPlane,
      device: ClientDeviceService(deviceId: "fingerprint-1"),
      runtime: RuntimeAdapter(socket: socket, clientVersion: "desktop-test"),
      capturePermissionGranted: { true }
    )

    let state = await session.restoreAndConnect()

    XCTAssertEqual(state, .signedOut)
    XCTAssertTrue(controlPlane.getMeCapturePermissionSignals.isEmpty)
    XCTAssertNil(socket.connectedURL)
  }

  func testAccountGateStopsBeforeDeviceRegistrationAndRouting() async {
    let auth = FakeAuthAdapter(token: "user-jwt")
    let controlPlane = FakeDesktopControlPlane(
      accountState: AccountState(
        userId: "user-1",
        nextGate: .capturePermissionSetup,
        hasAgentInstance: false,
        hasDesktopClient: false
      )
    )
    let socket = SessionFakeRuntimeSocket()
    let session = DesktopRuntimeSessionCoordinator(
      auth: auth,
      controlPlane: controlPlane,
      device: ClientDeviceService(deviceId: "fingerprint-1"),
      runtime: RuntimeAdapter(socket: socket, clientVersion: "desktop-test"),
      capturePermissionGranted: { false }
    )

    let state = await session.restoreAndConnect()

    XCTAssertEqual(state, .gate(.capturePermissionSetup))
    XCTAssertTrue(controlPlane.registeredFingerprints.isEmpty)
    XCTAssertTrue(controlPlane.routingCapturePermissionSignals.isEmpty)
    XCTAssertNil(socket.connectedURL)
  }

  func testRetryRoutingDoesNotOpenSocket() async {
    let auth = FakeAuthAdapter(token: "user-jwt")
    let controlPlane = FakeDesktopControlPlane(
      accountState: AccountState(
        userId: "user-1",
        hasAgentInstance: false,
        hasDesktopClient: true
      ),
      routingResult: .retry(retryAfterSeconds: 7)
    )
    let socket = SessionFakeRuntimeSocket()
    let session = DesktopRuntimeSessionCoordinator(
      auth: auth,
      controlPlane: controlPlane,
      device: ClientDeviceService(deviceId: "fingerprint-1"),
      runtime: RuntimeAdapter(socket: socket, clientVersion: "desktop-test"),
      capturePermissionGranted: { true }
    )

    let state = await session.restoreAndConnect()

    XCTAssertEqual(state, .retry(retryAfterSeconds: 7))
    XCTAssertNil(socket.connectedURL)
  }

  func testDisconnectClearsAccountAndRegisteredDeviceState() async {
    let auth = FakeAuthAdapter(token: "user-jwt")
    let controlPlane = FakeDesktopControlPlane(
      accountState: AccountState(
        userId: "user-1",
        hasAgentInstance: true,
        hasDesktopClient: true
      ),
      routingResult: .ok(
        AgentRoute(
          agentInstanceId: "agent-1",
          wsURL: URL(string: "wss://runtime.test")!,
          runtimeJWT: "runtime-jwt"
        )
      )
    )
    let socket = SessionFakeRuntimeSocket()
    let session = DesktopRuntimeSessionCoordinator(
      auth: auth,
      controlPlane: controlPlane,
      device: ClientDeviceService(deviceId: "fingerprint-1"),
      runtime: RuntimeAdapter(socket: socket, clientVersion: "desktop-test"),
      capturePermissionGranted: { true }
    )
    _ = await session.restoreAndConnect()

    session.disconnect()

    XCTAssertEqual(session.state, .signedOut)
    XCTAssertNil(session.accountState)
    XCTAssertNil(session.registeredDeviceId)
    XCTAssertEqual(socket.closeCount, 1)
  }

  func testSignOutClearsPersistedCredentialBeforePublishingSignedOutState() async {
    let auth = FakeAuthAdapter(token: "user-jwt")
    let socket = SessionFakeRuntimeSocket()
    let session = DesktopRuntimeSessionCoordinator(
      auth: auth,
      controlPlane: FakeDesktopControlPlane(),
      device: ClientDeviceService(deviceId: "fingerprint-1"),
      runtime: RuntimeAdapter(socket: socket, clientVersion: "desktop-test"),
      initialAccountState: AccountState(
        userId: "user-1",
        hasAgentInstance: true,
        hasDesktopClient: true
      ),
      capturePermissionGranted: { true }
    )

    let state = await session.signOut()

    XCTAssertEqual(state, DesktopRuntimeSessionState.signedOut)
    let restored = try? await auth.restore()
    XCTAssertNil(restored)
    XCTAssertNil(session.accountState)
    XCTAssertEqual(socket.closeCount, 1)
  }

  func testRuntimeCloseMarksAdapterLostAndPreservesQueueForNextRoute() async throws {
    let auth = FakeAuthAdapter(token: "user-jwt")
    let controlPlane = FakeDesktopControlPlane(
      accountState: AccountState(
        userId: "user-1",
        hasAgentInstance: true,
        hasDesktopClient: true
      ),
      routingResult: .ok(
        AgentRoute(
          agentInstanceId: "agent-1",
          wsURL: URL(string: "wss://runtime.test")!,
          runtimeJWT: "runtime-jwt"
        )
      )
    )
    let socket = SessionFakeRuntimeSocket()
    let runtime = RuntimeAdapter(socket: socket, clientVersion: "desktop-test")
    let session = DesktopRuntimeSessionCoordinator(
      auth: auth,
      controlPlane: controlPlane,
      device: ClientDeviceService(deviceId: "fingerprint-1"),
      runtime: runtime,
      capturePermissionGranted: { true }
    )
    _ = await session.restoreAndConnect()
    try runtime.handleSocketEvent(
      ProtocolEventCodec.encode(HelloOk(sessionSnapshot: SessionSnapshot(messages: [], beforeCursor: nil)))
    )

    session.markRuntimeClosed(reason: "network dropped")
    let queued = try runtime.sendUserMessage("queued while offline")
    _ = await session.restoreAndConnect()
    try runtime.handleSocketEvent(
      ProtocolEventCodec.encode(HelloOk(sessionSnapshot: SessionSnapshot(messages: [], beforeCursor: nil)))
    )

    XCTAssertEqual(session.state, .connecting)
    XCTAssertEqual(runtime.messageStore.message(id: queued.id)?.status, .pending)
    XCTAssertEqual(
      socket.sentObjects.compactMap { $0["type"] as? String },
      ["connect", "connect", "user_message"]
    )
  }
}

private final class FakeAuthAdapter: AuthAdapter {
  private var token: String?
  private(set) var cachedUserJWT: String?

  init(token: String?) {
    self.token = token
    self.cachedUserJWT = token
  }

  func restore() async throws -> String? {
    cachedUserJWT
  }

  func signIn() async throws -> String {
    guard let token else { throw DesktopAuthError.missingToken }
    cachedUserJWT = token
    return token
  }

  func signOut() async throws {
    cachedUserJWT = nil
  }
}

private final class FakeDesktopControlPlane: DesktopControlPlaneRoutingClient {
  var accountState: AccountState
  var routingResult: RuntimeRoutingResult
  private(set) var getMeCapturePermissionSignals: [Bool] = []
  private(set) var routingCapturePermissionSignals: [Bool] = []
  private(set) var registeredFingerprints: [String] = []

  init(
    accountState: AccountState = AccountState(
      userId: "user-1",
      hasAgentInstance: false,
      hasDesktopClient: false
    ),
    routingResult: RuntimeRoutingResult = .retry(retryAfterSeconds: nil)
  ) {
    self.accountState = accountState
    self.routingResult = routingResult
  }

  func getMe(jwt: String, capturePermissionGranted: Bool) async throws -> AccountState {
    getMeCapturePermissionSignals.append(capturePermissionGranted)
    return accountState
  }

  func registerDevice(jwt: String, deviceFingerprint: String) async throws -> String {
    registeredFingerprints.append(deviceFingerprint)
    return "device-row-1"
  }

  func getRuntimeRouting(jwt: String, capturePermissionGranted: Bool) async throws -> RuntimeRoutingResult {
    routingCapturePermissionSignals.append(capturePermissionGranted)
    return routingResult
  }
}

private final class SessionFakeRuntimeSocket: RuntimeSocket {
  private(set) var connectedURL: URL?
  private(set) var connectedJWT: String?
  private(set) var sent: [Data] = []
  private(set) var closeCount = 0

  var sentObjects: [[String: Any]] {
    sent.compactMap { data in
      try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }
  }

  func connect(url: URL, jwt: String) throws {
    connectedURL = url
    connectedJWT = jwt
  }

  func send(_ data: Data) throws {
    sent.append(data)
  }

  func close() {
    closeCount += 1
  }
}
