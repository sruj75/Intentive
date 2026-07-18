import AppKit
import SwiftUI

@MainActor
final class FeedbackWindow {
  private static var window: NSWindow?

  static func show(model: DesktopViewModel) {
    window?.close()
    let view = FeedbackView(
      initialEmail: model.accountEmail ?? "",
      submit: model.submitIssueReport,
      save: model.saveIssueDiagnostics
    ) { window?.close(); window = nil }
    let next = NSWindow(contentViewController: NSHostingController(rootView: view))
    next.title = "Report Issue"
    next.styleMask = [.titled, .closable]
    next.setContentSize(NSSize(width: 440, height: 340))
    next.center()
    next.level = .floating
    next.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    window = next
  }
}

private struct FeedbackView: View {
  let submit: (String, String, String) throws -> Void
  let save: (URL) throws -> URL
  let dismiss: () -> Void
  @State private var message = ""
  @State private var name = ""
  @State private var email: String
  @State private var result: Result<Void, Error>?

  init(
    initialEmail: String,
    submit: @escaping (String, String, String) throws -> Void,
    save: @escaping (URL) throws -> URL,
    dismiss: @escaping () -> Void
  ) {
    self.submit = submit
    self.save = save
    self.dismiss = dismiss
    _email = State(initialValue: initialEmail)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Report an Issue").font(.headline)
      Text("Only privacy-filtered operational diagnostics are attached. Screen text, titles, transcripts, conversations, tokens, and local paths are excluded.")
        .font(.caption).foregroundStyle(.secondary)
      TextEditor(text: $message).frame(minHeight: 100).border(.quaternary)
        .accessibilityIdentifier("report-issue-message")
      HStack {
        TextField("Name (optional)", text: $name)
          .accessibilityIdentifier("report-issue-name")
        TextField("Email (optional)", text: $email)
          .accessibilityIdentifier("report-issue-email")
      }
      if let result {
        Text(resultMessage(result)).font(.caption)
          .foregroundStyle(result.isSuccess ? Color.green : Color.red)
          .accessibilityIdentifier("report-issue-result")
      }
      HStack {
        Button("Cancel", action: dismiss).keyboardShortcut(.cancelAction)
          .accessibilityIdentifier("report-issue-cancel")
        Button("Save Diagnostics…", action: saveOffline)
          .accessibilityIdentifier("report-issue-save-diagnostics")
        Spacer()
        Button("Send Report", action: send)
          .keyboardShortcut(.defaultAction)
          .accessibilityIdentifier("report-issue-send")
      }
    }
    .padding(20)
    .frame(width: 440, height: 340)
  }

  private func send() {
    do { try submit(message, name, email); result = .success(()) }
    catch { result = .failure(error) }
  }

  private func saveOffline() {
    let panel = NSSavePanel()
    panel.title = "Save Diagnostics"
    panel.nameFieldStringValue = "Intentive-Diagnostics"
    guard panel.runModal() == .OK, let parent = panel.url?.deletingLastPathComponent() else { return }
    do {
      let exported = try save(parent)
      NSWorkspace.shared.activateFileViewerSelecting([exported])
      result = .success(())
    } catch { result = .failure(error) }
  }

  private func resultMessage(_ result: Result<Void, Error>) -> String {
    switch result { case .success: return "Report ready."; case .failure(let error): return error.localizedDescription }
  }
}

private extension Result where Success == Void, Failure == Error {
  var isSuccess: Bool { if case .success = self { return true }; return false }
}
