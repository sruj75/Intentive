# Apex Design System

## What this is
A design system for **Apex**, a fitness / activity-tracking app with an AI chatbot companion. It ships as a mobile app and a desktop (web) dashboard, both sharing the same visual language.

## Sources
No codebase, Figma file, or brand guideline doc was attached. This system was derived entirely from **three reference screenshots** the user uploaded, now copied into `assets/reference/`:
- `mobile-screens.png` — three iPhone mocks: Dashboard (goal ring + quick actions), Progress (Daily/Weekly/Monthly + exercise rings), AI Chat (chatbot conversation)
- `desktop-dashboard-flat.png` / `desktop-dashboard-framed.png` — a desktop/web dashboard combining a sidebar, the same dashboard content, and an AI chatbot side panel

Because there was no codebase or Figma to read component structure from, exact spacing/typography values are close estimates sampled from the screenshots (pixel-picked colors, proportional type scale) rather than ground-truth design tokens. **If real brand assets (Figma file, codebase, style guide, logo, font files) become available, re-run this system against them for pixel accuracy.**

## Products represented
1. **Apex Mobile** (`ui_kits/mobile-app/`) — iOS app: Dashboard, Progress, AI Chat screens on a bottom tab bar.
2. **Apex Desktop** (`ui_kits/desktop-app/`) — web/companion dashboard: dark sidebar nav, main dashboard panel, AI chatbot side panel.

## Logo
**No logo mark appears in any reference screenshot.** Per design-system guidelines, none was invented — wherever a mark would go, the wordmark "Apex" is set in plain type (`var(--font-display)`, bold). Flag: if Apex has a real logo, attach it and this system should be updated.

## Font substitution — please read
The reference screens use a bold, rounded, geometric sans for headlines and numerals (see "Let's start strong!", "2,340"). No font files were provided. The nearest freely-available match used here is **Plus Jakarta Sans** (Google Fonts), loaded in `tokens/fonts.css`. **This is a substitution, not the real brand font** — if you have the actual typeface, upload the font files and this design system should be updated to use them.

---

## CONTENT FUNDAMENTALS

- **Voice**: short, second-person, encouraging — "Let's start strong!", "You're 45% to your daily goal". Coaching tone, not clinical.
- **Casing**: sentence case throughout (titles, buttons, nav labels). No all-caps, no title case.
- **Numbers over adjectives**: the product prefers showing a stat ("2,340 / 8000", "420 kcal", "3.4km") over describing it. Copy is a thin wrapper around data.
- **Chatbot register**: conversational, first/second person ("How many calories did I burn yesterday?" → "You burned 420 kcal across 3 activities"). Answers are direct and numeric, no filler.
- **Suggested prompts** as short imperative chips: "Start workout", "Log water", "How did I sleep?" — verbs first, no punctuation.
- **Micro-copy is terse**: nav/action labels are one or two words ("Workout", "Meal", "Water", "Sync", "Dismiss", "Set Routine", "Get Started").
- **No emoji** anywhere in the reference screens.
- **Vibe**: energetic but calm — a coach, not a drill sergeant. Warm neutral palette + a single accent color reinforce this (see Visual Foundations).

---

## VISUAL FOUNDATIONS

**Color**: A warm off-white/gray app background, white and light-gray-muted cards, a warm charcoal (near-black, not pure black) reserved for exactly two roles — the floating nav sidebar and the single "Distance" stat tile — and a single **terracotta-orange accent** (`#DE6644`) used sparingly. There is no second brand hue; orange carries all "important/active/energetic" meaning. Note: the desktop AI chat panel is **light** (it shares the app shell), not dark — the only dark surfaces are the sidebar and the Distance tile.

**Neumorphism (the premium detail)**: The signature tactile quality comes from soft "pillowy" neumorphic treatment on two elements: (1) the round quick-action buttons — a dual shadow (light from top-left, soft shadow bottom-right, `--shadow-neumorph`) makes them read as raised pebbles, with **bold near-black, partly-filled** glyphs; and (2) the daily-goal progress bar — a deep inset **groove** (`--shadow-inset-groove`) holding a chunky, lifted **white fill pill** (`--shadow-fill-pill`). Getting these two right is what separates a flat mock from the real product.

**Type**: One typeface family, two roles by weight — bold/tight for display headlines and big stat numerals, medium weight for body copy and labels. Numbers are consistently bolder than the label sitting next to them ("2,340" bold, "Steps" medium-gray).

**Spacing**: 4px base unit. Card interiors are generous (20–28px padding); quick-action rows and stat-card groups use 12–16px gaps. Nothing feels cramped — this is a relaxed, breathing layout, not data-dense.

**Backgrounds**: Flat warm-gray app background — no photography, no illustration, no texture/pattern, no gradients except the soft orange glow behind the AI Chatbot pill/FAB. No full-bleed imagery anywhere in the reference screens.

**Animation**: Not directly observable from static screenshots. Given the soft, rounded, low-shadow visual language, components in this kit use short (120–180ms) ease transitions for press/hover states — no bounce, no springy motion implied by the brand.

**Hover / press states**: Buttons and icon-buttons scale down slightly (~0.94–0.97) on press; no color-darkening pattern is visible in the static references, so components favor a subtle scale + opacity change for interactivity feedback.

