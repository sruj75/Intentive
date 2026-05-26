# Intentive Design System

**Platform foundation:** Apple Human Interface Guidelines — macOS 26 Tahoe  
**Brand layer:** Intentive — editorial voice-AI product  
**Primary target:** macOS desktop (Tauri) — macOS-only; iOS rules not in scope

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

These appear **only** as soft radial-gradient atmospheric orbs inside `{component.gradient-orb-card}` and as background blooms behind hero copy. **Never** as button fills, text colors, or component backgrounds. Orb opacity softens slightly in dark mode (0.18 → 0.12) so they remain atmospheric rather than luminous.

> **HIG Gap #4 — contrast guard:** Any text rendered over or near a gradient orb must maintain **WCAG AA contrast (4.5:1 body, 3:1 large text)** in all four rendering contexts: light mode, dark mode, Increase Contrast, and Reduce Transparency. Implementation rule: orbs must sit below a semi-opaque text backdrop or be positioned so text never overlaps the orb centre. Before shipping any hero, run the orb + copy combination through a contrast checker at worst-case orb opacity. If contrast fails at Increase Contrast, replace the orb with a flat `{colors.canvas}` swatch behind the text — the orb may remain as a non-overlapping background decoration only.

### Semantic
| Token | Hex | Role |
|---|---|---|
| `{colors.semantic-success}` | `#16a34a` | Confirmation |
| `{colors.semantic-error}` | `#dc2626` | **Brand** form validation errors only |

> **HIG boundary — Fix #4:** `{colors.semantic-error}` (`#dc2626`) is for inline brand validation errors (e.g. "Email is required"). System-level destructive actions — delete confirmation sheets, remove-item alerts, irreversible operations — must use HIG's Electric Crimson `#FF3B30` (see §4 Native Component Behavior). Never swap them.

### Dark Mode Brand Tokens

> **Fix #5:** Full OS dark mode token set. Applied when `prefers-color-scheme: dark` (CSS media query — Tauri's WKWebView surfaces this correctly from the macOS appearance setting). Gradient orb tokens are unchanged — pastels stay; only opacity reduces.

#### Surface (Dark)
| Token | Hex | Role |
|---|---|---|
| `{colors.canvas}` | `#0f0e0d` | Warm near-black page floor |
| `{colors.canvas-soft}` | `#161412` | Slightly lighter alternating band |
| `{colors.canvas-deep}` | `#0c0a09` | Deepest dark — hero / full-bleed bands |
| `{colors.surface-card}` | `#1c1917` | Elevated card surface |
| `{colors.surface-strong}` | `#292524` | Badges, voice-icon plates |
| `{colors.surface-dark}` | `#0c0a09` | Dark CTA band (same as deep) |
| `{colors.surface-dark-elevated}` | `#1c1917` | Cards within dark bands |

#### Hairlines (Dark)
| Token | Hex | Role |
|---|---|---|
| `{colors.hairline}` | `#2d2927` | Default 1px divider |
| `{colors.hairline-soft}` | `#1f1d1c` | Lighter divider |
| `{colors.hairline-strong}` | `#3d3935` | Panel outline, input border |

#### Text (Dark)
| Token | Hex | Role |
|---|---|---|
| `{colors.ink}` | `#f5f4f2` | Display, primary text — warm off-white |
| `{colors.body}` | `#b5b0ab` | Default running copy |
| `{colors.body-strong}` | `#d4cfc9` | Emphasized body |
| `{colors.muted}` | `#857e78` | Sub-titles, secondary labels |
| `{colors.muted-soft}` | `#5c5753` | Disabled, placeholder |
| `{colors.on-dark}` | `#f5f4f2` | Text on dark hero (same as ink) |
| `{colors.on-dark-soft}` | `#a8a29e` | Muted off-white on dark hero |

#### Primary Action (Dark)
| Token | Hex | Role |
|---|---|---|
| `{colors.primary}` | `#ede9e4` | Light warm pill — inverted from near-black |
| `{colors.primary-active}` | `#f5f4f2` | Press state |
| `{colors.on-primary}` | `#0c0a09` | Dark ink text on light pill |

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
- **Accessibility scaling — HIG Gap #2:** The fixed-pixel type scale above is the default design target. Implementation must honour macOS text scaling and browser zoom:
  - All `font-size` values must be set in `rem` or `em` relative units so that system-level text size preferences scale them proportionally.
  - Minimum readable floor: `{typography.caption}` (14px default) must never render below 11px at any zoom level. If the user has set a larger text preference, allow it to scale up without clipping.
  - `{typography.display-mega}` (64px default) must collapse gracefully at large text settings — test at 1.5× and 2× zoom. No truncation, no overflow clip on headings.
  - Waldenburg Light at weight 300 is legible at large display sizes; never use it below 20px — switch to Inter for any copy that risks illegibility at reduced sizes or high contrast mode.
  - Line height values (1.05–1.2 on display) must stay proportional; never fix line heights in `px` on text that scales.
