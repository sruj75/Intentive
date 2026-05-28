# Menu bar + settings window only for v1 UI

Intentive is a background service, not a foreground app. The v1 UI surface is: a menu bar icon (status, start/stop capture, open settings, quit) and a settings window (auth, basic config). No persistent main window.

## Consequences

- Auth (sign in / sign up) lives in the settings window, triggered from the menu bar
- AI chat UI (talking to the Agent Runtime directly) is explicitly out of scope for v1
- The Tauri app is configured as a menu bar agent (`LSUIElement = true` equivalent) — no Dock icon
