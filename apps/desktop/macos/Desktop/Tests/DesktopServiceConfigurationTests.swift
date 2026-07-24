import XCTest

@testable import IntentiveDesktopCore

final class DesktopServiceConfigurationTests: XCTestCase {
  func testDevelopmentEnvironmentOverridesBundledServiceEndpoints() throws {
    let configuration = try DesktopServiceConfiguration.resolve(
      environment: [
        "INTENTIVE_CONTROL_PLANE_URL": "http://127.0.0.1:8080",
        "INTENTIVE_HOSTED_AUTH_URL": "https://auth.dev.test/sign-in",
        "INTENTIVE_AUTH_TOKEN_EXCHANGE_URL": "https://auth.dev.test/desktop/token",
      ],
      bundleInfo: [
        "IntentiveControlPlaneURL": "https://control-plane.example.com",
        "IntentiveHostedAuthURL": "https://auth.example.com/sign-in",
      ],
      isPublicRelease: false
    )

    XCTAssertEqual(configuration.controlPlaneURL.absoluteString, "http://127.0.0.1:8080")
    XCTAssertEqual(configuration.hostedAuthURL?.absoluteString, "https://auth.dev.test/sign-in")
    XCTAssertEqual(
      configuration.authTokenExchangeURL?.absoluteString,
      "https://auth.dev.test/desktop/token"
    )
  }

  func testPublicReleaseUsesBundledHTTPSServiceEndpoints() throws {
    let configuration = try DesktopServiceConfiguration.resolve(
      environment: [
        "INTENTIVE_CONTROL_PLANE_URL": "http://localhost:8080",
        "INTENTIVE_HOSTED_AUTH_URL": "http://localhost:3000/sign-in",
      ],
      bundleInfo: [
        "IntentiveControlPlaneURL": "https://control-plane.example.com",
        "IntentiveHostedAuthURL": "https://auth.example.com/sign-in",
      ],
      isPublicRelease: true
    )

    XCTAssertEqual(
      configuration.controlPlaneURL.absoluteString,
      "https://control-plane.example.com"
    )
    XCTAssertEqual(
      configuration.hostedAuthURL?.absoluteString,
      "https://auth.example.com/sign-in"
    )
  }

  func testReleaseAcceptanceModeOverridesOnlyTheControlPlaneWithALocalEndpoint() throws {
    let configuration = try DesktopServiceConfiguration.resolve(
      environment: [
        DesktopServiceConfiguration.releaseAcceptanceModeEnvironmentKey: "1",
        DesktopServiceConfiguration.releaseAcceptanceJWTEnvironmentKey:
          "stage2-acceptance-jwt",
        "INTENTIVE_CONTROL_PLANE_URL": "http://192.168.64.1:51111",
        "INTENTIVE_HOSTED_AUTH_URL": "http://127.0.0.1:3000",
      ],
      bundleInfo: [
        DesktopServiceConfiguration.controlPlaneInfoKey:
          "https://control-plane.example.com",
        DesktopServiceConfiguration.hostedAuthInfoKey:
          "https://auth.example.com/sign-in",
      ],
      isPublicRelease: true
    )

    XCTAssertEqual(
      configuration.controlPlaneURL.absoluteString,
      "http://192.168.64.1:51111"
    )
    XCTAssertEqual(
      configuration.hostedAuthURL?.absoluteString,
      "https://auth.example.com/sign-in"
    )
  }

  func testReleaseAcceptanceModeRejectsANonlocalControlPlaneOverride() {
    XCTAssertThrowsError(
      try DesktopServiceConfiguration.resolve(
        environment: [
          DesktopServiceConfiguration.releaseAcceptanceModeEnvironmentKey: "1",
          DesktopServiceConfiguration.releaseAcceptanceJWTEnvironmentKey:
            "stage2-acceptance-jwt",
          "INTENTIVE_CONTROL_PLANE_URL": "https://attacker.example.com",
        ],
        bundleInfo: [
          DesktopServiceConfiguration.controlPlaneInfoKey:
            "https://control-plane.example.com",
          DesktopServiceConfiguration.hostedAuthInfoKey:
            "https://auth.example.com/sign-in",
        ],
        isPublicRelease: true
      )
    ) { error in
      XCTAssertEqual(
        error as? DesktopServiceConfigurationError,
        .nonlocalReleaseAcceptanceURL(DesktopServiceConfiguration.controlPlaneInfoKey)
      )
    }
  }

