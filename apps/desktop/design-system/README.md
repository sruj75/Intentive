# Apex Design System — Desktop UI kit

The interactive **Apex Desktop** dashboard mock (dark sidebar + main dashboard panel + AI chatbot
panel). Part of the Apex Design System; the shared visual language (tokens, components, brand rules)
lives at the repo root in [`/design-system`](../../../design-system/readme.md).

Placed here — beside `apps/desktop/macos/` — so a future `apps/desktop/windows/` shares the same kit.

## Files

- `index.html` — entry point; loads shared `styles.css` + `_ds_bundle.js` from `/design-system`
- `Sidebar.jsx` · `MainPanel.jsx` · `ChatPanel.jsx` · `DesktopApp.jsx` — the composed screens

Components are consumed at runtime off `window.ApexDesignSystem_659910` (populated by the shared
`_ds_bundle.js`). To view, serve the **repo root** statically and open
`/apps/desktop/design-system/index.html` (the `../../../design-system/…` paths resolve from root).

See [`/design-system/README-monorepo.md`](../../../design-system/README-monorepo.md) for the full map.
