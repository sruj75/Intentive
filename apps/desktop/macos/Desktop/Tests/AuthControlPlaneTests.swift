import Foundation
@testable import IntentiveDesktopCore
import XCTest

final class AuthControlPlaneTests: XCTestCase {
  func testHostedSignInBuildsURLRunsNativeSessionAndStoresReturnedToken() async throws {
    let tokenStore = InMemoryTokenStore()
    let session = FakeHostedAuthSession(
      callbackURL: URL(string: "intentive-desktop://auth/callback?state=state-1&token=user-jwt")!
    )
    let provider = NeonAuthProvider(
      hostedAuthURL: URL(string: "https://auth.test/sign-in")!,
      tokenStore: tokenStore,
      authSession: session,
      stateFactory: { "state-1" }
    )

    let token = try await provider.signIn()

    XCTAssertEqual(token, "user-jwt")
    XCTAssertEqual(tokenStore.readToken(), "user-jwt")
    let signInURL = try XCTUnwrap(session.startedURL)
    let components = try XCTUnwrap(URLComponents(url: signInURL, resolvingAgainstBaseURL: false))
    XCTAssertEqual(components.queryItems?.first(where: { $0.name == "client" })?.value, "desktop")
    XCTAssertEqual(
      components.queryItems?.first(where: { $0.name == "redirect_uri" })?.value,
      "intentive-desktop://auth/callback"
    )
    XCTAssertEqual(components.queryItems?.first(where: { $0.name == "state" })?.value, "state-1")
    XCTAssertEqual(session.callbackScheme, "intentive-desktop")
  }

  func testHostedSignInAcceptsTokenFromCallbackFragment() async throws {
    let tokenStore = InMemoryTokenStore()
    let session = FakeHostedAuthSession(
      callbackURL: URL(string: "intentive-desktop://auth/callback#state=state-1&id_token=user-jwt")!
    )
    let provider = NeonAuthProvider(
      hostedAuthURL: URL(string: "https://auth.test/sign-in")!,
      tokenStore: tokenStore,
      authSession: session,
      stateFactory: { "state-1" }
    )

    let token = try await provider.signIn()

    XCTAssertEqual(token, "user-jwt")
    XCTAssertEqual(tokenStore.readToken(), "user-jwt")
  }

  func testNeonManagedProviderChoiceIsForwardedWithoutChangingTokenHandling() async throws {
    let tokenStore = InMemoryTokenStore()
    let session = FakeHostedAuthSession(
      callbackURL: URL(string: "intentive-desktop://auth/callback?state=state-1&token=user-jwt")!
    )
    let provider = NeonAuthProvider(
      hostedAuthURL: URL(string: "https://auth.test/sign-in")!,
      tokenStore: tokenStore,
      authSession: session,
      stateFactory: { "state-1" }
    )

    let token = try await provider.signIn(provider: .google)
    XCTAssertEqual(token, "user-jwt")
    let components = try XCTUnwrap(URLComponents(url: XCTUnwrap(session.startedURL), resolvingAgainstBaseURL: false))
    XCTAssertEqual(components.queryItems?.first(where: { $0.name == "provider" })?.value, "google")
    XCTAssertEqual(tokenStore.readToken(), "user-jwt")
  }

  func testHostedSignInRejectsMismatchedState() async {
    let session = FakeHostedAuthSession(
      callbackURL: URL(string: "intentive-desktop://auth/callback?state=bad&token=user-jwt")!
    )
    let provider = NeonAuthProvider(
      hostedAuthURL: URL(string: "https://auth.test/sign-in")!,
      tokenStore: InMemoryTokenStore(),
      authSession: session,
      stateFactory: { "state-1" }
    )

    await XCTAssertThrowsErrorAsync(try await provider.signIn()) { error in
      XCTAssertEqual(error as? DesktopAuthError, .stateMismatch)
    }
  }

