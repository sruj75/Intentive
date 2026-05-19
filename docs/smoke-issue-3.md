# Issue #3 smoke check — Intentive menu bar shell

Manual walkthrough that proves the four-state menu bar shell behaves correctly. Run from the repo root.

```bash
npm run tauri dev
```

The build will compile, launch Tauri, and bring up the dev frontend. **No window should appear on launch**, and the macOS Dock should not show an Intentive icon (LSUIElement / Accessory activation policy).

## Walk the states

1. **Unauthenticated (initial)** — `menu-icon-idle` icon in the menu bar. Click it.
   - Menu shows:
     - **Unauthenticated** (clickable)
     - Open Settings… (grayed)
     - Quit Intentive (grayed)

2. **Sign in via the menu** — Click **Unauthenticated**.
   - The Settings window opens on the `?surface=sign-in` route — heading reads "Sign In", with the ADR-0009 consent copy.
   - The tray icon switches to `menu-icon-capturing`.
   - Reopen the menu — it now shows:
     - **Stop Capturing** (clickable)
     - Open Settings… (clickable)
     - Quit Intentive (clickable)

3. **Toggle off → on** — Click **Stop Capturing**.
   - Tray icon returns to `menu-icon-idle`.
   - Reopen menu: the toggle label is now **Start Capturing**.
   - Click **Start Capturing**.
   - Tray icon switches back to `menu-icon-capturing`.

4. **Settings surface** — Click **Open Settings…**.
   - The same window opens, this time with no `?surface` query — heading reads "Settings".

5. **Error state (debug-only command)** — In the Tauri dev console (settings window devtools), run:

   ```js
   __TAURI_INTERNALS__.invoke("simulate_error");
   ```

   - Tray icon switches to `menu-icon-error`.
   - Reopen menu:
     - "Simulated error for smoke test" (non-clickable info text)
     - Open Settings… (clickable)
     - Quit Intentive (clickable)
     - **No toggle item.**

6. **Quit cleanly** — Click **Quit Intentive** (or press ⌘Q while the Settings window has focus).
   - The process exits. No background ScreenPipe to clean up in this slice.

## Out of scope for this smoke check

- Real ScreenPipe spawn on Capturing state (covered by Issue #5).
- Real auth provider behind the consent screen (a later auth issue).
- Session End Marker emission on stop (covered by Issue #8 / heartbeat).
- Distinct capturing/error tray visuals — all three states currently use the same `menu-icon-*.png` brain asset.
