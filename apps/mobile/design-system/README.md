# Apex Design System — Mobile UI kit

The interactive **Apex Mobile** iOS mock (Dashboard · Progress · AI Chat on a bottom tab bar, inside
an iOS 26 device frame). Part of the Apex Design System; the shared visual language (tokens,
components, brand rules) lives at the repo root in
[`/design-system`](../../../design-system/readme.md).

## Files

- `index.html` — entry point; loads shared `styles.css` + `_ds_bundle.js` from `/design-system`
- `ios-frame.jsx` — iOS 26 (Liquid Glass) device frame scaffold
- `DashboardScreen.jsx` · `ProgressScreen.jsx` · `ChatScreen.jsx` · `MobileApp.jsx` — the screens + tab shell

Components are consumed at runtime off `window.ApexDesignSystem_659910` (populated by the shared
`_ds_bundle.js`). To view, serve the **repo root** statically and open
`/apps/mobile/design-system/index.html` (the `../../../design-system/…` paths resolve from root).

See [`/design-system/README-monorepo.md`](../../../design-system/README-monorepo.md) for the full map.