- **Inter is for Intentive content only — Fix #3 (HIG):** Inter applies to `{component.top-nav}`, body copy, cards, and CTAs inside the Tauri WebView content area. The OS-rendered chrome — the native menu bar (built via Tauri's `tauri::menu::Menu` in Rust), the title bar, and any native OS dialogs triggered via `tauri::dialog` — renders in SF Pro automatically because the OS controls it. CSS `font-family` rules never reach those surfaces. Only style elements inside the `<body>` WebView; never attempt to override OS chrome fonts.

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
Background `{colors.primary}` (#292524) · Text `{colors.on-primary}` (#fff) · Font `{typography.button}` · Padding 10px × 20px · Visual height 40px · Radius `{rounded.pill}`  
> **HIG Fix #1 — touch target:** Visual height is 40px but the interactive hit zone must be **44px minimum** (HIG §6). In Tauri/Electron, add `min-height: 44px` and center the pill visually inside with padding, or add 2px transparent top/bottom padding outside the pill border. Never ship a primary action below 44px tap height.

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
Background `{colors.surface-card}` · Radius `{rounded.md}` (8px) · Padding 12px × 16px · Height 44px · 1px `{colors.hairline-strong}` border · Hover: 2px `{colors.ink}` border  
> **HIG Gap #3 — focus ring (semantic, not hard-coded):** Keyboard focus ring uses `{colors.system-accent-focus}` — a semantic token. In Tauri on macOS, read the system accent color at app startup via a Tauri Rust command (call `NSColor.controlAccentColor` through the `objc` crate → convert to hex → emit to the frontend as a CSS custom property `--system-accent`), then set `{colors.system-accent-focus}` to `var(--system-accent, #007AFF)`. This way users who've set a custom accent color (orange, green, etc. in System Settings) see their chosen color in focus rings. Fallback `#007AFF` applies only when the Rust bridge hasn't resolved yet. Do not suppress `outline` without replacing it — WCAG 2.4.7. Minimum replacement: `box-shadow: 0 0 0 3px var(--system-accent, #007AFF)`. The 2px ink border on this component is for hover/active pointer state only.

**`{component.badge-pill}`** — Label badge.  
Background `{colors.surface-strong}` · Font `{typography.caption-uppercase}` · Radius `{rounded.pill}` · Padding 4px × 10px

### Navigation

**`{component.top-nav}`** — Marketing and onboarding navigation bar.  
Background `{colors.canvas}` · Text `{colors.ink}` · Height 64px · Wordmark left · Primary nav center · Sign In + CTA right  
> **HIG Fix #6 — scope and macOS app navigation — Gap #5:** `{component.top-nav}` is for **marketing pages and onboarding flows only** — not the core Intentive macOS workspace. The ScreenPipe capture workspace, Context Snapshot view, Context Heartbeat dashboard, and OpenClaw Agent interface must use **macOS-native navigation patterns**: a CSS sidebar panel (leading, `width: clamp(225px, 280px, 400px)`, drag-resizable via a `<div>` resize handle) for section switching, a Tauri `toolbar`-style button row beneath the title bar for primary actions, and an optional inspector panel trailing. In Tauri this is all web layout — a flex/grid split inside the `<body>` with `backdrop-filter` on the sidebar. A horizontal top-nav bar has no place in the core app window — macOS users expect sidebar-driven navigation, and a top nav would compete with the native menu bar. `{component.top-nav}` must never replace the native macOS title bar — keep Tauri's `decorations: true` and do not set `titleBarStyle: "overlay"` on the main window.

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

### Do — Brand
- Reserve `{colors.primary}` (ink pill) for primary CTAs only — one per view
- Use Waldenburg Light at weight 300 for every display headline — never bold
- Use Inter at +0.15–0.18px tracking for body — the editorial dialect
- Use atmospheric gradient orbs (mint / peach / lavender / sky / rose) as decoration only
- Use `{rounded.pill}` for every CTA and badge
- Respect 96px section rhythm for editorial pacing
- Apply dark mode brand tokens (B2 dark table) whenever `prefers-color-scheme: dark`

### Do — HIG Compliance
- Ensure every primary interactive element has a **44px minimum hit zone** — even when visual size is smaller
- Use system blue `#007AFF` (3pt `box-shadow`) as the keyboard focus indicator on all inputs and buttons
- Use HIG's Electric Crimson `#FF3B30` for system-level destructive actions (delete sheets, remove alerts)
- Use SF Pro for all macOS window chrome (sidebar, toolbar, menus) — Inter lives in the content area only
- Keep the native macOS title bar intact — `{component.top-nav}` goes below it, never replaces it
- Support full keyboard navigation: every action reachable without a pointer, `⌘Z` always undoes deletion

### Don't — Brand
- Don't introduce a saturated brand action color — ink pill is the only CTA color
- Don't bold display copy — weight 300 is the editorial voice; bolding shifts to consumer-marketing
- Don't use gradient orbs as button fills, text colors, or component backgrounds — pure atmosphere only
- Don't use `{rounded.none}` on CTAs — pill geometry is the brand button
- Don't drop body Inter to weight 300 to match Waldenburg — body stays 400/500 for legibility
- Don't pick CTA colors from third-party widgets (cookie consent, OneTrust) — ignore those

### Don't — HIG Compliance
- Don't suppress `outline` on focusable elements without replacing it with `box-shadow: 0 0 0 3px #007AFF`
- Don't use `{colors.semantic-error}` (#dc2626) for destructive action buttons — use `#FF3B30`
- Don't try to style the native menu bar, title bar, or OS dialogs with CSS — Tauri's WKWebView has no access to those surfaces; the OS renders them in SF Pro automatically
- Don't ship `{component.button-primary}` with only 40px height — pad to 44px touch zone
- Don't configure `titleBarStyle: "overlay"` to merge `{component.top-nav}` with the macOS title bar

---

## B8. Reduce Motion Behaviour — HIG Gap #6

All brand animations must respect `prefers-reduced-motion: reduce` (CSS) and the macOS Accessibility › Reduce Motion system preference. These are the Intentive-specific animation contexts and their reduced-motion counterparts:

| Animation | Default | Reduce Motion |
|---|---|---|
| Gradient orb drift | Slow radial float, 8–12s loop | Static orb, no movement — opacity only |
| Waveform pulse | Continuous amplitude animation | Flat static waveform line |
| Hero entrance | Fade + translate-up, 0.5s | Instant render, no translate |
| Context Heartbeat indicator | Pulsing ring or beat animation | Static dot or solid ring |
| OpenClaw Agent activity | Spinning / morphing glass indicator | Static icon |
| Card hover lift | `transform: translateY(-2px)`, 200ms | No transform — border color change only |
| Orb appear on scroll | Scale-in + fade, 350ms | Fade only (no scale) |

Implementation: wrap all motion in `@media (prefers-reduced-motion: no-preference) { }` and provide the static fallback outside. For Tauri's WebView, the CSS media query maps correctly to the macOS system preference — no additional bridge needed. Never disable the static fallback "for visual polish" — Reduce Motion is a medical necessity for some users.

## B9. Known Gaps & Substitutes

- **Waldenburg** is a licensed typeface. Open-source substitute: **EB Garamond** at weight 300 (more humanist) or **Libre Baskerville** thin.
- Animation timing curves (spring parameters for orb drift, waveform pulse easing) remain to be spec'd alongside motion design work.
- In-product surfaces (voice library editor, agent playground) only partially captured.
- Form validation states beyond focus/hover not yet defined.
- `{colors.system-accent-focus}` runtime resolution in Tauri's WKWebView needs validation — test against non-blue macOS accent colors.

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

## §6. macOS Visual Reference Sizes

> These are **visual target sizes** from Apple HIG — not AppKit control classes. In Tauri everything is a web component. Match these dimensions so the UI has the same visual weight as native macOS apps; do not use native AppKit widgets.

| Element | HIG visual target | Tauri CSS equivalent |
|---|---|---|
| Push button (regular) | ~22pt tall | `height: 28px`, `padding: 0 14px` |
| Checkbox | ~14pt | Custom `<input type="checkbox">` styled to 14×14px |
| Text field (regular) | ~22pt | `height: 28px` (distinct from `{component.text-input}` 44px — see note) |
| Toolbar icon button | ~22pt | `height: 28px`, `width: 28px` |
| Segmented control | ~22pt | Flex row with shared border, 28px height |
| Sidebar row | ~24pt | `height: 30px`, `padding: 0 12px` |

**Note on text field height conflict:** `{component.text-input}` (B5) is 44px — the HIG minimum touch target for primary form inputs. The 28px HIG size above is for compact toolbar/settings-style fields where space is constrained and pointer precision is expected. Use 44px for form fields, 28px for compact in-toolbar search or settings rows.

Spacing between web-rendered controls (matching HIG rhythm): `gap: 8px` horizontal, `gap: 6px` vertical in settings-style layouts.

---

## §7. Liquid Glass Material System (Tauri Implementation)

> Liquid Glass is a macOS Tahoe 26 visual language. In Tauri, there is no `.glassEffect()` SwiftUI modifier — the effect is achieved through two mechanisms: **Tauri window vibrancy** (Rust, for the outer window chrome) and **CSS `backdrop-filter`** (for in-content panels that need to feel glass-like).

### Window-level vibrancy (Rust / `tauri.conf.json`)

Tauri v2 exposes macOS window effects via the `effects` config or `window.set_effects()` at runtime. For a Liquid Glass-adjacent sidebar and toolbar:

```json
// tauri.conf.json (app window)
"effects": [{ "effect": "Sidebar", "state": "FollowsWindowActiveState", "radius": 0 }]
```

Available macOS effects relevant to Intentive: `Sidebar`, `HudWindow`, `Tooltip`, `Popover`, `UnderWindowBackground`. Use `Sidebar` for the main split-view chrome; it produces the closest match to macOS native sidebar translucency.

### In-content glass panels (CSS)

For web-rendered panels that need a glass feel (floating inspector, Context Snapshot cards, popovers):

```css
.glass-panel {
  background: rgba(245, 245, 245, 0.72);     /* {colors.canvas} at 72% */
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .glass-panel {
    background: rgba(28, 25, 23, 0.78);      /* {colors.surface-card dark} at 78% */
    border-color: rgba(255, 255, 255, 0.08);
  }
}
```

### Placement rule (same HIG principle, CSS implementation)

**Apply glass to:** sidebar panel, toolbar row, floating inspector, sheets, popovers, context menus (if web-rendered).  
**Never apply to:** content cards, list rows, full-screen backgrounds, scrollable regions.

### Tinting

Reserve tinted glass for one primary-action element per view — increase `background` opacity and add a subtle brand-color tint: `rgba(41, 37, 36, 0.15)` for ink-tinted glass.

### Accessibility

| macOS Setting | CSS response |
|---|---|
| Reduce Transparency | `@media (prefers-reduced-transparency: reduce)` → remove `backdrop-filter`, replace with solid `{colors.canvas}` / `{colors.surface-card}` |
| Increase Contrast | `@media (prefers-contrast: more)` → add `1px solid {colors.hairline-strong}` border, remove translucency |
| Reduce Motion | No glass-specific motion; see B8 for orb/animation rules |

---

## §8. Iconography

SF Symbols exclusively for system chrome and native controls. Weight matches adjacent SF Pro text. Rendering modes: `hierarchical`, `palette`, or `multicolor` contextually.

For Intentive brand content: icons should be simple, line-weight consistent with Inter's optical weight. Avoid filled/chunky icons in content areas — they compete with Waldenburg display type.

---

## §9. Motion & Animation

Physics-based spring feel — **target values from HIG, implemented in CSS/JS in Tauri.**

| Transition | CSS implementation | Duration |
|---|---|---|
| Modal / sheet appear | `transform: translateY(0)` from `translateY(20px)` + `opacity` | 350ms `cubic-bezier(0.32, 0.72, 0, 1)` |
| Panel slide in (sidebar) | `transform: translateX(0)` from `translateX(-100%)` | 280ms `cubic-bezier(0.32, 0.72, 0, 1)` |
| Button press | `transform: scale(0.97)` + `opacity: 0.85` on `:active` | 120ms `ease-out`; release 200ms `ease-out` |
| Fade / cross-dissolve | `opacity` 0→1 | 200ms `ease-out` |
| Complex choreography | Staggered children, 60ms delay between items | Total ≤ 500ms |

**CSS spring approximation** (no JS library needed for most cases):
```css
/* HIG spring: mass 1, stiffness 300, damping 35 */
transition-timing-function: cubic-bezier(0.32, 0.72, 0, 1);
```

For more complex spring physics (Context Heartbeat pulse, waveform), use the Web Animations API or a lightweight library (Motion One). All spring durations: 200ms micro · 350ms view transitions · 500ms max choreography. See **B8** for Reduce Motion overrides — all transforms must be disabled under `prefers-reduced-motion: reduce`.

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
