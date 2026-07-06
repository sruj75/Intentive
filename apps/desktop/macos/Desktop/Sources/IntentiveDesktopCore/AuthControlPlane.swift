import Foundation

public enum DesktopAuthError: Error, Equatable, LocalizedError {
  case missingHostedAuthURL
  case missingCallbackCode
  case missingToken

  public var errorDescription: String? {
    switch self {
    case .missingHostedAuthURL:
      return "Neon Auth hosted flow URL is not configured."
    case .missingCallbackCode:
      return "Hosted auth callback did not include a code."
    case .missingToken:
      return "No user JWT is available."
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

public final class NeonAuthProvider: AuthAdapter {
  public private(set) var cachedUserJWT: String?

  private let hostedAuthURL: URL?
  private let callbackScheme: String
  private let tokenStore: TokenStore

  public init(hostedAuthURL: URL?, callbackScheme: String = "intentive-desktop", tokenStore: TokenStore) {
    self.hostedAuthURL = hostedAuthURL
    self.callbackScheme = callbackScheme
    self.tokenStore = tokenStore
    self.cachedUserJWT = tokenStore.readToken()
  }

  public func restore() async throws -> String? {
    cachedUserJWT = tokenStore.readToken()
    return cachedUserJWT
  }

  public func signIn() async throws -> String {
    guard hostedAuthURL != nil else { throw DesktopAuthError.missingHostedAuthURL }
    throw DesktopAuthError.missingToken
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
    let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)
    guard let code = components?.queryItems?.first(where: { $0.name == "code" })?.value,
      !code.isEmpty
    else {
      throw DesktopAuthError.missingCallbackCode
    }
    // The hosted server exchanges the code. Until credentials are configured,
    // storing the code-shaped JWT keeps local-stack flows testable without
    // embedding provider keys in the app.
    let token = "hosted-code:\(code)"
    tokenStore.writeToken(token)
    cachedUserJWT = token
    return token
  }

  public func signOut() async throws {
    tokenStore.writeToken(nil)
    cachedUserJWT = nil
  }
}

public struct AccountState: Codable, Equatable, Sendable {
  public var userId: String
  public var hasDesktopClient: Bool
  public var capturePermissionSetupRequired: Bool
  public var entitlementLabel: String?

  public init(
    userId: String,
    hasDesktopClient: Bool,
    capturePermissionSetupRequired: Bool,
    entitlementLabel: String? = nil
  ) {
    self.userId = userId
    self.hasDesktopClient = hasDesktopClient
    self.capturePermissionSetupRequired = capturePermissionSetupRequired
    self.entitlementLabel = entitlementLabel
  }

  enum CodingKeys: String, CodingKey {
    case userId = "user_id"
    case hasDesktopClient = "has_desktop_client"
    case capturePermissionSetupRequired = "capture_permission_setup_required"
    case entitlementLabel = "entitlement_label"
  }
}

public struct DeviceRegistration: Codable, Equatable, Sendable {
  public var deviceId: String
  public var clientKind: ClientKind

  public init(deviceId: String, clientKind: ClientKind = .desktop) {
    self.deviceId = deviceId
    self.clientKind = clientKind
  }

  enum CodingKeys: String, CodingKey {
    case deviceId = "device_id"
    case clientKind = "client_kind"
  }
}

public struct AgentRoute: Codable, Equatable, Sendable {
  public var wsURL: URL
  public var runtimeJWT: String

  public init(wsURL: URL, runtimeJWT: String) {
    self.wsURL = wsURL
    self.runtimeJWT = runtimeJWT
  }

  enum CodingKeys: String, CodingKey {
    case wsURL = "ws_url"
    case runtimeJWT = "runtime_jwt"
  }

  public var routingInfo: RoutingInfo {
    RoutingInfo(webSocketURL: wsURL, runtimeJWT: runtimeJWT)
  }
}

public protocol HTTPTransport {
  func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
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

public final class ControlPlaneClient {
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

  public func registerDevice(jwt: String, deviceId: String) async throws {
    var request = authorizedRequest(path: "/devices/register", jwt: jwt)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try encoder.encode(DeviceRegistration(deviceId: deviceId))
    _ = try await transport.send(request)
  }

  public func getAgent(jwt: String) async throws -> AgentRoute {
    let request = authorizedRequest(path: "/agent", jwt: jwt)
    let (data, _) = try await transport.send(request)
    return try decoder.decode(AgentRoute.self, from: data)
  }

  private func authorizedRequest(path: String, jwt: String) -> URLRequest {
    var request = URLRequest(url: baseURL.appendingPathComponent(path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))))
    request.setValue("Bearer \(jwt)", forHTTPHeaderField: "Authorization")
    request.setValue("desktop", forHTTPHeaderField: "X-Client-Kind")
    return request
  }
}

public final class ClientDeviceService {
  public private(set) var deviceId: String

  public init(deviceId: String = UUID().uuidString) {
    self.deviceId = deviceId
  }
}
