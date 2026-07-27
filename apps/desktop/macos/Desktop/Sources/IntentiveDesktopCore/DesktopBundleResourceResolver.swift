import Foundation

/// Locates SwiftPM target resource bundles after the executable has been
/// assembled into a conventional signed macOS application.
///
/// SwiftPM's generated `Bundle.module` accessor checks beside the `.app` root
/// before falling back to an absolute build-machine path. Signed macOS apps
/// must instead keep resources under `Contents/Resources`, so shipped targets
/// consult this resolver first and use `Bundle.module` only for SwiftPM-native
/// development and tests.
public enum DesktopBundleResourceResolver {
  public static func packagedBundle(
    named name: String,
    resourcesURL: URL? = Bundle.main.resourceURL
  ) -> Bundle? {
    guard let resourcesURL else { return nil }
    return Bundle(
      url: resourcesURL.appendingPathComponent(name, isDirectory: true)
    )
  }
}
