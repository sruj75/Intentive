# Apex Design System — monorepo layout

This repository hosts the **Apex Design System** (imported from the Claude Design project
`Apex Design System`, id `659910d9-3031-4c87-a7fc-1ab053745487`). The system is split by owner so
each deployable keeps its own interactive kit next to its code, while the shared visual language
lives once at the repo root.

> This is a **reference / source-of-truth** kit — it is not wired into any app build yet. The intent
> is to have the tokens, components, and brand rules available to embody later. See
> [`readme.md`](readme.md) for the full brand write-up (voice, color, neumorphism, iconography, etc).

## Where things live

| Location | Contents | Notes |
| --- | --- | --- |
| `/design-system/` (here) | **Global foundation** — `tokens/`, `components/`, `guidelines/`, `assets/` (Lucide icons), `styles.css`, `readme.md`, `SKILL.md`, `_ds_*` | The shared language. Both platform kits load `styles.css` + `_ds_bundle.js` from here. |
| `apps/desktop/design-system/` | **Desktop UI kit** — `index.html` + `Sidebar/MainPanel/ChatPanel/DesktopApp.jsx` | Sits beside `apps/desktop/macos/` so a future `apps/desktop/windows/` shares the same kit. |
| `apps/mobile/design-system/` | **Mobile UI kit** — `index.html` + `ios-frame/DashboardScreen/ProgressScreen/ChatScreen/MobileApp.jsx` | The interactive iOS mock (Dashboard · Progress · AI Chat). |

The two platform `index.html` files reference the shared root via relative paths
(`../../../design-system/styles.css` and `../../../design-system/_ds_bundle.js`) — the only edit made
during the split. Everything else is verbatim from the Design project.

## Viewing the interactive kits

Open either `index.html` through a local static server rooted at the **repo root** (so the
`../../../design-system/…` paths resolve), e.g.:

```bash
npx serve .        # from repo root
# then open /apps/desktop/design-system/index.html or /apps/mobile/design-system/index.html
```

`_ds_bundle.js` is the Claude Design preview runtime that exposes every component on
`window.ApexDesignSystem_659910`; the component `*.card.html` specimens and both kits depend on it.

## Reference screenshots

`assets/reference/` holds the source screenshots this system was derived from — `mobile-screens.png`,
`desktop-dashboard-flat.png`, and `desktop-dashboard-framed.png`. These couldn't be pulled through the
design MCP (they exceed its 256 KiB per-file read cap) and were instead supplied directly by the user
and converted from webp. `desktop-dashboard-framed.png` is a copy of the flat shot (a distinct framed
render wasn't provided). See [`assets/reference/README.md`](assets/reference/README.md).

## Re-syncing from the Design project

Everything here is a snapshot. To refresh against the upstream Claude Design project, use the
`/design-sync` skill with project id `659910d9-3031-4c87-a7fc-1ab053745487` — but note that skill syncs
**local → remote**; pulling remote → local (as done for this import) is a manual `get_file` pass.
