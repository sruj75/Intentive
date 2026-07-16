import Foundation
import IntentiveDesktopCore
import PostHog
import Sentry
import Sparkle

final class SparkleUpdateDriver: NSObject, UpdateDriver, SPUUpdaterDelegate {
  var eventHandler: ((UpdateDriverEvent) -> Void)?

  private var controller: SPUStandardUpdaterController!
  private var deferredInstallation: (() -> Void)?

  init(enabled: Bool) {
    super.init()
    controller = SPUStandardUpdaterController(
      startingUpdater: enabled,
      updaterDelegate: self,
      userDriverDelegate: nil
    )
    if enabled {
      controller.updater.automaticallyChecksForUpdates = true
      controller.updater.automaticallyDownloadsUpdates = true
      controller.updater.updateCheckInterval = 60 * 60
    }
  }

  func checkForUpdates(manual: Bool) {
    if manual {
      controller.checkForUpdates(nil)
    } else {
      controller.updater.checkForUpdatesInBackground()
    }
  }

  func installDownloadedUpdate() {
    let installation = deferredInstallation
    deferredInstallation = nil
    installation?()
  }

  func updater(_ updater: SPUUpdater, didFindValidUpdate item: SUAppcastItem) {
    eventHandler?(.downloadStarted(version: item.displayVersionString))
  }

  func updater(_ updater: SPUUpdater, didDownloadUpdate item: SUAppcastItem) {
    // The install-on-quit callback below supplies the safe installation block.
    // Publish "ready" only once that block exists so the UI cannot race it.
  }

  func updaterDidNotFindUpdate(_ updater: SPUUpdater) {
    eventHandler?(.noUpdate)
  }

  func updater(_ updater: SPUUpdater, didAbortWithError error: Error) {
    let nsError = error as NSError
    // Sparkle reports "already up to date" as an abort in some driver paths.
    if nsError.domain == SUSparkleErrorDomain && nsError.code == 1001 {
      eventHandler?(.noUpdate)
    } else {
      eventHandler?(.failed(message: error.localizedDescription))
    }
  }

  func updater(
    _ updater: SPUUpdater,
    willInstallUpdateOnQuit item: SUAppcastItem,
    immediateInstallationBlock installationBlock: @escaping () -> Void
  ) -> Bool {
    deferredInstallation = installationBlock
    eventHandler?(.downloaded(version: item.displayVersionString))
    return true
  }

}

final class SentryPostHogTelemetryClient: TelemetryClient {
  private let postHogEnabled: Bool
  private let sentryEnabled: Bool

  init(bundle: Bundle = .main, enabled: Bool, analyticsConsent: Bool) {
    let sentryDSN = bundle.object(forInfoDictionaryKey: "IntentiveSentryDSN") as? String
    let postHogKey = bundle.object(forInfoDictionaryKey: "IntentivePostHogProjectKey") as? String
    let postHogHost = bundle.object(forInfoDictionaryKey: "IntentivePostHogHost") as? String

    sentryEnabled = enabled && !(sentryDSN ?? "").isEmpty
    postHogEnabled = enabled && !(postHogKey ?? "").isEmpty

    if sentryEnabled, let sentryDSN {
      SentrySDK.start { options in
        options.dsn = sentryDSN
        options.sendDefaultPii = false
        options.enableAutoSessionTracking = true
        options.enableCaptureFailedRequests = false
      }
    }

    if postHogEnabled, let postHogKey {
      var config: PostHogConfig
      if let postHogHost, !postHogHost.isEmpty {
        config = PostHogConfig(projectToken: postHogKey, host: postHogHost)
      } else {
        config = PostHogConfig(projectToken: postHogKey)
      }
      config.captureApplicationLifecycleEvents = false
      config.captureScreenViews = false
      config.optOut = !analyticsConsent
      config.personProfiles = .never
      PostHogSDK.shared.setup(config)
    }
  }

  func track(_ event: TelemetryEvent) {
    guard postHogEnabled else { return }
    PostHogSDK.shared.capture(event.name.rawValue, properties: event.properties.mapValues(bridge))
  }

  func captureError(_ error: TelemetryError) {
    guard sentryEnabled else { return }
    SentrySDK.capture(message: "\(error.category.rawValue).\(error.code.rawValue)") { scope in
      scope.setLevel(.error)
      scope.setTag(value: error.category.rawValue, key: "category")
      for (key, value) in error.metadata {
        scope.setExtra(value: self.bridge(value), key: key)
      }
    }
  }

