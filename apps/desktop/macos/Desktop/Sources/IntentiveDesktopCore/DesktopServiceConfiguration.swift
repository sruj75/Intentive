import Foundation

public enum DesktopServiceConfigurationError: Error, Equatable {
  case missingPublicReleaseValue(String)
  case invalidURL(String)
  case insecurePublicReleaseURL(String)
  case localPublicReleaseURL(String)
  case nonlocalReleaseAcceptanceURL(String)
}

/// Public service endpoints resolved from development overrides or signed app
/// bundle metadata. Public releases deliberately ignore process environment so
/// a Finder launch and a shell launch use the same audited configuration. The
/// one exception is an explicitly gated, local-network-only Control Plane seam
/// used by the signed Stage 2 acceptance drivers.
public struct DesktopServiceConfiguration: Equatable {
  public static let controlPlaneInfoKey = "IntentiveControlPlaneURL"
  public static let hostedAuthInfoKey = "IntentiveHostedAuthURL"
  public static let authTokenExchangeInfoKey = "IntentiveAuthTokenExchangeURL"
  public static let releaseAcceptanceModeEnvironmentKey =
    "INTENTIVE_RELEASE_ACCEPTANCE_MODE"
  public static let releaseAcceptanceJWTEnvironmentKey =
    "INTENTIVE_DESKTOP_USER_JWT"

  public let controlPlaneURL: URL
  public let hostedAuthURL: URL?
  public let authTokenExchangeURL: URL?

  public init(
    controlPlaneURL: URL,
    hostedAuthURL: URL?,
    authTokenExchangeURL: URL?
  ) {
    self.controlPlaneURL = controlPlaneURL
    self.hostedAuthURL = hostedAuthURL
    self.authTokenExchangeURL = authTokenExchangeURL
  }

  public static func resolve(
    environment: [String: String],
    bundleInfo: [String: Any],
    isPublicRelease: Bool
  ) throws -> DesktopServiceConfiguration {
    let releaseAcceptanceControlPlaneOverride =
      isPublicRelease
      && environment[releaseAcceptanceModeEnvironmentKey] == "1"
      && releaseAcceptanceToken(in: environment) != nil
      && nonempty(environment["INTENTIVE_CONTROL_PLANE_URL"]) != nil
    let controlPlaneValue = try resolvedValue(
      environmentKeys: ["INTENTIVE_CONTROL_PLANE_URL"],
      infoKey: controlPlaneInfoKey,
      environment: environment,
      bundleInfo: bundleInfo,
      isPublicRelease: isPublicRelease,
      allowPublicReleaseEnvironmentOverride: releaseAcceptanceControlPlaneOverride,
      requiredForPublicRelease: true,
      developmentDefault: "http://localhost:8080"
    )
    let hostedAuthValue = try resolvedValue(
      environmentKeys: ["INTENTIVE_HOSTED_AUTH_URL", "INTENTIVE_NEON_AUTH_URL"],
      infoKey: hostedAuthInfoKey,
      environment: environment,
      bundleInfo: bundleInfo,
      isPublicRelease: isPublicRelease,
      requiredForPublicRelease: true
    )
    let tokenExchangeValue = try resolvedValue(
      environmentKeys: ["INTENTIVE_AUTH_TOKEN_EXCHANGE_URL"],
      infoKey: authTokenExchangeInfoKey,
      environment: environment,
      bundleInfo: bundleInfo,
      isPublicRelease: isPublicRelease,
      requiredForPublicRelease: false
    )

    return DesktopServiceConfiguration(
      controlPlaneURL: try validatedURL(
        controlPlaneValue!,
        key: controlPlaneInfoKey,
        requireHTTPS: isPublicRelease && !releaseAcceptanceControlPlaneOverride,
        requireLocalNetwork: releaseAcceptanceControlPlaneOverride
      ),
      hostedAuthURL: try hostedAuthValue.map {
        try validatedURL($0, key: hostedAuthInfoKey, requireHTTPS: isPublicRelease)
      },
      authTokenExchangeURL: try tokenExchangeValue.map {
        try validatedURL($0, key: authTokenExchangeInfoKey, requireHTTPS: isPublicRelease)
      }
    )
  }

  public static func releaseAcceptanceToken(
    in environment: [String: String]
  ) -> String? {
    guard environment[releaseAcceptanceModeEnvironmentKey] == "1" else {
      return nil
    }
    return nonempty(environment[releaseAcceptanceJWTEnvironmentKey])
  }

  private static func resolvedValue(
    environmentKeys: [String],
    infoKey: String,
    environment: [String: String],
    bundleInfo: [String: Any],
    isPublicRelease: Bool,
    allowPublicReleaseEnvironmentOverride: Bool = false,
    requiredForPublicRelease: Bool,
    developmentDefault: String? = nil
  ) throws -> String? {
    if !isPublicRelease || allowPublicReleaseEnvironmentOverride {
      for key in environmentKeys {
        if let value = nonempty(environment[key]) {
          return value
        }
      }
    }
    if let value = nonempty(bundleInfo[infoKey] as? String) {
      return value
    }
    if isPublicRelease, requiredForPublicRelease {
      throw DesktopServiceConfigurationError.missingPublicReleaseValue(infoKey)
    }
    return developmentDefault
  }

  private static func validatedURL(
    _ value: String,
    key: String,
    requireHTTPS: Bool,
    requireLocalNetwork: Bool = false
  ) throws -> URL {
    guard
      let components = URLComponents(string: value),
      let scheme = components.scheme?.lowercased(),
      ["http", "https"].contains(scheme),
      components.host != nil,
      components.user == nil,
      components.password == nil,
      components.port.map({ (1...65_535).contains($0) }) ?? true,
      let url = components.url
    else {
      throw DesktopServiceConfigurationError.invalidURL(key)
    }
    if requireHTTPS, scheme != "https" {
      throw DesktopServiceConfigurationError.insecurePublicReleaseURL(key)
    }
    var host = components.host?.lowercased() ?? ""
    if host.hasPrefix("["), host.hasSuffix("]") {
      host.removeFirst()
      host.removeLast()
    }
    let isLocalNetwork = isLocalReleaseAcceptanceHost(host)
    if requireHTTPS, isLocalNetwork {
      throw DesktopServiceConfigurationError.localPublicReleaseURL(key)
    }
    if requireLocalNetwork, !isLocalNetwork {
      throw DesktopServiceConfigurationError.nonlocalReleaseAcceptanceURL(key)
    }
    return url
  }

  private static func isLocalReleaseAcceptanceHost(_ host: String) -> Bool {
    if host == "localhost"
      || host.hasSuffix(".localhost")
      || host.hasPrefix("127.")
      || host == "0.0.0.0"
      || host == "::1"
      || host == "::"
      || host.hasPrefix("10.")
      || host.hasPrefix("192.168.")
    {
      return true
    }
    let octets = host.split(separator: ".", omittingEmptySubsequences: false)
    guard
      octets.count == 4,
      octets[0] == "172",
      let second = Int(octets[1]),
      (16...31).contains(second)
    else {
      return false
    }
    return true
  }

  private static func nonempty(_ value: String?) -> String? {
    guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines),
      !trimmed.isEmpty
    else {
      return nil
    }
    return trimmed
  }
}
