import AppKit
import ApplicationServices
import Foundation

guard CommandLine.arguments.count == 2, let pid = pid_t(CommandLine.arguments[1]) else {
  fputs("usage: SparkleUpdateProbe PID\n", stderr)
  exit(64)
}
guard AXIsProcessTrusted() else {
  fputs("Accessibility permission is required for the Sparkle update probe.\n", stderr)
  exit(77)
}

let app = AXProbeApplication(pid: pid)
app.activate()
guard app.openStatusMenu() else {
  fputs("Sparkle update probe could not find the status item.\n", stderr)
  exit(1)
}
guard let update = app.findLast(id: "menu-check-updates") ?? app.find(title: "Check for Updates…")
else {
  fputs("Sparkle update probe could not find \"Check for Updates…\".\n", stderr)
  exit(1)
}
app.press(update)

let installTitles = ["Install Update", "Install and Relaunch", "Install on Quit"]
guard
  let outcome = app.wait(60, for: {
    for title in installTitles {
      if let hit = app.find(title: title) { return hit }
    }
    return app.find(title: "You're up to date!")
      ?? app.find(title: "You’re up to date!")
      ?? app.find(title: "Update Error!")
  })
else {
  fputs("Sparkle update probe timed out waiting for a result.\n", stderr)
  exit(1)
}

let outcomeTitle = app.text(outcome)
guard installTitles.contains(outcomeTitle) else {
  fputs("Sparkle did not offer to install an update; outcome: \(outcomeTitle)\n", stderr)
  exit(1)
}
app.press(outcome)
print("Sparkle update probe pressed \"\(outcomeTitle)\".")
