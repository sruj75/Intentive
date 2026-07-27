import AppKit
import Darwin
import Foundation
import IntentiveDesktopCore

/// One-shot login helper managed by `SMAppService`.
///
/// The helper, rather than Intentive's sensing process, is the LaunchAgent
/// payload. This matters in two places:
///
/// - registration happens immediately, while onboarding's foreground process
///   is already running, so the helper exits instead of creating a duplicate;
/// - unregistering the login item kills only this short-lived helper, never an
///   active Coaching Window before it can stop sensors and enqueue Window Ended.
@main
enum IntentiveLoginLauncher {
  static func main() async throws {
    let executableURL = try currentExecutableURL().resolvingSymlinksInPath()
    let appURL = applicationURL(for: executableURL)
    guard
      let bundle = Bundle(url: appURL),
      let bundleIdentifier = bundle.bundleIdentifier
    else {
      throw LoginLauncherError.invalidApplicationBundle(appURL.path)
    }

    let mainExecutable = appURL
      .appendingPathComponent("Contents", isDirectory: true)
      .appendingPathComponent("MacOS", isDirectory: true)
      .appendingPathComponent("Intentive", isDirectory: false)
      .resolvingSymlinksInPath()
    guard FileManager.default.isExecutableFile(atPath: mainExecutable.path) else {
      throw LoginLauncherError.mainExecutableMissing(mainExecutable.path)
    }

    let runningMainProcessIDs = NSRunningApplication
      .runningApplications(withBundleIdentifier: bundleIdentifier)
      .filter {
        $0.executableURL?.resolvingSymlinksInPath() == mainExecutable
      }
      .map(\.processIdentifier)
    guard DesktopLoginLauncherPolicy.shouldLaunchMainApplication(
      currentProcessID: ProcessInfo.processInfo.processIdentifier,
      runningApplicationProcessIDs: runningMainProcessIDs
    ) else {
      return
    }

    let configuration = NSWorkspace.OpenConfiguration()
    configuration.arguments = ["--background"]
    configuration.activates = false
    configuration.addsToRecentItems = false
    configuration.createsNewApplicationInstance = false
    _ = try await NSWorkspace.shared.openApplication(
      at: appURL,
      configuration: configuration
    )
  }

  private static func applicationURL(for executableURL: URL) -> URL {
    executableURL
      .deletingLastPathComponent() // MacOS
      .deletingLastPathComponent() // Contents
      .deletingLastPathComponent() // Intentive.app
  }

  private static func currentExecutableURL() throws -> URL {
    var requiredSize: UInt32 = 0
    _ = _NSGetExecutablePath(nil, &requiredSize)
    var path = [CChar](repeating: 0, count: Int(requiredSize))
    guard _NSGetExecutablePath(&path, &requiredSize) == 0 else {
      throw LoginLauncherError.executablePathUnavailable
    }
    return URL(fileURLWithPath: String(cString: path))
  }
}

private enum LoginLauncherError: Error, LocalizedError {
  case invalidApplicationBundle(String)
  case mainExecutableMissing(String)
  case executablePathUnavailable

  var errorDescription: String? {
    switch self {
    case .invalidApplicationBundle(let path):
      "Intentive Login Launcher could not resolve its application bundle at \(path)."
    case .mainExecutableMissing(let path):
      "Intentive Login Launcher could not find the main executable at \(path)."
    case .executablePathUnavailable:
      "Intentive Login Launcher could not resolve its executable path."
    }
  }
}
