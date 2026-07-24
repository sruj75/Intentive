import Foundation
import IntentiveDesktopCore
import Security

public final class KeychainTokenStore: TokenStore {
  private let service: String
  private let account: String

  public init(
    service: String? = nil,
    account: String = "neon-user-jwt"
  ) {
    self.service = service ?? Self.defaultService()
    self.account = account
  }

  private static func defaultService() -> String {
    let bundleID = Bundle.main.bundleIdentifier
    return "\(bundleID ?? "com.heyintentive.desktop.dev").auth"
  }

  public func readToken() -> String? {
    var query = baseQuery()
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess, let data = item as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  public func writeToken(_ token: String?) {
    SecItemDelete(baseQuery() as CFDictionary)
    guard let token, let data = token.data(using: .utf8) else { return }

    var item = baseQuery()
    item[kSecValueData as String] = data
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    SecItemAdd(item as CFDictionary, nil)
  }

  private func baseQuery() -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }
}