  func flush() {
    if postHogEnabled { PostHogSDK.shared.flush() }
    if sentryEnabled { SentrySDK.flush(timeout: 2) }
  }

  func setAnalyticsEnabled(_ enabled: Bool) {
    guard postHogEnabled else { return }
    if enabled {
      PostHogSDK.shared.optIn()
    } else {
      PostHogSDK.shared.optOut()
    }
  }

  private func bridge(_ value: TelemetryValue) -> Any {
    switch value {
    case .string(let value): return value
    case .integer(let value): return value
    case .double(let value): return value
    case .boolean(let value): return value
    }
  }
}

@MainActor
final class DesktopPublicReleaseOperations {
  let updater: PublicReleaseUpdater
  let diagnostics: PersistentDiagnosticsStore?

  private let telemetry: PrivacyFilteringTelemetryClient
  private let telemetryTransport: SentryPostHogTelemetryClient

  init(
    profileRoot: URL,
    updatesEnabled: Bool,
    telemetryEnabled: Bool,
    analyticsConsent: @escaping () -> Bool,
    onUpdateSnapshot: @escaping (UpdateSnapshot) -> Void
  ) {
    let driver = SparkleUpdateDriver(enabled: updatesEnabled)
    updater = PublicReleaseUpdater(driver: driver)
    let initialAnalyticsConsent = analyticsConsent()
    let transport = SentryPostHogTelemetryClient(
      enabled: telemetryEnabled,
      analyticsConsent: initialAnalyticsConsent
    )
    telemetryTransport = transport
    telemetry = PrivacyFilteringTelemetryClient(
      downstream: transport,
      analyticsConsent: analyticsConsent
    )
    diagnostics = try? PersistentDiagnosticsStore(
      directory: profileRoot.appendingPathComponent("Diagnostics", isDirectory: true)
    )

    updater.onSnapshotChange = { [weak self] snapshot in
      Task { @MainActor in
        onUpdateSnapshot(snapshot)
        self?.record(snapshot)
      }
    }
    onUpdateSnapshot(updater.snapshot)
    telemetry.track(TelemetryEvent(name: .appLaunched))
    try? diagnostics?.append(
      DiagnosticEntry(level: .info, category: "application", message: "application launched")
    )
    if updatesEnabled {
      updater.checkForUpdates(manual: false)
    }
  }

  func checkForUpdates() {
    telemetry.track(TelemetryEvent(name: .updateCheckStarted, properties: ["source": .string("manual")]))
    try? diagnostics?.append(
      DiagnosticEntry(level: .info, category: "update", message: "manual update check started")
    )
    updater.checkForUpdates(manual: true)
  }

  func resumeDeferredInstall() {
    updater.resumeDeferredInstall()
  }

  func exportDiagnostics(to destination: URL) throws -> URL {
    guard let diagnostics else {
      throw CocoaError(.fileNoSuchFile)
    }
    let export = try diagnostics.export(to: destination)
    telemetry.track(TelemetryEvent(name: .diagnosticsExported))
    return export
  }

  func clearDiagnostics() throws {
    try diagnostics?.clear()
    telemetry.track(TelemetryEvent(name: .diagnosticsCleared))
  }

  func setAnalyticsEnabled(_ enabled: Bool) {
    telemetryTransport.setAnalyticsEnabled(enabled)
    telemetry.track(
      TelemetryEvent(
        name: .settingChanged,
        properties: ["setting": .string("analytics"), "enabled": .boolean(enabled)]
      )
    )
  }

  func shutdown() {
    try? diagnostics?.append(
      DiagnosticEntry(level: .info, category: "application", message: "application terminating")
    )
    telemetry.flush()
  }

  private func record(_ snapshot: UpdateSnapshot) {
    let metadata: [String: TelemetryValue] = [
      "state": .string(snapshot.phase.rawValue),
      "version": .string(snapshot.availableVersion ?? "none"),
    ]
    switch snapshot.phase {
    case .downloadedAwaitingInstall:
      telemetry.track(TelemetryEvent(name: .updateDownloaded, properties: metadata))
    case .failed:
      telemetry.captureError(
        TelemetryError(category: .update, code: .updateFailed, metadata: ["phase": .string("update")])
      )
    case .idle:
      telemetry.track(
        TelemetryEvent(
          name: .updateCheckCompleted,
          properties: ["result": .string("current")]
        )
      )
    default:
      break
    }
    try? diagnostics?.append(
      DiagnosticEntry(
        level: snapshot.phase == .failed ? .error : .info,
        category: "update",
        message: "update state \(snapshot.phase.rawValue)",
        metadata: metadata
      )
    )
  }
}
