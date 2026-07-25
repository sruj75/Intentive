import Foundation
@testable import IntentiveDesktopNativeAdapters
import XCTest

final class URLSessionRuntimeSocketTests: XCTestCase {
  func testReconnectingIgnoresMessageFromReplacedTask() throws {
    let firstTask = ControllableRuntimeWebSocketTask()
    let secondTask = ControllableRuntimeWebSocketTask()
    let tasks = TaskFactoryQueue([firstTask, secondTask])
    let socket = URLSessionRuntimeSocket(taskFactory: tasks.makeTask)
    var messages: [Data] = []
    var closeErrors: [Error?] = []
    socket.onMessage = { messages.append($0) }
    socket.onClose = { closeErrors.append($0) }

    try socket.connect(url: URL(string: "wss://runtime.test/first")!, jwt: "first")
    try socket.connect(url: URL(string: "wss://runtime.test/second")!, jwt: "second")

    firstTask.completeReceive(.success(.data(Data("stale".utf8))))

    XCTAssertTrue(messages.isEmpty)
    XCTAssertTrue(closeErrors.isEmpty)
    XCTAssertEqual(firstTask.receiveCallCount, 1)

    secondTask.completeReceive(.success(.data(Data("current".utf8))))

    XCTAssertEqual(messages, [Data("current".utf8)])
    XCTAssertEqual(secondTask.receiveCallCount, 2)
  }

  func testReconnectingIgnoresReceiveFailureFromReplacedTask() throws {
    let firstTask = ControllableRuntimeWebSocketTask()
    let secondTask = ControllableRuntimeWebSocketTask()
    let tasks = TaskFactoryQueue([firstTask, secondTask])
    let socket = URLSessionRuntimeSocket(taskFactory: tasks.makeTask)
    var closeErrors: [Error?] = []
    socket.onClose = { closeErrors.append($0) }

    try socket.connect(url: URL(string: "wss://runtime.test/first")!, jwt: "first")
    try socket.connect(url: URL(string: "wss://runtime.test/second")!, jwt: "second")

    firstTask.completeReceive(.failure(URLError(.networkConnectionLost)))

    XCTAssertTrue(closeErrors.isEmpty)
  }

  func testReconnectingIgnoresSendFailureFromReplacedTask() throws {
    let firstTask = ControllableRuntimeWebSocketTask()
    let secondTask = ControllableRuntimeWebSocketTask()
    let tasks = TaskFactoryQueue([firstTask, secondTask])
    let socket = URLSessionRuntimeSocket(taskFactory: tasks.makeTask)
    var closeErrors: [Error?] = []
    socket.onClose = { closeErrors.append($0) }

    try socket.connect(url: URL(string: "wss://runtime.test/first")!, jwt: "first")
    try socket.send(Data("outbound".utf8))
    try socket.connect(url: URL(string: "wss://runtime.test/second")!, jwt: "second")
    try socket.send(Data("current outbound".utf8))

    firstTask.completeSend(URLError(.networkConnectionLost))

    XCTAssertTrue(closeErrors.isEmpty)

    secondTask.completeSend(URLError(.cannotConnectToHost))

    let closeError = try XCTUnwrap(closeErrors.first ?? nil)
    XCTAssertEqual((closeError as? URLError)?.code, .cannotConnectToHost)
  }
}

private final class TaskFactoryQueue {
  private var tasks: [ControllableRuntimeWebSocketTask]

  init(_ tasks: [ControllableRuntimeWebSocketTask]) {
    self.tasks = tasks
  }

  func makeTask(_: URLRequest) -> RuntimeWebSocketTask {
    tasks.removeFirst()
  }
}

private final class ControllableRuntimeWebSocketTask: RuntimeWebSocketTask {
  private var receiveCompletions: [(Result<URLSessionWebSocketTask.Message, Error>) -> Void] = []
  private var sendCompletions: [(Error?) -> Void] = []
  private(set) var receiveCallCount = 0

  func resume() {}

  func cancel(with _: URLSessionWebSocketTask.CloseCode, reason _: Data?) {}

  func send(
    _: URLSessionWebSocketTask.Message,
    completionHandler: @escaping @Sendable (Error?) -> Void
  ) {
    sendCompletions.append(completionHandler)
  }

  func receive(
    completionHandler: @escaping @Sendable (Result<URLSessionWebSocketTask.Message, Error>) -> Void
  ) {
    receiveCallCount += 1
    receiveCompletions.append(completionHandler)
  }

  func completeSend(_ error: Error?) {
    sendCompletions.removeFirst()(error)
  }

  func completeReceive(_ result: Result<URLSessionWebSocketTask.Message, Error>) {
    receiveCompletions.removeFirst()(result)
  }
}
