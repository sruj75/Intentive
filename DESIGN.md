# Intentive Design System

**Platform foundation:** Apple Human Interface Guidelines — macOS 26 Tahoe / iOS 26  
**Brand layer:** Intentive — editorial voice-AI product  
**Primary target:** macOS desktop (Electron / Tauri)

---

## Overview

Intentive reads like a **quietly editorial print magazine that happens to be a voice-AI product**. The base canvas is off-white `{colors.canvas}` (#f5f5f5) holding warm near-black ink `{colors.ink}` (#0c0a09). The brand voltage is **photographic, not chromatic**: soft pastel atmospheric gradient orbs (mint, peach, lavender, sky, rose) drift through the page as the only "color" moments. There is no neon accent, no saturated CTA color, no dark-canvas dev-tools atmosphere.

Type pairs **Waldenburg Light** (custom serif at weight 300) for display with **Inter** for body, navigation, captions. The display weight at 300 is the editorial signature — never bold, never heavy.

CTAs are subtle: a near-black ink pill (`{component.button-primary}`) is the primary, a transparent outline (`{component.button-outline}`) is the secondary. The brand trusts atmospheric photography and modest type weights to carry all brand work.

---

## B1. Brand Atmosphere & Voice

**Mood:** Quiet editorial authority. Off-white canvas, warm ink, pastel atmospheric depth — the feeling of a premium print product running on a computer.

**What makes it Intentive, not generic Apple:**
- The canvas is `#f5f5f5` (warm off-white), not Apple's cool `#F2F2F7`
- Display type is Waldenburg Light at 300 — a serif at low weight, intentionally un-bold
- The only color moments are pastel gradient orbs — never button fills, never text
- The primary CTA is near-black ink, not system blue
- Section rhythm is 96px — editorial magazine pacing, not app-density pacing

**What the Apple foundation provides:**  
Window chrome, native controls, Liquid Glass chrome, keyboard nav, traffic lights, sidebar/toolbar geometry — all unchanged. The brand sits inside the content layer, not the navigation chrome.

---

## B2. Brand Color Tokens

### Primary Action
| Token | Hex | Role |
|---|---|---|
| `{colors.primary}` | `#292524` | Ink pill — the one and only CTA fill |
| `{colors.primary-active}` | `#0c0a09` | Press state for ink pill |
| `{colors.on-primary}` | `#ffffff` | Text on ink pill |

### Surface
| Token | Hex | Role |
|---|---|---|
| `{colors.canvas}` | `#f5f5f5` | Off-white page floor — primary background |
| `{colors.canvas-soft}` | `#fafafa` | Lighter alternating section band |
| `{colors.canvas-deep}` | `#0c0a09` | Rare dark-mode hero (Agents page) |
| `{colors.surface-card}` | `#ffffff` | Pure white card |
| `{colors.surface-strong}` | `#f0efed` | Badges, voice-icon plates |
| `{colors.surface-dark}` | `#0c0a09` | Dark hero / CTA band |
| `{colors.surface-dark-elevated}` | `#1c1917` | Cards on dark canvas |

### Hairlines
| Token | Hex | Role |
|---|---|---|
| `{colors.hairline}` | `#e7e5e4` | Default 1px divider |
| `{colors.hairline-soft}` | `#f0efed` | Lighter divider |
| `{colors.hairline-strong}` | `#d6d3d1` | Panel outline, input border |

### Text
| Token | Hex | Role |
|---|---|---|
| `{colors.ink}` | `#0c0a09` | Display, primary text |
| `{colors.body}` | `#4e4e4e` | Default running copy |
| `{colors.body-strong}` | `#292524` | Emphasized body |
| `{colors.muted}` | `#777169` | Sub-titles, secondary labels |
| `{colors.muted-soft}` | `#a8a29e` | Disabled, placeholder |
| `{colors.on-dark}` | `#ffffff` | Text on dark hero |
| `{colors.on-dark-soft}` | `#a8a29e` | Muted off-white on dark hero |

### Atmospheric Gradient Stops (signature — decoration only)
| Token | Hex | Personality |
|---|---|---|
| `{colors.gradient-mint}` | `#a7e5d3` | Fresh, calm |
| `{colors.gradient-peach}` | `#f4c5a8` | Warm, inviting |
| `{colors.gradient-lavender}` | `#c8b8e0` | Soft, thoughtful |
| `{colors.gradient-sky}` | `#a8c8e8` | Open, clear |
| `{colors.gradient-rose}` | `#e8b8c4` | Gentle, human |

These appear **only** as soft radial-gradient atmospheric orbs inside `{component.gradient-orb-card}` and as background blooms behind hero copy. **Never** as button fills, text colors, or component backgrounds.

### Semantic
| Token | Hex | Role |
|---|---|---|
| `{colors.semantic-success}` | `#16a34a` | Confirmation |
| `{colors.semantic-error}` | `#dc2626` | Validation errors |

---

## B3. Brand Typography

### Font Families

**Waldenburg Light** — licensed display serif at weight 300. The editorial signature. Never bold.  
Fallback: `'EB Garamond', 'Times New Roman', serif`

**Inter** — body, navigation, captions, buttons, all UI chrome.  
Fallback: `sans-serif`

### Type Scale

| Token | Font | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|---|
| `{typography.display-mega}` | Waldenburg | 64px | 300 | 1.05 | −1.92px | Homepage hero h1 |
| `{typography.display-xl}` | Waldenburg | 48px | 300 | 1.08 | −0.96px | Subsidiary heroes |
| `{typography.display-lg}` | Waldenburg | 36px | 300 | 1.17 | −0.36px | Section heads |
| `{typography.display-md}` | Waldenburg | 32px | 300 | 1.13 | −0.32px | Sub-section heads |
| `{typography.display-sm}` | Waldenburg | 24px | 300 | 1.2 | 0 | Card group titles |
| `{typography.title-md}` | Inter | 20px | 500 | 1.35 | 0 | Component titles |
| `{typography.title-sm}` | Inter | 18px | 500 | 1.44 | +0.18px | List labels |
| `{typography.body-md}` | Inter | 16px | 400 | 1.5 | +0.16px | Default body |
| `{typography.body-strong}` | Inter | 16px | 500 | 1.5 | +0.16px | Emphasized body |
| `{typography.body-sm}` | Inter | 15px | 400 | 1.47 | +0.15px | Footer body |
| `{typography.caption}` | Inter | 14px | 400 | 1.5 | 0 | Photo captions |
| `{typography.caption-uppercase}` | Inter | 12px | 600 | 1.4 | +0.96px | Section labels, badges |
| `{typography.button}` | Inter | 15px | 500 | 1.0 | 0 | CTA pill label |
| `{typography.nav-link}` | Inter | 15px | 500 | 1.4 | 0 | Top-nav menu |

### Typography Principles

- **Display stays at weight 300.** Waldenburg Light is the editorial signature. Bolding shifts the voice from editorial to consumer-marketing.
- **Negative tracking on display.** Waldenburg pulls −0.32px to −1.92px tighter at display sizes — polished, premium.
- **Subtle positive tracking on body.** Inter at +0.15–0.18px — slightly looser than default Inter for a more editorial feel.
- **Never swap fonts.** Waldenburg for display headings only. Inter for everything else.

---

## B4. Brand Layout & Spacing

### Spacing Tokens

| Token | Value | Use |
|---|---|---|
| `{spacing.xxs}` | 4px | Micro-gaps, badge offsets |
| `{spacing.xs}` | 8px | Tight internal padding |
| `{spacing.sm}` | 12px | Cell vertical padding |
| `{spacing.base}` | 16px | Standard horizontal inset |
| `{spacing.md}` | 20px | Window corner margin |
| `{spacing.lg}` | 24px | Card padding, section sub-spacing |
| `{spacing.xl}` | 32px | Card generous padding, hero breathing |
| `{spacing.xxl}` | 48px | Large section breathing room |
| `{spacing.section}` | 96px | **Editorial section rhythm** — the brand's primary vertical cadence |

### Grid & Container

- Max content width: **1200px**
- Column grid: 12-column editorial grid at desktop
- Feature card grids: 2-up (hero splits), 3-up (benefit grids)
- Footer: 5-column at desktop
- Section padding: `{spacing.section}` (96px) top and bottom on every band
- Card gaps within a band: `{spacing.base}` – `{spacing.lg}` (16–24px)

### Responsive Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 640px | Hero h1 64→32px; cards 1-up; nav hamburger; orbs shrink |
| Tablet | 640–1024px | Hero h1 48px; cards 2-up |
| Desktop | 1024–1280px | Full 64px hero; cards 3-up |
| Wide | > 1280px | Content caps at 1200px |

---

## B5. Brand Component Tokens

### Buttons

**`{component.button-primary}`** — Near-black ink pill.  
Background `{colors.primary}` (#292524) · Text `{colors.on-primary}` (#fff) · Font `{typography.button}` · Padding 10px × 20px · Height 40px · Radius `{rounded.pill}`

**`{component.button-primary-active}`** — Press state.  
Background `{colors.primary-active}` (#0c0a09)

**`{component.button-outline}`** — Transparent pill, ink border.  
Background transparent · Text `{colors.ink}` · Border 1px `{colors.hairline-strong}` · Same sizing as primary

**`{component.button-tertiary-text}`** — Inline text link.  
Text `{colors.ink}` · No border · No background

### Hero & Atmospheric

**`{component.hero-band}`** — Full-width display section.  
Background `{colors.canvas}` · Headline `{typography.display-mega}` · Subhead `{typography.body-md}` · Atmospheric gradient orb behind headline · Two CTAs below

**`{component.gradient-orb-card}`** — Atmospheric depth card.  
Background `{colors.canvas-soft}` · Radius `{rounded.xxl}` (24px) · Padding 32px · One radial gradient orb from `{colors.gradient-*}` tokens, centered, no content inside the orb itself

### Cards

**`{component.feature-card}`** — Content card (2-up or 3-up grid).  
Background `{colors.surface-card}` · Radius `{rounded.xl}` · Padding 24px · 1px `{colors.hairline}` border

**`{component.testimonial-card}`** — Quote card.  
Background `{colors.surface-card}` · Text `{colors.body}` · Radius `{rounded.xl}` · Padding 32px

**`{component.pricing-tier-card}`** — Pricing card (light).  
Background `{colors.surface-card}` · Radius `{rounded.xl}` · Padding 32px · 1px `{colors.hairline}` border

**`{component.pricing-tier-featured}`** — Featured pricing (dark inversion).  
Background `{colors.surface-dark}` · Text `{colors.on-dark}` · Same shape

### Voice Library

**`{component.voice-row}`** — List row.  
Background transparent · 1px `{colors.hairline}` divider · 32px circular voice icon left · name + accent stack · optional preview button trailing

**`{component.voice-icon-circular}`** — 32px Ø circle.  
Background `{colors.surface-strong}` · Radius `{rounded.full}` · Initials or voice glyph

### Forms & Tags

**`{component.text-input}`** — Text input.  
Background `{colors.surface-card}` · Radius `{rounded.md}` (8px) · Padding 12px × 16px · Height 44px · 1px `{colors.hairline-strong}` border · Focus: 2px `{colors.ink}` border

**`{component.badge-pill}`** — Label badge.  
Background `{colors.surface-strong}` · Font `{typography.caption-uppercase}` · Radius `{rounded.pill}` · Padding 4px × 10px

### Navigation

**`{component.top-nav}`** — App navigation bar.  
Background `{colors.canvas}` · Text `{colors.ink}` · Height 64px · Wordmark left · Primary nav center · Sign In + CTA right

### CTA & Footer

**`{component.cta-band}`** — Pre-footer CTA section.  
Background `{colors.canvas}` · Headline `{typography.display-lg}` · Single ink pill CTA · 96px padding

**`{component.footer}`** — Closing footer.  
Background `{colors.canvas}` · Text `{colors.body}` · 5-column links · Padding 64px × 48px

---

## B6. Brand Shapes & Elevation

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | Reserved |
| `{rounded.xs}` | 4px | Inline tags |
| `{rounded.sm}` | 6px | Compact rows |
| `{rounded.md}` | 8px | Form inputs |
| `{rounded.lg}` | 12px | Compact cards |
| `{rounded.xl}` | 16px | Feature cards, pricing tiers |
| `{rounded.xxl}` | 24px | Gradient orb cards |
| `{rounded.pill}` | 9999px | All CTA buttons, badges |
| `{rounded.full}` | 9999px | Voice icon circles, avatars |

### Elevation

| Level | Treatment | Use |
|---|---|---|
| Flat | `{colors.canvas}` #f5f5f5 | Body bands, footer |
| Card | `{colors.surface-card}` #ffffff | Content cards |
| Hairline border | 1px `{colors.hairline}` | Card outlines |
| Soft drop | `0 4px 16px rgba(0,0,0,0.04)` | Hovered cards only |
| Gradient orb | Radial `{colors.gradient-*}` | Atmospheric depth — never a card surface |

Atmospheric depth comes from gradient orbs, not from stacked shadows. The system uses **hairline + whisper-soft drop** — never heavy elevation.

---

## B7. Do's & Don'ts

### Do
- Reserve `{colors.primary}` (ink pill) for primary CTAs only — one per view
- Use Waldenburg Light at weight 300 for every display headline — never bold
- Use Inter at +0.15–0.18px tracking for body — the editorial dialect
- Use atmospheric gradient orbs (mint / peach / lavender / sky / rose) as decoration only
- Use `{rounded.pill}` for every CTA and badge
- Respect 96px section rhythm for editorial pacing

### Don't
- Don't introduce a saturated brand action color — ink pill is the only CTA color
- Don't bold display copy — weight 300 is the editorial voice; bolding shifts to consumer-marketing
- Don't use gradient orbs as button fills, text colors, or component backgrounds — pure atmosphere only
- Don't use `{rounded.none}` on CTAs — pill geometry is the brand button
- Don't drop body Inter to weight 300 to match Waldenburg — body stays 400/500 for legibility
- Don't pick CTA colors from third-party widgets (cookie consent, OneTrust) — ignore those

---

## B8. Known Gaps & Substitutes

- **Waldenburg** is a licensed typeface. Open-source substitute: **EB Garamond** at weight 300 (more humanist) or **Libre Baskerville** thin.
- Animation timings (orb drift, waveform pulse, hero entrance) are out of scope for this document.
- In-product surfaces (voice library editor, agent playground) only partially captured.
- Form validation states beyond focus not yet defined.

---
---

# Platform Foundation: Apple HIG / macOS

> The sections below define the native platform layer — window chrome, controls, materials, keyboard navigation. The brand layer (§B1–B8 above) lives entirely within the **content area**. Navigation chrome (Liquid Glass toolbar, sidebar, menu bar) follows Apple HIG without brand overrides.

---

## §0. macOS Platform Context

macOS targets **power users** who work across multiple windows simultaneously, rely on deep keyboard control, and expect persistent access to every command via the menu bar. Unlike iOS — where one app fills the screen — a Mac user might have six apps visible at once. This demands interfaces that are **spatially aware**, **non-intrusive**, and **keyboard-navigable** from corner to corner.

Every Mac app must honour three inviolable constraints:
1. **A complete menu bar** — the universal command surface. At minimum: App, File, Edit, View, Window, Help.
2. **Resizable, multi-window support** — fixed-size windows feel broken. Users have 13″ laptops and 32″ pro displays.
3. **Full keyboard navigation** — every interactive element must be reachable without a pointer.

**macOS Tahoe 26** introduces **Liquid Glass** — a new material language that replaces the previous vibrancy/blur system. Navigation chrome (toolbars, sidebars, tab bars, menus) is now crafted from optically-real glass that lenses and refracts underlying content in real time.

---

## §1. Visual Theme & Atmosphere

Apple's macOS design language is **precisely spatial, confidently minimal, and physically grounded** — the interface exists to serve content, never to announce itself. With macOS Tahoe, surfaces take on genuine optical depth: the new Liquid Glass material bends and concentrates light like real glass rather than simply blurring it. Navigation chrome floats as a distinct functional layer above app content.

Intentive sits inside this system: the Liquid Glass chrome is Apple's; the off-white canvas and editorial type beneath it are Intentive's.

---

## §2. Apple System Color Reference

> Brand-level color decisions live in **§B2**. Use these system colors for native controls, focus rings, separators, and platform chrome only.

### System Accent Colors (Light Mode)

| Name | Hex | Role |
|---|---|---|
| Signature Apple Blue | `#007AFF` | Focus rings, selected sidebar items, system toggles |
| Fresh Meadow Green | `#34C759` | Success, active toggles |
| Electric Crimson | `#FF3B30` | Destructive actions, errors |
| Sunset Amber | `#FF9500` | Warnings |

### Semantic UI Colors

| Name | Hex | Role |
|---|---|---|
| Pure Canvas White | `#FFFFFF` | Grouped list cells, modals |
| Whisper Gray | `#F2F2F7` | System grouped background |
| Opaque Hairline | `#C6C6C8` | List separators |
| Graphite | `#8E8E93` | Inactive icons, placeholders |

### Dark Mode Shifts

| Role | Hex |
|---|---|
| Primary Background | `#000000` |
| Secondary Background | `#1C1C1E` |
| Tertiary Background | `#2C2C2E` |
| Separator | `#38383A` |
| System Blue (dark) | `#0A84FF` |

---

## §3. Apple Typography Reference

> Brand display type (Waldenburg + Inter) lives in **§B3**. Use SF Pro for all native system controls, menus, and chrome.

### macOS Text Styles (Default Scale)

| Style | Size | Weight | Usage |
|---|---|---|---|
| Large Title | 26pt | Regular | Main window section headers |
| Title 1 | 22pt | Regular | Primary sidebar or content headers |
| Title 2 | 17pt | Regular | Panel titles, popovers |
| Title 3 | 15pt | Regular | Group headers, settings sections |
| Headline | 13pt | Semibold | List row labels, emphasized items |
| Body | 13pt | Regular | Default system text |
| Callout | 12pt | Regular | Supplementary descriptions |
| Footnote | 10pt | Regular | Metadata, auxiliary info |

---

## §4. Native Component Behavior

### Buttons (System Controls)

**Filled** — one per screen, system accent tint. **Tinted** — secondary; accent at reduced saturation. **Gray** — neutral secondary. **Plain** — text-only tertiary. **Bordered** — macOS-specific, 1pt stroke.

Destructive: Electric Crimson (`#FF3B30`) fill. Never combined with non-destructive contexts.

### Cards & Containers

Standard cells: 10–13pt radius. Featured cards / widgets: 20pt radius. Alerts/Sheets: 13pt radius, Liquid Glass material background.

### Inputs & Forms

Text fields: 1pt `#C6C6C8` stroke, 10pt radius, 44pt height minimum. Search fields: pill-shaped, Ice (`#F2F2F7`) fill, 36pt height. Segmented controls: Ice container, white selected segment.

### Sidebar (macOS)

Liquid Glass material, full window height. SF Symbols at 18pt, medium weight. Selected: system blue filled pill. Width: **225–275pt min, 350–400pt max**, user-draggable. Max two hierarchy levels.

---

## §5. macOS Layout & Window Chrome

### Window Chrome Anatomy

```
┌─────────────────────────────────────────────────────────┐
│  ● ● ●  [Title / Document Name]     [Toolbar Items]     │  ← Title Bar (28–52pt)
├──────────────────────────────────────────────────────────┤
│         │                                                │
│ Sidebar │  Content Area  ← Intentive brand layer here   │
│ 225–    │  canvas: #f5f5f5, Waldenburg + Inter           │
│ 400pt   │                                                │
│         ├──────────────────────────────────────────────-─┤
│         │  Inspector / Detail Pane (optional, trailing)  │
└─────────┴────────────────────────────────────────────────┘
```

**Traffic Lights:** Three 12pt Ø circles — Close `#FF5F57`, Minimize `#FFBD2E`, Zoom `#28C840` — 8pt apart, 20pt from leading edge.

**Unified Title Bar:** ~52pt height. Liquid Glass material.

**Menu Bar:** 24pt height (37pt on notched MacBook Pro). Fully transparent option in Tahoe 26.

### Apple Spacing Grid

| Value | Usage |
|---|---|
| 4pt | Micro-gaps |
| 6pt | Vertical between stacked controls |
| 8pt | Horizontal between controls |
| 12pt | Cell vertical padding |
| 16pt | Standard content margin |
| 20pt | Window corner margin |

### Elevation (Liquid Glass Era)

| Layer | Material |
|---|---|
| 0 — base content | System background (`{colors.canvas}` in Intentive) |
| 1 — cards/cells | White surface; color contrast only |
| 2 — sidebar/toolbar | Liquid Glass (Regular) |
| 3 — sheets/alerts | Liquid Glass (Regular) |
| 4 — menus/popovers | Liquid Glass + whisper-soft shadow |

Liquid Glass is **navigation chrome only** — never on content cards, lists, or backgrounds.

---

## §6. macOS Control Dimensions

| Control | Regular | Small | Mini |
|---|---|---|---|
| Push Button | ~22pt | ~18pt | ~15pt |
| Checkbox | ~14pt | ~12pt | ~10pt |
| Radio Button | ~14pt | ~12pt | ~10pt |
| Pop-up Menu | ~22pt | ~18pt | ~15pt |
| Text Field | ~22pt | ~19pt | ~16pt |
| Help Button | 20pt Ø | — | — |
| Round Button | 25pt Ø | 20pt Ø | — |

Spacing: Regular 12pt H / 8pt V · Small 10pt H / 6pt V · Mini 8pt H / 5pt V

---

## §7. Liquid Glass Material System

Two variants: **Regular** (default, all nav chrome) and **Clear** (only over media-rich content). Never mix.

Tinting: primary actions only — one tinted element per view. Wrap multiple glass elements in `GlassEffectContainer`.

**Auto-applied:** NavigationBar, TabBar, Toolbar, Sheets, Popovers, Menus, Alerts.  
**Never apply to:** content cards, lists, full-screen backgrounds, scrollable regions.

| Accessibility Setting | Response |
|---|---|
| Reduce Transparency | More opaque |
| Increase Contrast | Black/white with borders |
| Reduce Motion | Elastic effects off |

---

## §8. Iconography

SF Symbols exclusively for system chrome and native controls. Weight matches adjacent SF Pro text. Rendering modes: `hierarchical`, `palette`, or `multicolor` contextually.

For Intentive brand content: icons should be simple, line-weight consistent with Inter's optical weight. Avoid filled/chunky icons in content areas — they compete with Waldenburg display type.

---

## §9. Motion & Animation

Physics-based springs. `mass: 1, stiffness: 300, damping: 35`.

- Modal: slide up, 0.35s spring
- Nav push: trailing edge slide, title cross-dissolve
- Button press: scale 0.97 + opacity, spring release
- Durations: 200ms micro · 350ms transitions · 500ms choreography max

---

## §10. Keyboard & Interaction Patterns

> For progressive disclosure patterns (disclosure triangles, inspector panels, hover-reveal, contextual menus, sheets) see the [macos-design skill](.claude/commands/macos-design.md).

| Action | Shortcut |
|---|---|
| New | `⌘N` · Open `⌘O` · Close `⌘W` · Save `⌘S` |
| Undo / Redo | `⌘Z` / `⌘⇧Z` |
| Cut / Copy / Paste | `⌘X` / `⌘C` / `⌘V` |
| Find | `⌘F` · Quit `⌘Q` · Settings `⌘,` |
| List nav | `↑↓` move · `←→` expand/collapse · `Space` Quick Look |

---

## §11. Stitch Prompting Quick Reference

**Intentive brand:**
> *"Intentive design system — off-white canvas `#f5f5f5`, warm near-black ink `#0c0a09` as the only CTA color, Waldenburg Light 300 display serif, Inter 400/500 body at +0.16px tracking, pastel gradient orbs (mint `#a7e5d3` / peach `#f4c5a8` / lavender `#c8b8e0`) as atmospheric decoration only, pill-shaped buttons `border-radius: 9999px`, `{rounded.xl}` 16px feature cards, 96px section rhythm, pure white cards on off-white canvas, 1px `#e7e5e4` hairline borders, `0 4px 16px rgba(0,0,0,0.04)` hover shadow only."*

**macOS Tahoe chrome:**
> *"Native macOS Tahoe window chrome — Liquid Glass sidebar (225–400pt wide) and toolbar (~52pt unified), traffic lights 12pt Ø spaced 8pt, SF Pro 13pt body in chrome, 22pt control heights, three-pane layout, system accent `#007AFF` for focus/selection only, complete menu bar required."*
