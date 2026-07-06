import IntentiveDesktopCore
import SwiftUI

private enum DesktopSection: String, CaseIterable, Identifiable {
  case home = "Home"
  case screenMemory = "Screen Memory"
  case chat = "Floating Chat"
  case voice = "Voice"
  case effects = "Effects"
  case settings = "Settings"

  var id: String { rawValue }

  var symbol: String {
    switch self {
    case .home: return "rectangle.grid.2x2"
    case .screenMemory: return "clock.arrow.circlepath"
    case .chat: return "text.bubble"
    case .voice: return "waveform"
    case .effects: return "bell.badge"
    case .settings: return "gearshape"
    }
  }
}

@MainActor
private final class DesktopViewModel: ObservableObject {
  @Published var selected: DesktopSection = .home
  @Published var query = ""
  @Published var input = ""
  @Published var status: String
  @Published var effectLog: [String] = []

  let messageStore = MessageStore()
  let screenMemory: ScreenMemoryStore
  private lazy var runtime = PreviewRuntimeClient(messageStore: messageStore)
  private lazy var compiler = ContextCompiler()
  private lazy var publisher = PerceptionPublisher(runtimeClient: runtime)
  private lazy var capture = CaptureCoordinator(
    compiler: compiler,
    screenMemory: screenMemory,
    publisher: publisher
  )

  var messages: [ChatMessage] {
    messageStore.messages
  }

  var searchResults: [ScreenMemorySearchResult] {
    screenMemory.search(query, limit: 24)
  }

  init() {
    do {
      screenMemory = try SQLiteScreenMemoryStore(databaseURL: SQLiteScreenMemoryStore.applicationSupportURL())
      status = "Local Screen Memory ready"
    } catch {
      screenMemory = InMemoryScreenMemoryStore()
      status = "Screen Memory fallback: \(error.localizedDescription)"
    }
    seed()
  }

  func captureSample() {
    do {
      let frame = CapturedFrame(
        id: UUID().uuidString,
        capturedAt: Date().protocolTimestamp,
        appName: "Code",
        windowTitle: "Intentive Desktop",
        ocrText: "Implementing the Intentive desktop runtime bridge and Screen Memory compiler."
      )
      let events = try capture.accept(frame: frame)
      status = "Published \(events.count) perception event(s)"
      objectWillChange.send()
    } catch {
      status = "Capture failed: \(error.localizedDescription)"
    }
  }

  func sendMessage() {
    let body = input.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !body.isEmpty else { return }
    do {
      _ = try runtime.sendUserMessage(body)
      input = ""
      status = "Message queued to Runtime Bridge"
      objectWillChange.send()
    } catch {
      status = "Send failed: \(error.localizedDescription)"
    }
  }

  func triggerEffect() {
    let notifications = RecordingNotificationSink()
    let overlay = RecordingOverlaySink()
    let runner = EffectRunner(notifications: notifications, overlay: overlay, runtimeClient: runtime)
    let message = CompanionMessage(
      messageId: "pmb-\(UUID().uuidString)",
      body: "Take a quick reset before the next desktop phase.",
      emittedAt: Date().protocolTimestamp,
      viaPostMessageBack: true
    )
    do {
      try runner.handle(message)
      effectLog.append(contentsOf: notifications.delivered.map { "\($0.title): \($0.body)" })
      status = "Effect Runner delivered a local nudge"
    } catch {
      status = "Effect failed: \(error.localizedDescription)"
    }
  }

  private func seed() {
    screenMemory.add(
      ScreenMemoryRecord(
        id: "seed-1",
        capturedAt: Date().protocolTimestamp,
        appName: "Safari",
        windowTitle: "Intentive plan",
        summary: "Reviewing the Screen Memory and Runtime Bridge renovation plan.",
        ocrText: "Screen Memory Runtime Bridge Effect Runner"
      )
    )
  }
}

private final class PreviewRuntimeClient: RuntimeChatClient {
  private let messageStore: MessageStore
  private(set) var perceptionEvents: [PerceptionEvent] = []
  private(set) var acknowledgements: [String] = []

  init(messageStore: MessageStore) {
    self.messageStore = messageStore
  }

  @discardableResult
  func sendUserMessage(_ body: String) throws -> ChatMessage {
    let sentAt = Date().protocolTimestamp
    let user = UserMessage(messageId: "desktop-preview-\(UUID().uuidString)", body: body, sentAt: sentAt)
    let rendered = messageStore.appendPending(user)
    messageStore.confirmUserMessage(user.messageId)
    messageStore.appendCompanion(
      CompanionMessage(
        messageId: "companion-preview-\(UUID().uuidString)",
        body: "Received on the shared Companion thread: \(body)",
        emittedAt: Date().protocolTimestamp
      )
    )
    return rendered
  }

  func sendPerceptionEvent(_ event: PerceptionEvent) throws {
    perceptionEvents.append(event)
  }

  func acknowledge(messageId: String) throws {
    acknowledgements.append(messageId)
  }
}

struct MainWindowView: View {
  @StateObject private var model = DesktopViewModel()
  @FocusState private var searchFocused: Bool

