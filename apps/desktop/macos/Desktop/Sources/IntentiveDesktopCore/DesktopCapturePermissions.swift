public protocol ScreenRecordingPermissionGateway {
  func hasScreenRecordingPermission() -> Bool
  func requestScreenRecordingPermission() -> Bool
  func openScreenRecordingSettings()
}
