import AppKit
import AuthenticationServices
import Foundation
import IntentiveDesktopCore

@MainActor
public final class ASWebAuthenticationHostedAuthSession: NSObject, HostedAuthSessionRunner,
  ASWebAuthenticationPresentationContextProviding
{
  private let anchorProvider: @MainActor () -> ASPresentationAnchor
  private var currentSession: ASWebAuthenticationSession?

  public init(
    anchorProvider: @escaping @MainActor () -> ASPresentationAnchor = {
      NSApplication.shared.keyWindow ?? NSApplication.shared.windows.first ?? NSWindow()
    }
  ) {
    self.anchorProvider = anchorProvider
  }

  public func start(url: URL, callbackScheme: String) async throws -> URL {
    try await withCheckedThrowingContinuation { continuation in
      let session = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) {
        [weak self] callbackURL, error in
        Task { @MainActor in
          self?.currentSession = nil
        }
        if let callbackURL {
          continuation.resume(returning: callbackURL)
          return
        }
        continuation.resume(throwing: error ?? DesktopAuthError.missingToken)
      }
      session.presentationContextProvider = self
      session.prefersEphemeralWebBrowserSession = false
      currentSession = session
      if !session.start() {
        currentSession = nil
        continuation.resume(throwing: DesktopAuthError.missingHostedAuthSession)
      }
    }
  }

  public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    anchorProvider()
  }

  public func cancel() {
    currentSession?.cancel()
    currentSession = nil
  }
}
