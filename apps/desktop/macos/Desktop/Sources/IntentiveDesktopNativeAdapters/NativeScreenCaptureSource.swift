import AppKit
import CoreGraphics
import Foundation
import IntentiveDesktopCore
import ScreenCaptureKit

public enum NativeScreenCaptureError: Error, Equatable, LocalizedError {
  case permissionDenied
  case noFrontmostApplication
  case noActiveWindow
  case windowUnavailable
  case captureFailed(String)

  public var errorDescription: String? {
    switch self {
    case .permissionDenied:
      return "Screen Recording permission is required before Intentive can capture Screen Memory."
    case .noFrontmostApplication:
      return "No frontmost application is available to capture."
    case .noActiveWindow:
      return "No active window is available to capture."
    case .windowUnavailable:
      return "The active window disappeared before it could be captured."
    case .captureFailed(let message):
      return "Screen capture failed: \(message)"
    }
  }
}

public struct NativeScreenRecordingPermissionGateway: ScreenRecordingPermissionGateway {
  public init() {}

  public func hasScreenRecordingPermission() -> Bool {
    NativeScreenCaptureSource.hasScreenRecordingPermission()
  }

  public func requestScreenRecordingPermission() -> Bool {
    NativeScreenCaptureSource.requestScreenRecordingPermission()
  }

  public func openScreenRecordingSettings() {
    NSWorkspace.shared.open(DesktopSystemSettingsDestination.screenRecording.url)
  }
}

public final class NativeScreenCaptureSource: DesktopWindowContextSource {
  private let now: @Sendable () -> Date
  private let idFactory: @Sendable () -> String
  private let onAuthorizationFailure: @Sendable () async -> Void

  public init(
    now: @escaping @Sendable () -> Date = { Date() },
    idFactory: @escaping @Sendable () -> String = { UUID().uuidString },
    onAuthorizationFailure: @escaping @Sendable () async -> Void = {}
  ) {
    self.now = now
    self.idFactory = idFactory
    self.onAuthorizationFailure = onAuthorizationFailure
  }

  public static func hasScreenRecordingPermission() -> Bool {
    CGPreflightScreenCaptureAccess()
  }

  @discardableResult
  public static func requestScreenRecordingPermission() -> Bool {
    CGRequestScreenCaptureAccess()
  }

  public func captureFrame() async throws -> CapturedFrame {
    guard Self.hasScreenRecordingPermission() else {
      throw NativeScreenCaptureError.permissionDenied
    }

    let activeWindow = try resolveActiveWindow()
    let image = try await captureImage(windowID: activeWindow.windowID)
    let imageData = try encodeCapturedImage(image)

    return CapturedFrame(
      id: idFactory(),
      capturedAt: now().protocolTimestamp,
      appBundleID: activeWindow.appBundleID,
      appName: activeWindow.appName,
      windowTitle: activeWindow.windowTitle ?? "",
      ocrText: "",
      rawFrameBytes: imageData
    )
  }

  public func activeWindowContext() throws -> DesktopWindowContext {
    let activeWindow = try resolveActiveWindow()
    return DesktopWindowContext(
      appBundleID: activeWindow.appBundleID,
      appName: activeWindow.appName,
      windowTitle: activeWindow.windowTitle ?? ""
    )
  }

  private struct ActiveWindow {
    var appBundleID: String
    var appName: String
    var windowTitle: String?
    var windowID: CGWindowID
  }

  private func resolveActiveWindow() throws -> ActiveWindow {
    guard let frontApp = NSWorkspace.shared.frontmostApplication else {
      throw NativeScreenCaptureError.noFrontmostApplication
    }

    guard
      let windowList = CGWindowListCopyWindowInfo(
        [.optionOnScreenOnly, .excludeDesktopElements],
        kCGNullWindowID
      ) as? [[String: Any]]
    else {
      throw NativeScreenCaptureError.noActiveWindow
    }

    let activePID = frontApp.processIdentifier
    let appName = frontApp.localizedName ?? frontApp.bundleIdentifier ?? "Unknown"
    let windows = windowList.compactMap { window -> (title: String?, id: CGWindowID, area: CGFloat)? in
      guard
        let pid = window[kCGWindowOwnerPID as String] as? Int32,
        pid == activePID,
        let bounds = window[kCGWindowBounds as String] as? [String: CGFloat],
        let width = bounds["Width"],
        let height = bounds["Height"],
        width > 100,
        height > 100,
        let id = window[kCGWindowNumber as String] as? CGWindowID
      else {
        return nil
      }
      return (window[kCGWindowName as String] as? String, id, width * height)
    }

    guard let largestArea = windows.map(\.area).max(),
      let window = windows.first(where: { $0.area == largestArea })
    else {
      throw NativeScreenCaptureError.noActiveWindow
    }

    return ActiveWindow(
      appBundleID: frontApp.bundleIdentifier ?? "",
      appName: appName,
      windowTitle: window.title,
      windowID: window.id
    )
  }

  private func captureImage(windowID: CGWindowID) async throws -> CGImage {
    do {
      var content = try await SCShareableContent.excludingDesktopWindows(
        false,
        onScreenWindowsOnly: true
      )
      if !content.windows.contains(where: { $0.windowID == windowID }) {
        content = try await SCShareableContent.excludingDesktopWindows(
          false,
          onScreenWindowsOnly: true
        )
      }

      guard let window = content.windows.first(where: { $0.windowID == windowID }) else {
        throw NativeScreenCaptureError.windowUnavailable
      }

      let filter = SCContentFilter(desktopIndependentWindow: window)
      let config = SCStreamConfiguration()
      config.scalesToFit = true
      config.showsCursor = false

      let maxSize: CGFloat = 3000
      let aspectRatio = max(window.frame.width, 1) / max(window.frame.height, 1)
      var width = min(window.frame.width, maxSize)
      var height = width / aspectRatio
      if height > maxSize {
        height = maxSize
        width = height * aspectRatio
      }
      config.width = max(1, Int(width.rounded()))
      config.height = max(1, Int(height.rounded()))

      return try await SCScreenshotManager.captureImage(
        contentFilter: filter,
        configuration: config
      )
    } catch let error as NativeScreenCaptureError {
      throw error
    } catch {
      let captureError = error as NSError
      if captureError.domain == SCStreamErrorDomain,
        captureError.code == -3801 // SCStreamErrorUserDeclined
      {
        // Do not keep the capture operation alive while its MainActor owner
        // performs permission recovery. Coaching stop synchronously waits for
        // capture quiescence, so awaiting that callback could deadlock stop.
        Task { await onAuthorizationFailure() }
        throw NativeScreenCaptureError.permissionDenied
      }
      throw NativeScreenCaptureError.captureFailed(error.localizedDescription)
    }
  }

  private func encodeCapturedImage(_ image: CGImage) throws -> Data {
    let representation = NSBitmapImageRep(cgImage: image)
    guard
      let data = representation.representation(
        using: .jpeg,
        properties: [.compressionFactor: 0.9]
      )
    else {
      throw NativeScreenCaptureError.captureFailed("captured image could not be encoded")
    }
    return data
  }
}