**Borders**: Essentially borderless. Cards are separated by fill-color contrast and shadow, not strokes. The one exception is the "outline" button variant used on dark surfaces (1px translucent white border).

**Shadows**: Two systems. (1) Ambient drop shadows for floating cards — soft, warm-tinted (`rgba(23,23,20,…)` not pure black), very diffuse, so cards rest gently on the background. (2) Neumorphic dual shadows (`--shadow-neumorph`, `--shadow-inset-groove`) for the pillowy pressable circles and the progress groove (see Neumorphism above). The accent color gets its own soft **radial bloom** (`--glow-accent-radial` / `--shadow-accent-glow`) behind the energy FAB and the "AI Chatbot" pill instead of a neutral shadow.

**Data-viz motifs**: Activity is shown with (a) **arc gauges** — ~270° rings open at the bottom (`RingProgress arcDegrees={270}`), used for Exercise/Stand and the mini Running/Push-up cards; (b) a **thin rounded bar chart** (~12–14 bars, mostly gray with 2–3 black "peak" bars) for Steps; and (c) an abstract **orange route line** (a looping polyline) for Distance. These are decorative-but-meaningful chart elements, not icons.

**Corner radii**: Rounded everywhere, no sharp corners anywhere in the reference screens. Buttons and segmented controls are full pills; stat/goal cards use a large soft radius (20px); big containers (sidebar, chat panel, phone-scale shell) use an even larger radius (28–36px); icon buttons and avatars are full circles.

**Cards**: White or muted-gray fill, no border, soft shadow (white cards only — muted/dark cards sit flush with no shadow since they're already visually distinct from the page background), generously padded, large radius. Never a colored left-border accent.

**Transparency / blur**: Used once — a soft radial orange glow sits behind the "AI Chatbot" pill header. No other blur/glass effects appear.

**Imagery color vibe**: N/A — no photography or illustration appears in the reference screens at all. If product photography is introduced later, keep it warm-neutral (matching the palette) rather than cool/blue-toned.

**Layout rules**: Bottom tab bar (mobile) / left sidebar (desktop) are fixed; content scrolls beneath/beside them. Desktop adds a persistent right-hand AI chat panel — three-column layout (nav / content / chat) rather than a modal or drawer.

---

## ICONOGRAPHY

The reference screens use simple, single-weight line icons inside circular buttons (dumbbell, coffee cup, water droplet, stopwatch/watch, heart) — no fill icons, no duotone, no emoji, no icon font glyphs visible.

No icon source files were provided, so this system substitutes **Lucide** (MIT-licensed, CDN/GitHub-available), matched for stroke weight (2px) and line-cap style, and copies the exact SVGs used into `assets/icons/` + `assets/icons.js` (consumed via the `Icon` component). Used names: `activity, arrow-up-right, check, chevron-left, chevron-right, circle, coffee, droplet, dumbbell, flame, footprints, gauge, heart, layers, mic, plus, route, search, send-horizontal, settings, sparkles, target, user, watch, x, zap`. **Flag**: if Apex has its own icon set, swap `assets/icons.js` for the real files.

---

## Intentional additions
No component inventory source (Figma/codebase) was available, so a standard primitive set was authored from scratch, sized to what the reference screens actually show (see Components below) — nothing beyond that was invented. The `Icon` wrapper component is an addition needed to consume the substituted Lucide set consistently; it is not a UI pattern visible in the screenshots itself.

---

## Index — what's in this project

- `styles.css` — root stylesheet, imports everything in `tokens/`
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `radii.css`, `shadows.css`, `fonts.css`
- `assets/`
  - `icons/*.svg`, `icons.js` — Lucide icon set (substitution, see Iconography)
  - `reference/` — the three original uploaded screenshots
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Brand groups in the Design System tab)
- `components/` — reusable primitives, one directory per family:
  - `icon/Icon` — line icon renderer
  - `buttons/Button`, `buttons/IconButton`
  - `cards/Card`, `cards/StatCard`
  - `feedback/ProgressBar`, `feedback/RingProgress`
  - `navigation/SegmentedControl`, `navigation/NavItem`
  - `chat/ChatBubble`, `chat/ChatInput`
- `ui_kits/`
  - `mobile-app/` — interactive Apex iOS app (Dashboard / Progress / AI Chat, tap the bottom nav)
  - `desktop-app/` — interactive Apex desktop dashboard (sidebar + dashboard + chat panel)
- `SKILL.md` — Claude Code / Agent Skills-compatible entry point for this system

> **Monorepo note:** in this repository the design system is split by owner. This global
> foundation lives at `/design-system`. The two interactive UI kits are relocated next to the
> deployables they represent — `apps/desktop/design-system/` (desktop) and
> `apps/mobile/design-system/` (mobile) — and load these shared tokens/styles via relative
> paths. See `/design-system/README-monorepo.md` for the full map.

## Caveats
- No codebase, Figma, or brand guide was attached — this system is derived from 3 screenshots only. Numeric values (spacing, exact type sizes) are close estimates, not verified tokens.
- Font is a Google Fonts substitution (Plus Jakarta Sans), not the real Apex typeface.
- No logo was provided or invented.
- Icons are a Lucide substitution, not Apex's real icon set (if one exists).
- Only the screens shown in the references were built (Dashboard, Progress, AI Chat, desktop dashboard); a Profile/Settings screen is stubbed with a placeholder note rather than invented.
