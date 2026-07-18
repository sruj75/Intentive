import Foundation

public enum DesktopAuthError: Error, Equatable, LocalizedError {
  case missingHostedAuthURL
  case missingHostedAuthSession
  case missingCallbackCode
  case missingToken
  case stateMismatch
  case tokenExchangeFailed(Int)

  public var errorDescription: String? {
    switch self {
    case .missingHostedAuthURL:
      return "Neon Auth hosted flow URL is not configured."
    case .missingHostedAuthSession:
      return "Neon Auth hosted flow cannot run without a native auth session."
    case .missingCallbackCode:
      return "Hosted auth callback did not include a code."
    case .missingToken:
      return "No user JWT is available."
    case .stateMismatch:
      return "Hosted auth callback state did not match the sign-in request."
    case .tokenExchangeFailed(let status):
      return "Hosted auth token exchange failed with status \(status)."
    }
  }
}

public protocol AuthAdapter: AnyObject {
  var cachedUserJWT: String? { get }
  func restore() async throws -> String?
  func signIn() async throws -> String
  func signOut() async throws
}

public protocol TokenStore: AnyObject {
  func readToken() -> String?
  func writeToken(_ token: String?)
}

public final class InMemoryTokenStore: TokenStore {
  private var token: String?

  public init(token: String? = nil) {
    self.token = token
  }

  public func readToken() -> String? {
    token
  }

  public func writeToken(_ token: String?) {
    self.token = token
  }
}

public final class DevAuthProvider: AuthAdapter {
  public private(set) var cachedUserJWT: String?
  private let token: String

  public init(token: String = "dev-runtime-jwt") {
    self.token = token
    self.cachedUserJWT = token
  }

  public func restore() async throws -> String? {
    cachedUserJWT
  }

  public func signIn() async throws -> String {
    cachedUserJWT = token
    return token
  }

  public func signOut() async throws {
    cachedUserJWT = nil
  }
}

public protocol HostedAuthSessionRunner: AnyObject {
  func start(url: URL, callbackScheme: String) async throws -> URL
}

public final class NeonAuthProvider: AuthAdapter {
  public private(set) var cachedUserJWT: String?

  private let hostedAuthURL: URL?
  private let callbackScheme: String
  private let tokenStore: TokenStore
  private let authSession: (any HostedAuthSessionRunner)?
  private let tokenExchangeURL: URL?
  private let transport: HTTPTransport
  private let stateFactory: () -> String
  private let encoder = JSONEncoder()
  private let decoder = JSONDecoder()

  public init(
    hostedAuthURL: URL?,
    callbackScheme: String = "intentive-desktop",
    tokenStore: TokenStore,
    authSession: (any HostedAuthSessionRunner)? = nil,
    tokenExchangeURL: URL? = nil,
    transport: HTTPTransport = URLSessionHTTPTransport(),
    stateFactory: @escaping () -> String = { UUID().uuidString }
  ) {
    self.hostedAuthURL = hostedAuthURL
    self.callbackScheme = callbackScheme
    self.tokenStore = tokenStore
    self.authSession = authSession
    self.tokenExchangeURL = tokenExchangeURL
    self.transport = transport
    self.stateFactory = stateFactory
    self.cachedUserJWT = tokenStore.readToken()
  }

  public func restore() async throws -> String? {
    cachedUserJWT = tokenStore.readToken()
    return cachedUserJWT
  }

  public func signIn() async throws -> String {
    guard let authSession else { throw DesktopAuthError.missingHostedAuthSession }
    let state = stateFactory()
    let signInURL = try hostedSignInURL(state: state)
    let callbackURL = try await authSession.start(url: signInURL, callbackScheme: callbackScheme)
    return try await completeHostedCallback(callbackURL, expectedState: state)
  }

  public func hostedSignInURL(state: String) throws -> URL {
    guard let hostedAuthURL else { throw DesktopAuthError.missingHostedAuthURL }
    var components = URLComponents(url: hostedAuthURL, resolvingAgainstBaseURL: false)
    var items = components?.queryItems ?? []
    items.append(URLQueryItem(name: "client", value: "desktop"))
    items.append(URLQueryItem(name: "redirect_uri", value: "\(callbackScheme)://auth/callback"))
    items.append(URLQueryItem(name: "state", value: state))
    components?.queryItems = items
    return components?.url ?? hostedAuthURL
  }

  public func completeHostedCallback(_ callbackURL: URL) throws -> String {
    try completeHostedCallback(callbackURL, expectedState: nil)
  }

  @discardableResult
  public func completeHostedCallback(_ callbackURL: URL, expectedState: String?) throws -> String {
    let values = callbackValues(callbackURL)
    if let expectedState, values["state"] != expectedState {
      throw DesktopAuthError.stateMismatch
    }

    if let token = firstToken(in: values) {
      tokenStore.writeToken(token)
      cachedUserJWT = token
      return token
    }

    guard let code = values["code"], !code.isEmpty else {
      throw DesktopAuthError.missingCallbackCode
    }
    guard tokenExchangeURL != nil else {
      throw DesktopAuthError.missingToken
    }
    throw DesktopAuthError.missingToken
  }

