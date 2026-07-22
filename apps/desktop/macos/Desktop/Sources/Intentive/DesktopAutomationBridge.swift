#if DEBUG
import Foundation
import Network

/// Loopback-only fixture/observation bridge. It never performs user actions;
/// the external driver must use the macOS Accessibility tree for those.
@MainActor
final class DesktopAutomationBridge {
  struct Faults: Codable { var dropNextIngressAck = false; var runtimeLinked = true }
  typealias Operation = @MainActor () async throws -> [String: Any]
  private var listener: NWListener?
  private let token = UUID().uuidString + UUID().uuidString
  private let tokenFile: URL
  private let snapshot: () -> [String: Any]
  private let resetFixture: Operation
  private let seedFixture: Operation
  private let dropNextAck: Operation
  private let disconnectRuntime: Operation
  private let reconnectRuntime: Operation
  private let emitPendingAck: Operation
  private let emitOrdinaryReply: Operation
  private let emitProactiveMessage: Operation
  private var faults = Faults()
  private var fixtureName = "empty"

  init?(
    tokenFile: URL,
    snapshot: @escaping () -> [String: Any],
    resetFixture: @escaping Operation,
    seedFixture: @escaping Operation,
    dropNextAck: @escaping Operation,
    disconnectRuntime: @escaping Operation,
    reconnectRuntime: @escaping Operation,
    emitPendingAck: @escaping Operation,
    emitOrdinaryReply: @escaping Operation,
    emitProactiveMessage: @escaping Operation
  ) {
    guard ProcessInfo.processInfo.environment["INTENTIVE_ACCEPTANCE_PROFILE_ROOT"] != nil else {
      return nil
    }
    self.tokenFile = tokenFile
    self.snapshot = snapshot
    self.resetFixture = resetFixture
    self.seedFixture = seedFixture
    self.dropNextAck = dropNextAck
    self.disconnectRuntime = disconnectRuntime
    self.reconnectRuntime = reconnectRuntime
    self.emitPendingAck = emitPendingAck
    self.emitOrdinaryReply = emitOrdinaryReply
    self.emitProactiveMessage = emitProactiveMessage
  }

  func start() throws {
    let listener = try NWListener(using: .tcp, on: .any)
    listener.parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
    listener.newConnectionHandler = { [weak self] connection in
      connection.start(queue: .global(qos: .utility))
      self?.receive(connection)
    }
    listener.stateUpdateHandler = { [weak self] state in
      guard case .ready = state, let port = listener.port else { return }
      Task { @MainActor in try? self?.writeCredentials(port: port.rawValue) }
    }
    listener.start(queue: .global(qos: .utility))
    self.listener = listener
  }

  func stop() { listener?.cancel(); listener = nil; try? FileManager.default.removeItem(at: tokenFile) }