  var body: some View {
    NavigationSplitView {
      List(selection: $model.selected) {
        Section("Desktop") {
          ForEach(DesktopSection.allCases) { section in
            Label(section.rawValue, systemImage: section.symbol)
              .tag(section)
          }
        }
      }
      .navigationSplitViewColumnWidth(min: 210, ideal: 230, max: 260)
    } detail: {
      VStack(spacing: 0) {
        topBar
        Divider()
        content
      }
      .background(Color(nsColor: .windowBackgroundColor))
    }
    .onReceive(NotificationCenter.default.publisher(for: .intentiveFocusScreenMemorySearch)) { _ in
      model.selected = .screenMemory
      searchFocused = true
    }
  }

  private var topBar: some View {
    HStack(spacing: 12) {
      Label(model.selected.rawValue, systemImage: model.selected.symbol)
        .font(.headline)
      Spacer()
      Text(model.status)
        .font(.caption)
        .foregroundStyle(.secondary)
      Button {
        model.captureSample()
      } label: {
        Label("Capture", systemImage: "camera.viewfinder")
      }
      .keyboardShortcut("n", modifiers: [.command])
    }
    .padding(.horizontal, 18)
    .frame(height: 50)
  }

  @ViewBuilder
  private var content: some View {
    switch model.selected {
    case .home:
      HomeView(capture: model.captureSample)
    case .screenMemory:
      ScreenMemoryView(model: model, searchFocused: $searchFocused)
    case .chat:
      FloatingChatView(model: model)
    case .voice:
      VoiceView()
    case .effects:
      EffectsView(model: model)
    case .settings:
      SettingsView()
    }
  }
}

private struct HomeView: View {
  let capture: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 20) {
      Text("Intentive Desktop")
        .font(.largeTitle.bold())
      Text("Capture stays local. The Context Compiler publishes compact perception events, and Desktop joins the same Companion conversation as mobile.")
        .font(.body)
        .foregroundStyle(.secondary)
        .frame(maxWidth: 660, alignment: .leading)
      HStack {
        Button(action: capture) {
          Label("Capture Sample", systemImage: "camera.viewfinder")
        }
        Button {} label: {
          Label("Open Floating Bar", systemImage: "text.bubble")
        }
      }
      Spacer()
    }
    .padding(28)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

private struct ScreenMemoryView: View {
  @ObservedObject var model: DesktopViewModel
  var searchFocused: FocusState<Bool>.Binding

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        Image(systemName: "magnifyingglass")
          .foregroundStyle(.secondary)
        TextField("Search Screen Memory", text: $model.query)
          .textFieldStyle(.plain)
          .focused(searchFocused)
      }
      .padding(10)
      .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))

      List(model.searchResults, id: \.record.id) { result in
        VStack(alignment: .leading, spacing: 4) {
          HStack {
            Text(result.record.appName)
              .font(.headline)
            Spacer()
            Text(result.record.capturedAt)
              .font(.caption)
              .foregroundStyle(.secondary)
          }
          Text(result.record.summary)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 6)
      }
    }
    .padding(18)
  }
}

private struct FloatingChatView: View {
  @ObservedObject var model: DesktopViewModel

  var body: some View {
    VStack(spacing: 12) {
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 10) {
          ForEach(model.messages) { message in
            HStack {
              if message.author == .companion {
                bubble(message, alignment: .leading)
                Spacer(minLength: 80)
              } else {
                Spacer(minLength: 80)
                bubble(message, alignment: .trailing)
              }
            }
          }
        }
        .padding()
      }
      HStack {
        TextField("Ask Intentive", text: $model.input)
          .textFieldStyle(.roundedBorder)
          .onSubmit(model.sendMessage)
        Button(action: model.sendMessage) {
          Image(systemName: "paperplane.fill")
        }
        .buttonStyle(.borderedProminent)
      }
      .padding([.horizontal, .bottom])
    }
  }

  private func bubble(_ message: ChatMessage, alignment: HorizontalAlignment) -> some View {
    VStack(alignment: alignment, spacing: 4) {
      Text(message.body)
      Text(message.author.rawValue.capitalized)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
    .padding(10)
    .background(message.author == .companion ? Color(nsColor: .controlBackgroundColor) : Color.accentColor.opacity(0.18))
    .clipShape(RoundedRectangle(cornerRadius: 8))
  }
}

private struct VoiceView: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Label("Push-to-talk pipeline", systemImage: "waveform")
        .font(.title2)
      Text("Global shortcut, local voice activity detection, local transcription, then a normal user_message into the Runtime Bridge.")
        .foregroundStyle(.secondary)
      Spacer()
    }
    .padding(24)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

private struct EffectsView: View {
  @ObservedObject var model: DesktopViewModel

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Button(action: model.triggerEffect) {
        Label("Trigger PMB Nudge", systemImage: "bell.badge")
      }
      List(model.effectLog, id: \.self) { item in
        Text(item)
      }
    }
    .padding(20)
  }
}

private struct SettingsView: View {
  var body: some View {
    Form {
      Toggle("Capture enabled", isOn: .constant(true))
      Toggle("Voice replies", isOn: .constant(false))
      Text("Provider API keys are not stored on this Mac.")
        .foregroundStyle(.secondary)
    }
    .padding(24)
  }
}