  public func completeHostedCallback(_ callbackURL: URL, expectedState: String?) async throws -> String {
    let values = callbackValues(callbackURL)
    if let expectedState, values["state"] != expectedState {
      throw DesktopAuthError.stateMismatch
    }

    if let token = firstToken(in: values) {
      tokenStore.writeToken(token)
      cachedUserJWT = token
      return token
    }

    guard let code = values["code"], !code.isEmpty else {
      throw DesktopAuthError.missingCallbackCode
    }
    let token = try await exchangeCodeForToken(code)
    tokenStore.writeToken(token)
    cachedUserJWT = token
    return token
  }

  public func signOut() async throws {
    tokenStore.writeToken(nil)
    cachedUserJWT = nil
  }

  private func exchangeCodeForToken(_ code: String) async throws -> String {
    guard let tokenExchangeURL else { throw DesktopAuthError.missingToken }
    var request = URLRequest(url: tokenExchangeURL)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try encoder.encode(
      HostedAuthTokenExchangeRequest(
        code: code,
        redirectURI: "\(callbackScheme)://auth/callback"
      )
    )
    let (data, response) = try await transport.send(request)
    guard (200..<300).contains(response.statusCode) else {
      throw DesktopAuthError.tokenExchangeFailed(response.statusCode)
    }
    let decoded = try decoder.decode(HostedAuthTokenResponse.self, from: data)
    guard !decoded.token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw DesktopAuthError.missingToken
    }
    return decoded.token
  }

  private func firstToken(in values: [String: String]) -> String? {
    for key in ["token", "id_token", "jwt"] {
      guard let value = values[key]?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
        continue
      }
      return value
    }
    return nil
  }

  private func callbackValues(_ callbackURL: URL) -> [String: String] {
    var values: [String: String] = [:]
    appendQueryItems(from: URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?.queryItems, to: &values)
    if let fragment = callbackURL.fragment,
      let fragmentComponents = URLComponents(string: "https://intentive.invalid?\(fragment)")
    {
      appendQueryItems(from: fragmentComponents.queryItems, to: &values)
    }
    return values
  }

  private func appendQueryItems(from queryItems: [URLQueryItem]?, to values: inout [String: String]) {
    for item in queryItems ?? [] where values[item.name] == nil {
      values[item.name] = item.value
    }
  }
}

public struct HostedAuthTokenExchangeRequest: Codable, Equatable, Sendable {
  public var code: String
  public var redirectURI: String

  public init(code: String, redirectURI: String) {
    self.code = code
    self.redirectURI = redirectURI
  }

  enum CodingKeys: String, CodingKey {
    case code
    case redirectURI = "redirect_uri"
  }
}

public struct HostedAuthTokenResponse: Codable, Equatable, Sendable {
  public var token: String

  public init(token: String) {
    self.token = token
  }
}

public struct AccountState: Codable, Equatable, Sendable {
  public var userId: String
  public var email: String?
  public var nextGate: PreChatGateKind?
  public var hasAgentInstance: Bool
  public var hasDesktopClient: Bool
  public var entitlementLabel: String?

  public init(
    userId: String,
    email: String? = nil,
    nextGate: PreChatGateKind? = nil,
    hasAgentInstance: Bool,
    hasDesktopClient: Bool,
    entitlementLabel: String? = nil
  ) {
    self.userId = userId
    self.email = email
    self.nextGate = nextGate
    self.hasAgentInstance = hasAgentInstance
    self.hasDesktopClient = hasDesktopClient
    self.entitlementLabel = entitlementLabel
  }

  public var capturePermissionSetupRequired: Bool {
    nextGate == .capturePermissionSetup
  }

  enum CodingKeys: String, CodingKey {
    case userId = "user_id"
    case email
    case nextGate = "next_gate"
    case hasAgentInstance = "has_agent_instance"
    case hasDesktopClient = "has_desktop_client"
    case entitlementLabel = "entitlement_label"
  }
}

public enum PreChatGateKind: String, Codable, Equatable, Sendable {
  case identity
  case consentPrimer = "consent_primer"
  case capturePermissionSetup = "capture_permission_setup"
  case siblingClientInvitation = "sibling_client_invitation"
}

public struct DeviceRegistration: Codable, Equatable, Sendable {
  public var deviceFingerprint: String
  public var clientKind: ClientKind

  public init(deviceFingerprint: String, clientKind: ClientKind = .desktop) {
    self.deviceFingerprint = deviceFingerprint
    self.clientKind = clientKind
  }

  enum CodingKeys: String, CodingKey {
    case deviceFingerprint = "device_fingerprint"
    case clientKind = "client_kind"
  }
}

