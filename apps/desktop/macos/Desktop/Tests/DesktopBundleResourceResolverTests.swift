import Foundation
import XCTest

@testable import IntentiveDesktopCore

final class DesktopBundleResourceResolverTests: XCTestCase {
  func testFindsPackagedSwiftPMBundleInsideAppResources() throws {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent("intentive-resource-bundle-\(UUID().uuidString)", isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }

    let bundleURL = root.appendingPathComponent("ExampleResources.bundle", isDirectory: true)
    try FileManager.default.createDirectory(at: bundleURL, withIntermediateDirectories: true)
    let info: [String: Any] = [
      "CFBundleIdentifier": "com.heyintentive.tests.example-resources",
      "CFBundlePackageType": "BNDL",
    ]
    let infoData = try PropertyListSerialization.data(
      fromPropertyList: info,
      format: .xml,
      options: 0
    )
    try infoData.write(to: bundleURL.appendingPathComponent("Info.plist"))

    let resolved = DesktopBundleResourceResolver.packagedBundle(
      named: "ExampleResources.bundle",
      resourcesURL: root
    )

    XCTAssertEqual(resolved?.bundleURL.standardizedFileURL, bundleURL.standardizedFileURL)
  }

  func testReturnsNilWhenPackagedBundleIsAbsent() {
    let missingRoot = FileManager.default.temporaryDirectory
      .appendingPathComponent("intentive-missing-resource-\(UUID().uuidString)", isDirectory: true)

    XCTAssertNil(
      DesktopBundleResourceResolver.packagedBundle(
        named: "MissingResources.bundle",
        resourcesURL: missingRoot
      )
    )
  }
}
