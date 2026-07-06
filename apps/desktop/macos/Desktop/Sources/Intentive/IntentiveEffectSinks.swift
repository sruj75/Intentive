import Foundation
import IntentiveDesktopCore
import UserNotifications

final class UserNotificationDesktopSink: DesktopNotificationSink {
  func deliver(title: String, body: String) {
    let center = UNUserNotificationCenter.current()
    center.getNotificationSettings { settings in
      switch settings.authorizationStatus {
      case .authorized, .provisional, .ephemeral:
        self.post(center: center, title: title, body: body)
      case .notDetermined:
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
          guard granted else { return }
          self.post(center: center, title: title, body: body)
        }
      case .denied:
        return
      @unknown default:
        return
      }
    }
  }

  private func post(center: UNUserNotificationCenter, title: String, body: String) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default
    let request = UNNotificationRequest(
      identifier: "intentive-pmb-\(UUID().uuidString)",
      content: content,
      trigger: nil
    )
    center.add(request)
  }
}

final class AlreadyAcknowledgedRuntimeClient: RuntimeChatClient {
  @discardableResult
  func sendUserMessage(_ body: String) throws -> ChatMessage {
    ChatMessage(
      id: "already-acknowledged-\(UUID().uuidString)",
      author: .user,
      body: body,
      at: Date().protocolTimestamp,
      status: .failed("Runtime message sending is not available from this sink.")
    )
  }

  func sendPerceptionEvent(_ event: PerceptionEvent) throws {}
  func acknowledge(messageId: String) throws {}
}