public struct DeviceRegistrationResponse: Codable, Equatable, Sendable {
  public var deviceId: String

  public init(deviceId: String) {
    self.deviceId = deviceId
  }

  enum CodingKeys: String, CodingKey {
    case deviceId = "device_id"
  }
}

public struct AgentRoute: Codable, Equatable, Sendable {
  public var agentInstanceId: String?
  public var wsURL: URL
  public var runtimeJWT: String

  public init(agentInstanceId: String? = nil, wsURL: URL, runtimeJWT: String) {
    self.agentInstanceId = agentInstanceId
    self.wsURL = wsURL
    self.runtimeJWT = runtimeJWT
  }

  enum CodingKeys: String, CodingKey {
    case agentInstanceId = "agent_instance_id"
    case wsURL = "ws_url"
    case runtimeJWT = "runtime_jwt"
  }

  public var routingInfo: RoutingInfo {
    RoutingInfo(webSocketURL: wsURL, runtimeJWT: runtimeJWT)
  }
}

public enum RuntimeRoutingResult: Equatable, Sendable {
  case ok(AgentRoute)
  case retry(retryAfterSeconds: Double?)
  case reauth
  case gate
}

public protocol HTTPTransport {
  func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

public protocol DesktopControlPlaneRoutingClient: AnyObject {
  func getMe(jwt: String, capturePermissionGranted: Bool) async throws -> AccountState
  func registerDevice(jwt: String, deviceFingerprint: String) async throws -> String
  func getRuntimeRouting(jwt: String, capturePermissionGranted: Bool) async throws -> RuntimeRoutingResult
}

public struct URLSessionHTTPTransport: HTTPTransport {
  public init() {}

  public func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw URLError(.badServerResponse)
    }
    return (data, http)
  }
}

public final class ControlPlaneClient: DesktopControlPlaneRoutingClient {
  private let baseURL: URL
  private let transport: HTTPTransport
  private let decoder = JSONDecoder()
  private let encoder = JSONEncoder()

  public init(baseURL: URL, transport: HTTPTransport = URLSessionHTTPTransport()) {
    self.baseURL = baseURL
    self.transport = transport
  }

  public func getMe(jwt: String, capturePermissionGranted: Bool) async throws -> AccountState {
    var request = authorizedRequest(path: "/me", jwt: jwt)
    request.setValue("desktop", forHTTPHeaderField: "X-Client-Kind")
    request.setValue(capturePermissionGranted ? "true" : "false", forHTTPHeaderField: "X-Capture-Permission-Granted")
    let (data, _) = try await transport.send(request)
    return try decoder.decode(AccountState.self, from: data)
  }

  @discardableResult
  public func registerDevice(jwt: String, deviceFingerprint: String) async throws -> String {
    var request = authorizedRequest(path: "/devices/register", jwt: jwt)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try encoder.encode(DeviceRegistration(deviceFingerprint: deviceFingerprint))
    let (data, _) = try await transport.send(request)
    return try decoder.decode(DeviceRegistrationResponse.self, from: data).deviceId
  }

  public func getAgent(jwt: String) async throws -> AgentRoute {
    let request = authorizedRequest(path: "/agent", jwt: jwt)
    let (data, _) = try await transport.send(request)
    return try decoder.decode(AgentRoute.self, from: data)
  }

  public func getRuntimeRouting(jwt: String, capturePermissionGranted: Bool) async throws -> RuntimeRoutingResult {
    var request = authorizedRequest(path: "/agent", jwt: jwt)
    request.setValue(capturePermissionGranted ? "true" : "false", forHTTPHeaderField: "X-Capture-Permission-Granted")
    let (data, response) = try await transport.send(request)

    switch response.statusCode {
    case 200..<300:
      return try .ok(decoder.decode(AgentRoute.self, from: data))
    case 401:
      return .reauth
    case 403:
      return .gate
    case 503:
      return .retry(retryAfterSeconds: retryAfterSeconds(from: response))
    default:
      return .retry(retryAfterSeconds: nil)
    }
  }

  private func authorizedRequest(path: String, jwt: String) -> URLRequest {
    var request = URLRequest(url: baseURL.appendingPathComponent(path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))))
    request.setValue("Bearer \(jwt)", forHTTPHeaderField: "Authorization")
    request.setValue("desktop", forHTTPHeaderField: "X-Client-Kind")
    return request
  }

  private func retryAfterSeconds(from response: HTTPURLResponse) -> Double? {
    guard let value = response.value(forHTTPHeaderField: "Retry-After") else { return nil }
    let seconds = Double(value)
    return seconds.flatMap { $0 > 0 ? $0 : nil }
  }
}

public final class ClientDeviceService {
  public private(set) var deviceId: String

  public init(deviceId: String = UUID().uuidString) {
    self.deviceId = deviceId
  }
}
