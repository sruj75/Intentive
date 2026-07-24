import Foundation
import IntentiveDesktopCore

public final class URLSessionRuntimeSocket: RuntimeSocket {
  public var onMessage: ((Data) -> Void)?
  public var onClose: ((Error?) -> Void)?

  private let session: URLSession
  private var task: URLSessionWebSocketTask?

  public init(session: URLSession = .shared) {
    self.session = session
  }

  public func connect(url: URL, jwt: String) throws {
    close()
    var request = URLRequest(url: url)
    request.setValue("Bearer \(jwt)", forHTTPHeaderField: "Authorization")
    let task = session.webSocketTask(with: request)
    self.task = task
    task.resume()
    receiveNext()
  }

  public func send(_ data: Data) throws {
    guard let task else {
      throw URLError(.notConnectedToInternet)
    }
    task.send(.data(data)) { [weak self] error in
      guard let error else { return }
      self?.onClose?(error)
    }
  }

  public func close() {
    task?.cancel(with: .goingAway, reason: nil)
    task = nil
  }

  private func receiveNext() {
    task?.receive { [weak self] result in
      guard let self else { return }
      switch result {
      case .success(.data(let data)):
        self.onMessage?(data)
        self.receiveNext()
      case .success(.string(let text)):
        self.onMessage?(Data(text.utf8))
        self.receiveNext()
      case .failure(let error):
        self.onClose?(error)
      @unknown default:
        self.onClose?(nil)
      }
    }
  }
}
