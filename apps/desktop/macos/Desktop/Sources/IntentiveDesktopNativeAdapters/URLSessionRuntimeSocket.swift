import Foundation
import IntentiveDesktopCore

protocol RuntimeWebSocketTask: AnyObject {
  func resume()
  func cancel(with closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?)
  func send(
    _ message: URLSessionWebSocketTask.Message,
    completionHandler: @escaping @Sendable (Error?) -> Void
  )
  func receive(
    completionHandler: @escaping @Sendable (
      Result<URLSessionWebSocketTask.Message, Error>
    ) -> Void
  )
}

extension URLSessionWebSocketTask: RuntimeWebSocketTask {}

public final class URLSessionRuntimeSocket: RuntimeSocket {
  public var onMessage: ((Data) -> Void)?
  public var onClose: ((Error?) -> Void)?

  private let taskFactory: (URLRequest) -> RuntimeWebSocketTask
  private let taskLock = NSLock()
  private var task: RuntimeWebSocketTask?

  public init(session: URLSession = .shared) {
    taskFactory = { request in
      session.webSocketTask(with: request)
    }
  }

  init(taskFactory: @escaping (URLRequest) -> RuntimeWebSocketTask) {
    self.taskFactory = taskFactory
  }

  public func connect(url: URL, jwt: String) throws {
    close()
    var request = URLRequest(url: url)
    request.setValue("Bearer \(jwt)", forHTTPHeaderField: "Authorization")
    let task = taskFactory(request)
    taskLock.withLock {
      self.task = task
    }
    task.resume()
    receiveNext(on: task)
  }

  public func send(_ data: Data) throws {
    guard let task = taskLock.withLock({ self.task }) else {
      throw URLError(.notConnectedToInternet)
    }
    task.send(.data(data)) { [weak self] error in
      guard let self, self.isCurrent(task) else { return }
      guard let error else { return }
      self.onClose?(error)
    }
  }

  public func close() {
    let task = taskLock.withLock {
      let task = self.task
      self.task = nil
      return task
    }
    task?.cancel(with: .goingAway, reason: nil)
  }

  private func receiveNext(on task: RuntimeWebSocketTask) {
    task.receive { [weak self] result in
      guard let self, self.isCurrent(task) else { return }
      switch result {
      case .success(.data(let data)):
        self.onMessage?(data)
        self.receiveNext(on: task)
      case .success(.string(let text)):
        self.onMessage?(Data(text.utf8))
        self.receiveNext(on: task)
      case .failure(let error):
        self.onClose?(error)
      @unknown default:
        self.onClose?(nil)
      }
    }
  }

  private func isCurrent(_ task: RuntimeWebSocketTask) -> Bool {
    taskLock.withLock {
      self.task === task
    }
  }
}