  func testHostedSignInExchangesCodeThroughConfiguredServerEndpoint() async throws {
    let tokenStore = InMemoryTokenStore()
    let session = FakeHostedAuthSession(
      callbackURL: URL(string: "intentive-desktop://auth/callback?state=state-1&code=oauth-code")!
    )
    let transport = RecordingHTTPTransport(
      responses: [
        response(statusCode: 200, body: #"{"token":"exchanged-jwt"}"#)
      ]
    )
    let provider = NeonAuthProvider(
      hostedAuthURL: URL(string: "https://auth.test/sign-in")!,
      tokenStore: tokenStore,
      authSession: session,
      tokenExchangeURL: URL(string: "https://auth.test/desktop/token")!,
      transport: transport,
      stateFactory: { "state-1" }
    )

    let token = try await provider.signIn()

    XCTAssertEqual(token, "exchanged-jwt")
    XCTAssertEqual(tokenStore.readToken(), "exchanged-jwt")
    let request = try XCTUnwrap(transport.requests.first)
    XCTAssertEqual(request.url?.absoluteString, "https://auth.test/desktop/token")
    XCTAssertEqual(request.httpMethod, "POST")
    XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
    let body = try XCTUnwrap(request.httpBody)
    let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
    XCTAssertEqual(object["code"] as? String, "oauth-code")
    XCTAssertEqual(object["redirect_uri"] as? String, "intentive-desktop://auth/callback")
  }

  func testHostedSignInRequiresTokenExchangeWhenCallbackOnlyHasCode() async {
    let session = FakeHostedAuthSession(
      callbackURL: URL(string: "intentive-desktop://auth/callback?state=state-1&code=oauth-code")!
    )
    let provider = NeonAuthProvider(
      hostedAuthURL: URL(string: "https://auth.test/sign-in")!,
      tokenStore: InMemoryTokenStore(),
      authSession: session,
      stateFactory: { "state-1" }
    )

    await XCTAssertThrowsErrorAsync(try await provider.signIn()) { error in
      XCTAssertEqual(error as? DesktopAuthError, .missingToken)
    }
  }

  func testGetMeSendsDesktopHeadersAndCapturePermission() async throws {
    let transport = RecordingHTTPTransport(
      responses: [
        response(
          statusCode: 200,
          body: #"{"user_id":"user-1","next_gate":null,"has_agent_instance":true,"has_desktop_client":true}"#
        )
      ]
    )
    let client = ControlPlaneClient(baseURL: URL(string: "https://control.test")!, transport: transport)

    let account = try await client.getMe(jwt: "user-jwt", capturePermissionGranted: true)

    XCTAssertEqual(account.userId, "user-1")
    XCTAssertNil(account.nextGate)
    XCTAssertTrue(account.hasAgentInstance)
    XCTAssertFalse(account.capturePermissionSetupRequired)
    let request = try XCTUnwrap(transport.requests.first)
    XCTAssertEqual(request.url?.absoluteString, "https://control.test/me")
    XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-jwt")
    XCTAssertEqual(request.value(forHTTPHeaderField: "X-Client-Kind"), "desktop")
    XCTAssertEqual(request.value(forHTTPHeaderField: "X-Capture-Permission-Granted"), "true")
  }

  func testRegisterDevicePostsDesktopKind() async throws {
    let transport = RecordingHTTPTransport(responses: [response(statusCode: 200, body: #"{"device_id":"device-row-1"}"#)])
    let client = ControlPlaneClient(baseURL: URL(string: "https://control.test")!, transport: transport)

    let deviceId = try await client.registerDevice(jwt: "user-jwt", deviceFingerprint: "fingerprint-1")

    XCTAssertEqual(deviceId, "device-row-1")
    let request = try XCTUnwrap(transport.requests.first)
    XCTAssertEqual(request.httpMethod, "POST")
    XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-jwt")
    XCTAssertEqual(request.value(forHTTPHeaderField: "X-Client-Kind"), "desktop")
    let body = try XCTUnwrap(request.httpBody)
    let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
    XCTAssertEqual(object["device_fingerprint"] as? String, "fingerprint-1")
    XCTAssertEqual(object["client_kind"] as? String, "desktop")
  }

  func testRuntimeRoutingDecodesOkRoute() async throws {
    let transport = RecordingHTTPTransport(
      responses: [
        response(
          statusCode: 200,
          body: #"{"agent_instance_id":"agent-1","ws_url":"wss://runtime.test","runtime_jwt":"runtime-jwt"}"#
        )
      ]
    )
    let client = ControlPlaneClient(baseURL: URL(string: "https://control.test")!, transport: transport)

    let result = try await client.getRuntimeRouting(jwt: "user-jwt", capturePermissionGranted: false)

    XCTAssertEqual(
      result,
      .ok(AgentRoute(agentInstanceId: "agent-1", wsURL: URL(string: "wss://runtime.test")!, runtimeJWT: "runtime-jwt"))
    )
    let request = try XCTUnwrap(transport.requests.first)
    XCTAssertEqual(request.url?.absoluteString, "https://control.test/agent")
    XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-jwt")
    XCTAssertEqual(request.value(forHTTPHeaderField: "X-Client-Kind"), "desktop")
    XCTAssertEqual(request.value(forHTTPHeaderField: "X-Capture-Permission-Granted"), "false")
  }

  func testRuntimeRoutingMapsRetryAfterReauthAndGate() async throws {
    let transport = RecordingHTTPTransport(
      responses: [
        response(statusCode: 503, body: "{}", headers: ["Retry-After": "7"]),
        response(statusCode: 401, body: "{}"),
        response(statusCode: 403, body: "{}"),
        response(statusCode: 500, body: "{}"),
      ]
    )
    let client = ControlPlaneClient(baseURL: URL(string: "https://control.test")!, transport: transport)

    let retry = try await client.getRuntimeRouting(jwt: "user-jwt", capturePermissionGranted: true)
    let reauth = try await client.getRuntimeRouting(jwt: "user-jwt", capturePermissionGranted: true)
    let gate = try await client.getRuntimeRouting(jwt: "user-jwt", capturePermissionGranted: true)
    let genericRetry = try await client.getRuntimeRouting(jwt: "user-jwt", capturePermissionGranted: true)

    XCTAssertEqual(retry, .retry(retryAfterSeconds: 7))
    XCTAssertEqual(reauth, .reauth)
    XCTAssertEqual(gate, .gate)
    XCTAssertEqual(genericRetry, .retry(retryAfterSeconds: nil))
  }
}

private final class FakeHostedAuthSession: HostedAuthSessionRunner {
  let callbackURL: URL
  private(set) var startedURL: URL?
  private(set) var callbackScheme: String?

  init(callbackURL: URL) {
    self.callbackURL = callbackURL
  }

  func start(url: URL, callbackScheme: String) async throws -> URL {
    startedURL = url
    self.callbackScheme = callbackScheme
    return callbackURL
  }
}

private final class RecordingHTTPTransport: HTTPTransport {
  private var responses: [(Data, HTTPURLResponse)]
  private(set) var requests: [URLRequest] = []

  init(responses: [(Data, HTTPURLResponse)]) {
    self.responses = responses
  }

  func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
    requests.append(request)
    guard !responses.isEmpty else {
      throw URLError(.badServerResponse)
    }
    return responses.removeFirst()
  }
}

private func XCTAssertThrowsErrorAsync(
  _ expression: @autoclosure () async throws -> some Any,
  _ handler: (Error) -> Void,
  file: StaticString = #filePath,
  line: UInt = #line
) async {
  do {
    _ = try await expression()
    XCTFail("Expected error to be thrown.", file: file, line: line)
  } catch {
    handler(error)
  }
}

private func response(
  statusCode: Int,
  body: String,
  headers: [String: String] = [:]
) -> (Data, HTTPURLResponse) {
  let url = URL(string: "https://control.test")!
  let response = HTTPURLResponse(
    url: url,
    statusCode: statusCode,
    httpVersion: "HTTP/1.1",
    headerFields: headers
  )!
  return (Data(body.utf8), response)
}