  private nonisolated func receive(_ connection: NWConnection) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) {
      [weak self] data, _, _, _ in
      guard let data, let request = String(data: data, encoding: .utf8) else {
        connection.cancel(); return
      }
      Task { @MainActor in
        let response = await self?.handle(request) ?? Self.response(status: 500, body: [:])
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
      }
    }
  }

  private func handle(_ request: String) async -> Data {
    let lines = request.components(separatedBy: "\r\n")
    guard let requestLine = lines.first else { return Self.response(status: 400, body: [:]) }
    let parts = requestLine.split(separator: " ")
    guard parts.count >= 2 else { return Self.response(status: 400, body: [:]) }
    let headers = Dictionary(uniqueKeysWithValues: lines.dropFirst().compactMap { line -> (String, String)? in
      guard let colon = line.firstIndex(of: ":") else { return nil }
      return (String(line[..<colon]).lowercased(), String(line[line.index(after: colon)...]).trimmingCharacters(in: .whitespaces))
    })
    let host = headers["host"]?.split(separator: ":").first.map(String.init)
    guard host == "127.0.0.1" || host == "localhost" else {
      return Self.response(status: 403, body: ["error": "host_rejected"])
    }
    if let origin = headers["origin"] {
      guard let components = URLComponents(string: origin), components.scheme == "http",
        components.user == nil, components.password == nil,
        components.path.isEmpty || components.path == "/",
        components.query == nil, components.fragment == nil,
        components.host == "127.0.0.1" || components.host == "localhost"
      else {
        return Self.response(status: 403, body: ["error": "origin_rejected"])
      }
    }
    guard headers["authorization"] == "Bearer \(token)" else {
      return Self.response(status: 401, body: ["error": "unauthorized"])
    }
    let method = String(parts[0]), path = String(parts[1])
    switch (method, path) {
    case ("GET", "/v1/state"):
      var body = snapshot()
      body["fixture"] = fixtureName
      body["faults"] = ["drop_next_ingress_ack": faults.dropNextIngressAck, "runtime_linked": faults.runtimeLinked]
      return Self.response(status: 200, body: body)
    case ("POST", "/v1/fixtures/reset"):
      do {
        let result = try await resetFixture()
        fixtureName = "empty"; faults = Faults()
        return Self.response(status: 200, body: result.merging(["ok": true]) { current, _ in current })
      } catch {
        return Self.response(status: 500, body: ["error": "fixture_reset_failed"])
      }
    case ("POST", "/v1/fixtures/seed"):
      do {
        let result = try await seedFixture()
        fixtureName = "release-acceptance"
        return Self.response(
          status: 200,
          body: result.merging(["ok": true, "fixture": fixtureName]) { current, _ in current })
      } catch {
        return Self.response(
          status: 500,
          body: ["error": "fixture_seed_failed", "detail": error.localizedDescription])
      }
    case ("POST", "/v1/faults/drop-next-ack"):
      do {
        let result = try await dropNextAck()
        faults.dropNextIngressAck = true
        return Self.response(status: 200, body: result.merging(["ok": true]) { current, _ in current })
      } catch { return Self.response(status: 500, body: ["error": "fault_arm_failed"]) }
    case ("POST", "/v1/faults/runtime-disconnect"):
      do {
        let result = try await disconnectRuntime()
        faults.runtimeLinked = false
        return Self.response(status: 200, body: result.merging(["ok": true]) { current, _ in current })
      } catch { return Self.response(status: 500, body: ["error": "disconnect_failed"]) }
    case ("POST", "/v1/faults/runtime-reconnect"):
      do {
        let result = try await reconnectRuntime()
        faults.runtimeLinked = true
        return Self.response(status: 200, body: result.merging(["ok": true]) { current, _ in current })
      } catch { return Self.response(status: 500, body: ["error": "reconnect_failed"]) }
    case ("POST", "/v1/faults/emit-pending-ack"):
      do {
        let result = try await emitPendingAck()
        faults.dropNextIngressAck = false
        return Self.response(status: 200, body: result.merging(["ok": true]) { current, _ in current })
      } catch { return Self.response(status: 500, body: ["error": "ack_failed"]) }
    case ("POST", "/v1/fixtures/ordinary-reply"):
      do {
        let result = try await emitOrdinaryReply()
        return Self.response(status: 200, body: result.merging(["ok": true]) { current, _ in current })
      } catch { return Self.response(status: 500, body: ["error": "ordinary_reply_failed"]) }
    case ("POST", "/v1/fixtures/proactive-message"):
      do {
        let result = try await emitProactiveMessage()
        return Self.response(status: 200, body: result.merging(["ok": true]) { current, _ in current })
      } catch { return Self.response(status: 500, body: ["error": "proactive_message_failed"]) }
    default:
      return Self.response(status: 404, body: ["error": "not_found"])
    }
  }

  private func writeCredentials(port: UInt16) throws {
    let data = try JSONSerialization.data(withJSONObject: ["port": port, "token": token], options: [.prettyPrinted])
    try FileManager.default.createDirectory(at: tokenFile.deletingLastPathComponent(), withIntermediateDirectories: true)
    FileManager.default.createFile(atPath: tokenFile.path, contents: data, attributes: [.posixPermissions: 0o600])
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: tokenFile.path)
  }

  private nonisolated static func response(status: Int, body: [String: Any]) -> Data {
    let payload = (try? JSONSerialization.data(withJSONObject: body)) ?? Data("{}".utf8)
    let reason = status == 200 ? "OK" : "Error"
    var data = Data("HTTP/1.1 \(status) \(reason)\r\nContent-Type: application/json\r\nContent-Length: \(payload.count)\r\nConnection: close\r\n\r\n".utf8)
    data.append(payload)
    return data
  }
}
#endif
