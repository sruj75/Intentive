import AppKit
import IntentiveDesktopCore
import SwiftUI

@MainActor
final class IntentiveFloatingBarPresenter {
  private let controller: FloatingBarController
  private var panel: NSPanel?
  private var model: IntentiveFloatingBarModel?

  init(controller: FloatingBarController) {
    self.controller = controller
  }

  func show() {
    if let panel {
      panel.orderFrontRegardless()
      panel.makeKey()
      return
    }

    let model = IntentiveFloatingBarModel(controller: controller)
    let rootView = IntentiveFloatingBarView(model: model) { [weak self] in
      self?.hide()
    }

    let panel = NSPanel(
      contentRect: Self.initialFrame(),
      styleMask: [.nonactivatingPanel, .fullSizeContentView],
      backing: .buffered,
      defer: false
    )
    panel.isFloatingPanel = true
    panel.level = .floating
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
    panel.hidesOnDeactivate = false
    panel.isMovableByWindowBackground = true
    panel.backgroundColor = .clear
    panel.isOpaque = false
    panel.hasShadow = true
    panel.titleVisibility = .hidden
    panel.titlebarAppearsTransparent = true
    panel.standardWindowButton(.closeButton)?.isHidden = true
    panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
    panel.standardWindowButton(.zoomButton)?.isHidden = true
    panel.contentView = NSHostingView(rootView: rootView)
    panel.orderFrontRegardless()
    panel.makeKey()

    self.model = model
    self.panel = panel
  }

  func hide() {
    panel?.orderOut(nil)
  }

  func showNudge(_ body: String) {
    show()
    model?.showNudge(body)
  }

  func refreshMessages() {
    model?.refreshMessages()
  }

  private static func initialFrame() -> NSRect {
    let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
    let size = NSSize(width: min(560, screenFrame.width - 48), height: 360)
    return NSRect(
      x: screenFrame.midX - size.width / 2,
      y: screenFrame.maxY - size.height - 32,
      width: size.width,
      height: size.height
    )
  }
}

@MainActor
final class IntentiveFloatingBarModel: ObservableObject {
  @Published var draft = ""
  @Published private(set) var messages: [ChatMessage]
  @Published private(set) var status: String?
  @Published private(set) var nudge: String?

  private let controller: FloatingBarController

  init(controller: FloatingBarController) {
    self.controller = controller
    messages = controller.messages
  }

  func send() {
    do {
      _ = try controller.submit(draft)
      draft = ""
      refreshMessages()
      status = nil
    } catch {
      status = error.localizedDescription
    }
  }

  func refreshMessages() {
    messages = controller.messages
  }

  func showNudge(_ body: String) {
    nudge = body
    status = nil
  }

  func clearNudge() {
    nudge = nil
  }
}

final class FloatingBarOverlaySink: DesktopOverlaySink {
  private let presenter: IntentiveFloatingBarPresenter

  init(presenter: IntentiveFloatingBarPresenter) {
    self.presenter = presenter
  }

  func showNudge(body: String) {
    Task { @MainActor [presenter] in
      presenter.showNudge(body)
    }
  }
}

private struct IntentiveFloatingBarView: View {
  @ObservedObject var model: IntentiveFloatingBarModel
  var onClose: () -> Void
  @FocusState private var inputFocused: Bool

  var body: some View {
    VStack(spacing: 0) {
      topStrip
      Divider()
      nudgeBanner
      transcript
      inputRow
    }
    .frame(minWidth: 420, minHeight: 260)
    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .stroke(Color(nsColor: .separatorColor).opacity(0.55), lineWidth: 0.5)
    )
    .onAppear {
      model.refreshMessages()
      inputFocused = true
    }
  }

  private var topStrip: some View {
    HStack(spacing: 10) {
      Image(systemName: "text.bubble")
        .foregroundStyle(.secondary)
      Text("Intentive")
        .font(.headline)
      Spacer()
      Button(action: onClose) {
        Image(systemName: "xmark")
      }
      .buttonStyle(.plain)
      .keyboardShortcut(.escape, modifiers: [])
    }
    .padding(.horizontal, 14)
    .frame(height: 44)
    .contentShape(Rectangle())
  }

  private var transcript: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 10) {
          if model.messages.isEmpty {
            emptyState
          } else {
            ForEach(model.messages) { message in
              messageBubble(message)
                .id(message.id)
            }
          }
        }
        .padding(14)
      }
      .onChange(of: model.messages.count) { _, _ in
        guard let last = model.messages.last else { return }
        withAnimation(.easeOut(duration: 0.18)) {
          proxy.scrollTo(last.id, anchor: .bottom)
        }
      }
    }
  }

  @ViewBuilder
  private var nudgeBanner: some View {
    if let nudge = model.nudge {
      HStack(spacing: 8) {
        Image(systemName: "bell.badge")
          .foregroundStyle(.secondary)
        Text(nudge)
          .font(.callout)
          .lineLimit(2)
        Spacer()
        Button(action: model.clearNudge) {
          Image(systemName: "xmark.circle.fill")
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
      }
      .padding(.horizontal, 14)
      .padding(.vertical, 10)
      .background(Color.accentColor.opacity(0.12))
      .transition(.move(edge: .top).combined(with: .opacity))
    }
  }

  private var inputRow: some View {
    VStack(alignment: .leading, spacing: 6) {
      if let status = model.status {
        Text(status)
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      HStack(spacing: 10) {
        TextField("Ask Intentive", text: $model.draft, axis: .vertical)
          .textFieldStyle(.plain)
          .lineLimit(1...4)
          .focused($inputFocused)
          .onSubmit(model.send)

        Button(action: model.send) {
          Image(systemName: "paperplane.fill")
        }
        .buttonStyle(.borderedProminent)
        .keyboardShortcut(.return, modifiers: [.command])
      }
      .padding(10)
      .background(Color(nsColor: .controlBackgroundColor).opacity(0.9), in: RoundedRectangle(cornerRadius: 10))
    }
    .padding([.horizontal, .bottom], 14)
  }

  private var emptyState: some View {
    VStack(spacing: 10) {
      Image(systemName: "sparkle.magnifyingglass")
        .font(.title2)
        .foregroundStyle(.secondary)
      Text("No messages yet.")
        .font(.callout)
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, minHeight: 150)
  }

  private func messageBubble(_ message: ChatMessage) -> some View {
    HStack {
      if message.author == .companion {
        bubbleContent(message, alignment: .leading)
        Spacer(minLength: 60)
      } else {
        Spacer(minLength: 60)
        bubbleContent(message, alignment: .trailing)
      }
    }
  }

  private func bubbleContent(_ message: ChatMessage, alignment: HorizontalAlignment) -> some View {
    VStack(alignment: alignment, spacing: 4) {
      Text(message.body)
        .font(.body)
      Text(message.author.rawValue.capitalized)
        .font(.caption2)
        .foregroundStyle(.secondary)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .background(
      message.author == .companion
        ? Color(nsColor: .controlBackgroundColor).opacity(0.9)
        : Color.accentColor.opacity(0.2),
      in: RoundedRectangle(cornerRadius: 10, style: .continuous)
    )
  }
}