  func testReleaseAcceptanceModeWithoutAnExplicitJWTKeepsBundledControlPlane() throws {
    let configuration = try DesktopServiceConfiguration.resolve(
      environment: [
        DesktopServiceConfiguration.releaseAcceptanceModeEnvironmentKey: "1",
        "INTENTIVE_CONTROL_PLANE_URL": "http://127.0.0.1:51111",
      ],
      bundleInfo: [
        DesktopServiceConfiguration.controlPlaneInfoKey:
          "https://control-plane.example.com",
        DesktopServiceConfiguration.hostedAuthInfoKey:
          "https://auth.example.com/sign-in",
      ],
      isPublicRelease: true
    )

    XCTAssertEqual(
      configuration.controlPlaneURL.absoluteString,
      "https://control-plane.example.com"
    )
    XCTAssertNil(
      DesktopServiceConfiguration.releaseAcceptanceToken(
        in: [
          DesktopServiceConfiguration.releaseAcceptanceModeEnvironmentKey: "1"
        ]
      )
    )
  }

  func testPublicReleaseRejectsMissingBundledEndpoints() {
    XCTAssertThrowsError(
      try DesktopServiceConfiguration.resolve(
        environment: [:],
        bundleInfo: [:],
        isPublicRelease: true
      )
    ) { error in
      XCTAssertEqual(
        error as? DesktopServiceConfigurationError,
        .missingPublicReleaseValue("IntentiveControlPlaneURL")
      )
    }
  }

  func testPublicReleaseRejectsNonHTTPSEndpoint() {
    XCTAssertThrowsError(
      try DesktopServiceConfiguration.resolve(
        environment: [:],
        bundleInfo: [
          "IntentiveControlPlaneURL": "http://control-plane.example.com",
          "IntentiveHostedAuthURL": "https://auth.example.com/sign-in",
        ],
        isPublicRelease: true
      )
    ) { error in
      XCTAssertEqual(
        error as? DesktopServiceConfigurationError,
        .insecurePublicReleaseURL("IntentiveControlPlaneURL")
      )
    }
  }

  func testPublicReleaseRejectsLocalEndpoint() {
    XCTAssertThrowsError(
      try DesktopServiceConfiguration.resolve(
        environment: [:],
        bundleInfo: [
          "IntentiveControlPlaneURL": "https://localhost:8080",
          "IntentiveHostedAuthURL": "https://auth.example.com/sign-in",
        ],
        isPublicRelease: true
      )
    ) { error in
      XCTAssertEqual(
        error as? DesktopServiceConfigurationError,
        .localPublicReleaseURL("IntentiveControlPlaneURL")
      )
    }
  }

  func testPublicReleaseRejectsMalformedAuthorityAndPortForms() {
    for endpoint in [
      "https://example.com:abc",
      "https://example.com:70000",
      "https://user:password@example.com",
    ] {
      XCTAssertThrowsError(
        try DesktopServiceConfiguration.resolve(
          environment: [:],
          bundleInfo: [
            DesktopServiceConfiguration.controlPlaneInfoKey: endpoint,
            DesktopServiceConfiguration.hostedAuthInfoKey: "https://auth.example.com",
          ],
          isPublicRelease: true
        ),
        "Expected rejection for \(endpoint)"
      ) { error in
        XCTAssertEqual(
          error as? DesktopServiceConfigurationError,
          .invalidURL(DesktopServiceConfiguration.controlPlaneInfoKey)
        )
      }
    }
  }

  func testPublicReleaseRejectsEveryLoopbackAndUnspecifiedHostForm() {
    for endpoint in [
      "https://LOCALHOST",
      "https://service.localhost/path",
      "https://127.0.0.2",
      "https://0.0.0.0",
      "https://[::1]",
      "https://[::]",
    ] {
      XCTAssertThrowsError(
        try DesktopServiceConfiguration.resolve(
          environment: [:],
          bundleInfo: [
            DesktopServiceConfiguration.controlPlaneInfoKey: endpoint,
            DesktopServiceConfiguration.hostedAuthInfoKey: "https://auth.example.com",
          ],
          isPublicRelease: true
        ),
        "Expected rejection for \(endpoint)"
      ) { error in
        XCTAssertEqual(
          error as? DesktopServiceConfigurationError,
          .localPublicReleaseURL(DesktopServiceConfiguration.controlPlaneInfoKey)
        )
      }
    }
  }
}
