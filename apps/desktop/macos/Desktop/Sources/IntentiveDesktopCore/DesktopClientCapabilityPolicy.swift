import Foundation

public enum DesktopClientCapabilityPolicy {
  public static func clientCapabilities(
    bundleID: String?,
    environment: [String: String]
  ) -> [ClientCapability]? {
    let coachingBundleIDs = [
      "com.heyintentive.desktop.dev",
      "com.heyintentive.desktop.preview",
    ]
    let isAcceptance = environment["INTENTIVE_ACCEPTANCE_PROFILE_ROOT"] != nil
    let explicitlyEnabled = environment["INTENTIVE_DESKTOP_COACHING_V1"] == "1"

    return coachingBundleIDs.contains(bundleID ?? "")
      || isAcceptance
      || explicitlyEnabled
      ? [.desktopCoachingV1]
      : nil
  }
}
