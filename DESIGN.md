# Design System: Apple Human Interface Guidelines

**Source:** [designsystems.surf/design-systems/apple](https://designsystems.surf/design-systems/apple)  
**Reference:** Apple Human Interface Guidelines — macOS 26 Tahoe
**Primary Platform:** macOS

---

## 0. macOS Platform Context

macOS targets **power users** who work across multiple windows simultaneously, rely on deep keyboard control, and expect persistent access to every command via the menu bar. Unlike iOS — where one app fills the screen — a Mac user might have six apps visible at once. This demands interfaces that are **spatially aware**, **non-intrusive**, and **keyboard-navigable** from corner to corner.

Every Mac app must honour three inviolable constraints:
1. **A complete menu bar** — the universal command surface. At minimum: App, File, Edit, View, Window, Help.
2. **Resizable, multi-window support** — fixed-size windows feel broken. Users have 13″ laptops and 32″ pro displays.
3. **Full keyboard navigation** — every interactive element must be reachable without a pointer.

**macOS Tahoe 26** introduces **Liquid Glass** — a new material language that replaces the previous vibrancy/blur system. Navigation chrome (toolbars, sidebars, tab bars, menus) is now crafted from optically-real glass that lenses and refracts underlying content in real time.

---

## 1. Visual Theme & Atmosphere

Apple's macOS design language is **precisely spatial, confidently minimal, and physically grounded** — the interface exists to serve content, never to announce itself. With macOS Tahoe, surfaces take on genuine optical depth: the new Liquid Glass material bends and concentrates light like real glass rather than simply blurring it. Navigation chrome floats as a distinct functional layer above app content.

The overall mood: **Quiet authority.** Neutral backgrounds — white in light mode, near-black in dark mode — let a single vibrant accent carry all interactive weight. Whitespace is used aggressively; breathing room signals intent. The aesthetic sits at the intersection of **Swiss grid discipline** and **material physics** — mathematical in its spacing, tactile in its surfaces.

Dark mode is a first-class citizen. Liquid Glass materials adapt automatically: they become slightly more opaque and contrasty in dark environments without requiring separate design decisions. The menu bar in macOS Tahoe can be set fully transparent, dissolving into the desktop wallpaper.

---

## 2. Color Palette & Roles

### System Accent Colors (Light Mode)

| Descriptive Name | Hex | Functional Role |
|---|---|---|
| Signature Apple Blue | `#007AFF` | Primary interactive elements, links, default tint, selected state |
| Fresh Meadow Green | `#34C759` | Success states, confirmations, active toggles |
| Electric Crimson | `#FF3B30` | Destructive actions, errors, delete confirmations |
| Sunset Amber | `#FF9500` | Warnings, in-progress indicators |
| Bubblegum Pink | `#FF2D55` | Favorites, hearts, media controls |
| Soft Lavender Indigo | `#5856D6` | Secondary accent, Siri, focus ring on macOS |
| Muted Amethyst Purple | `#AF52DE` | Premium or creative context accents |
| Arctic Cyan | `#32ADE6` | Informational badges, supplementary tint |
| Spearmint | `#00C7BE` | Health, fitness, wellness context |
| Warm Cognac Brown | `#A2845E` | Neutral accent, maps, safari tint |
| Canary Yellow | `#FFCC00` | Highlights, starred items, notes |

### Semantic UI Colors (Light Mode)

| Descriptive Name | Hex | Functional Role |
|---|---|---|
| Primary Label | `#000000` | Main body text, headlines |
| Secondary Label | `#3C3C43` @ 60% → `#636366` | Supporting text, metadata |
| Tertiary Label | `#3C3C43` @ 30% → `#8A8A8E` | Placeholder text, disabled labels |
| Quaternary Label | `#3C3C43` @ 18% → `#BCBCC0` | Very subtle decorative text |
| Pure Canvas White | `#FFFFFF` | Primary background (grouped lists, modals) |
| Whisper Gray | `#F2F2F7` | System background, grouped table background |
| Soft Chalk | `#FFFFFF` | Secondary grouped background (card surfaces) |
| Opaque Hairline | `#C6C6C8` | List separators, dividers |
| Translucent Separator | `#3C3C43` @ 29% | Inset separators between cells |

### Gray Scale

| Descriptive Name | Hex | Functional Role |
|---|---|---|
| Graphite | `#8E8E93` | systemGray — icons, captions, placeholders |
| Pewter | `#AEAEB2` | systemGray2 — secondary icons, borders |
| Silver Mist | `#C7C7CC` | systemGray3 — inactive track fills |
| Pearl | `#D1D1D6` | systemGray4 — disabled control backgrounds |
| Gossamer | `#E5E5EA` | systemGray5 — segmented control backgrounds |
| Ice | `#F2F2F7` | systemGray6 — subtle section fills |

### Dark Mode Semantic Shifts

| Role | Dark Mode Hex | Notes |
|---|---|---|
| Primary Background | `#000000` | Pure black on OLED — power-efficient, maximum contrast |
| Secondary Background | `#1C1C1E` | Elevated card surfaces, sheets |
| Tertiary Background | `#2C2C2E` | Nested containers |
| Primary Label | `#FFFFFF` | Full white text on black |
| Secondary Label | `#EBEBF5` @ 60% → `#8E8E93` | Muted white for supporting copy |
| Separator | `#38383A` | Hairline between cells |
| System Blue (dark) | `#0A84FF` | Slightly lightened for dark context legibility |

---

## 3. Typography Rules

Apple uses its proprietary **San Francisco** typeface family exclusively across all system interfaces. New York (NY) serves as an expressive serif companion for editorial and reading contexts.

### Font Families

- **SF Pro** — the workhorse. Switches between *SF Pro Text* (≤19pt) and *SF Pro Display* (≥20pt) automatically, optimized for each size range.
- **SF Pro Rounded** — warmer, friendlier variant used in icons, widgets, and playful contexts (Fitness, Kids, Animoji).
- **SF Compact** — condensed variant native to watchOS and used in compact layouts.
- **New York (NY)** — classical serif for long-form reading, book apps, and editorial headlines.

### iOS Text Styles (Dynamic Type Default Scale)

| Style | Size | Weight | Line Height | Tracking | Usage |
|---|---|---|---|---|---|
| Large Title | 34pt | Regular | 41pt | +0.37pt | Hero screen titles (navigation bar expanded) |
| Title 1 | 28pt | Regular | 34pt | +0.36pt | Primary section headers |
| Title 2 | 22pt | Regular | 28pt | +0.35pt | Secondary headers, card titles |
| Title 3 | 20pt | Regular | 25pt | +0.38pt | List group headers |
| Headline | 17pt | Semibold | 22pt | −0.41pt | Emphasized body, cell labels |
| Body | 17pt | Regular | 22pt | −0.41pt | Default reading copy |
| Callout | 16pt | Regular | 21pt | −0.32pt | Descriptive text in popovers, notes |
| Subheadline | 15pt | Regular | 20pt | −0.24pt | Supporting body copy |
| Footnote | 13pt | Regular | 18pt | −0.08pt | Secondary metadata, timestamps |
| Caption 1 | 12pt | Regular | 16pt | 0pt | Image captions, tertiary labels |
| Caption 2 | 11pt | Regular | 13pt | +0.07pt | Fine print, badge labels |

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
| Subheadline | 11pt | Regular | Captions within interface elements |
| Footnote | 10pt | Regular | Metadata, auxiliary info |
| Caption 1 | 10pt | Regular | Micro-labels, footnotes |

### Typography Principles

- **Weight for hierarchy, never size alone.** Semibold headlines paired with regular body creates clear rhythm without aggressive size jumps.
- **Optical sizing is automatic.** SF Pro Text and Display variants swap at 20pt — never manually override this behavior.
- **Letter spacing is negative at display sizes.** Tight tracking at large sizes creates a polished, premium feel. Open tracking only at Caption scale.
- **Dynamic Type is non-negotiable.** All text must scale across all 12 Dynamic Type sizes including 5 accessibility sizes.

---

## 4. Component Stylings

### Buttons

**Large (Primary Action):**  
Pill-shaped with fully rounded ends (`border-radius: 50pt`), minimum height 50pt, horizontal padding 24pt. Filled with Signature Apple Blue (`#007AFF`), white label text at Headline weight. On press: momentary opacity drop to 70%.

**Medium (Standard):**  
Generously rounded corners (`border-radius: 10pt`), height 44pt, horizontal padding 16pt. Filled style uses system tint color. Gray style uses systemGray5 (`#E5E5EA`) fill with primary label text.

**Small (Inline):**  
Subtly rounded corners (`border-radius: 8pt`), height 30pt, horizontal padding 12pt. Often tinted (system color at 15% opacity background) rather than fully filled.

**Styles:**
- *Filled* — maximum emphasis, primary actions only. One per screen.
- *Tinted* — secondary actions; system accent at reduced saturation background.
- *Gray* — neutral, non-destructive secondary actions.
- *Plain* — text-only, for tertiary or list-inline actions. Uses system accent color.
- *Bordered* — macOS-specific; 1pt stroke in separator color, subtly rounded.

**Destructive State:** Red Electric Crimson (`#FF3B30`) replaces the accent color. Never paired with filled + red for non-destructive contexts.

### Cards & Containers

Lightly rounded corners (`border-radius: 10–13pt`) on standard list cells; generously rounded (`border-radius: 20pt`) on featured cards, widgets, and App Store tiles. Background: Pure Canvas White (`#FFFFFF`) on Whisper Gray (`#F2F2F7`) backgrounds — creating a one-level-of-depth separation without shadows. Inset group lists use 16pt side insets with visible rounded card outlines.

**Widget cards:** 20pt corner radius, vibrancy-aware background material, no stroke border.

**Alerts and Sheets:** 13pt corner radius, thick material (blurred frosted glass) background — appear elevated above the primary content layer through blur, not shadow.

### Inputs & Forms

**Text Fields:**  
No visible stroke in light mode within grouped table contexts — the cell background itself is the affordance. Standalone text fields in free layouts: 1pt separator-colored stroke (`#C6C6C8`), subtly rounded corners (10pt), 44pt height minimum. Placeholder text in Tertiary Label color (`#8A8A8E`).

**Search Fields:**  
Pill-shaped container, Ice fill (`#F2F2F7`), SF Symbols magnifying glass icon in Graphite (`#8E8E93`). No border. Height 36pt standard.

**Toggles (Switches):**  
29×31pt track, pill-shaped. Off state: systemGray3 (`#C7C7CC`) track. On state: Signature Apple Blue (`#007AFF`). White circular thumb with whisper-soft shadow.

**Sliders:**  
Thin track (2–4pt height), system accent fill on completed side, systemGray3 on remaining side. Circular thumb 28pt diameter, white fill, soft 2pt shadow.

**Segmented Controls:**  
Rounded-rectangle outer container in Ice (`#F2F2F7`), selected segment white (`#FFFFFF`) fill with 0.5pt shadow to distinguish elevation. Text in Primary Label when selected, Secondary Label when inactive.

### Navigation

**Navigation Bar (iOS):**  
Liquid Glass background (macOS Tahoe era) or translucent material. Large title collapses to inline title on scroll. Back button uses SF Symbol `chevron.left` + destination label text in Signature Apple Blue. Height: 44pt (compact), ~96pt with large title.

**Tab Bar (iOS):**  
49pt height (plus home indicator inset). In iOS 26, tab bars shrink during scrolling to emphasize content, then fluidly expand when scrolling stops — built from Liquid Glass. Selected tab: Signature Apple Blue, unselected: Graphite (`#8E8E93`).

**Sidebar (macOS/iPadOS):**  
Liquid Glass material, full window height. Icons use SF Symbols at 18pt (medium weight, hierarchical rendering). Selected item: Signature Apple Blue filled pill. Width range: **225–275pt minimum, 350–400pt maximum** — splitter is user-draggable. Show/Hide via View menu. Maximum two levels of hierarchy. In macOS Tahoe, the sidebar refracts wallpaper and surrounding content, reinforcing the layering hierarchy.

---

## 5. Layout Principles

### macOS Window Chrome Anatomy

```
┌─────────────────────────────────────────────────────────┐
│  ● ● ●  [Title / Document Name]     [Toolbar Items]     │  ← Title Bar (28–52pt)
├────────────────────────────────────────────────────────-─┤
│         │                                                │
│ Sidebar │  Content Area                                  │
│ 225–    │  (primary scrollable region)                  │
│ 400pt   │                                                │
│         ├────────────────────────────────────────────── ┤
│         │  Inspector / Detail Pane (optional, trailing) │
└─────────┴────────────────────────────────────────────────┘
```

**Traffic Light Controls (window buttons):**  
Three 12pt diameter circles — Close (red `#FF5F57`), Minimize (amber `#FFBD2E`), Zoom (green `#28C840`) — spaced 8pt apart, 20pt from leading edge, vertically centered in title bar.

**Title Bar / Toolbar (Unified style):**  
Standard height ~52pt (unified title + toolbar in one row). Compact/Preference style ~28pt. Expanded style (document apps): separate title row + toolbar row. Liquid Glass material fills the bar — content scrolls beneath and is visible through it.

**Menu Bar:**  
System-wide bar at screen top. Height: **24pt** (standard since Big Sur), **37pt** on MacBook Pro with notch at default scaling. Menu bar extras (right side) use template images at 16×16pt within a 22pt working height. Fully transparent option in macOS Tahoe 26 — dissolves into wallpaper.

### Spacing Grid

Apple uses a **4pt base unit** with multiples of 4 as the primary spacing vocabulary:

| Value | Usage |
|---|---|
| 4pt | Micro-gaps between icon and label, badge offsets |
| 6pt | Vertical spacing between stacked controls (macOS Settings) |
| 8pt | Horizontal spacing between controls; button-to-button gaps |
| 12pt | Standard vertical padding within cells; button-to-view spacing |
| 16pt | **Standard content margin** — primary horizontal inset (iPhone) |
| 20pt | Window corner margin (macOS Settings); iPad horizontal inset |
| 24pt | Generous section spacing, hero padding |
| 32pt+ | Hero section vertical breathing room |

**macOS Settings window specifics:** 20pt corner margins, 8pt horizontal between controls, 6pt vertical between controls, 8pt between two-column gap, minimum 20pt on each side of separators.

### Safe Area & Insets

All content respects dynamic safe areas: top (menu bar + title bar), bottom (dock), and leading/trailing. Full-bleed backgrounds and materials extend beneath chrome intentionally — scroll content glides beneath sidebars and toolbars.

**Minimum click target (macOS):** 44×44pt for primary actions; secondary controls may be smaller but must have hover states confirming interactivity.

### Grid & Column System

- **iPhone (390pt):** Single column, 16pt margins.
- **iPad (768pt+):** Sidebar + detail pane, 20pt insets, column split via UISplitViewController.
- **macOS (standard app):** Three-pane — sidebar (225–400pt) + content + optional inspector (280–320pt typical).
- **macOS (document app):** Full-width content with floating inspector panels.

### Whitespace Philosophy

**Less is more, always.** Apple leaves generous vertical space between section groups (32–48pt between grouped table sections). Navigation chrome floats above content — it never competes. The empty space signals intent: this interface is for the task, not decoration. In macOS Tahoe, this extends to the menu bar itself becoming invisible when the task demands full focus.

### Elevation & Depth (Liquid Glass Era)

Depth is now communicated through **Liquid Glass lensing + material opacity**, not shadows:

| Layer | Material | Notes |
|---|---|---|
| 0 — base content | System background color | White / near-black |
| 1 — cards/cells | White surface on gray base | No shadow; color contrast alone |
| 2 — sidebar/toolbar | Liquid Glass (Regular) | Refracts + lenses content beneath |
| 3 — sheets/alerts | Liquid Glass (Regular) | Elevated via stronger lensing |
| 4 — menus/popovers | Liquid Glass (Regular) | Most prominent; whisper-soft 1-stop diffused shadow |

Explicit drop shadows appear **only on menus and popovers** — diffused, ~10–15% opacity, 8–20pt spread radius. Never on cards, buttons, or sidebars.

**The golden rule for Liquid Glass placement:** navigation chrome only. Never apply `.glassEffect()` to content layers, scrollable lists, or full-screen backgrounds.

---

## 6. macOS Control Dimensions (Native AppKit Sizes)

These are the fixed system control heights across Regular / Small / Mini size variants:

| Control | Regular | Small | Mini |
|---|---|---|---|
| Push Button height | ~22pt | ~18pt | ~15pt |
| Checkbox | ~14pt | ~12pt | ~10pt |
| Radio Button | ~14pt | ~12pt | ~10pt |
| Pop-up Menu height | ~22pt | ~18pt | ~15pt |
| Combo Box height | ~22pt | ~18pt | ~15pt |
| Segmented Control height | ~22pt | ~18pt | ~15pt |
| Text Field height | ~22pt | ~19pt | ~16pt |
| Help Button diameter | 20pt | — | — |
| Round Button (Regular) | 25pt Ø | 20pt Ø | — |

**Spacing between controls:**
- Regular: 12pt horizontal, 8pt vertical (checkboxes/radio), 10pt vertical (pop-ups)
- Small: 10pt horizontal, 6pt vertical
- Mini: 8pt horizontal, 5pt vertical

**Slider thumb sizes:**
- Directional (no ticks): Regular 19pt, Small 14pt, Mini 11pt
- Directional (with ticks): Regular 25pt, Small 19pt, Mini 17pt
- Round thumb: Regular 15pt, Small 12pt, Mini 10pt

**Toolbar icon spacing:** 8pt between individual controls in toolbars.

---

## 7. Liquid Glass Material System (macOS Tahoe 26 / iOS 26)

Liquid Glass is the new Apple design material — not a blur, but a **real-time optical lens** that bends and concentrates light like physical glass.

### Two Variants

| Variant | Usage Condition | SwiftUI |
|---|---|---|
| **Regular** | Default — all navigation chrome, sheets, menus | `.glassEffect(.regular)` |
| **Clear** | Only over media-rich content (photos/video) where background won't degrade | `.glassEffect(.clear)` |

Never mix Regular and Clear in the same view. Clear requires: (1) positioned over media-rich content, (2) background won't suffer visual degradation, (3) foreground content is bold and bright.

### Where Liquid Glass Belongs

**Auto-applied (system handles it):**
- NavigationBar, TabBar, Toolbar
- Sheets, Popovers, Menus, Alerts
- Search bars, Control Center toggles, sliders

**Never apply manually:**
- Content layers (lists, cards, tables)
- Full-screen backgrounds
- Scrollable content regions

### Tinting

Reserve tinting exclusively for **primary actions** — never tint secondary controls, never tint multiple elements simultaneously.

```swift
// Primary action (one per view)
.glassEffect(.regular.tint(.blue))

// Secondary action (no tint)
.glassEffect(.regular)

// Button styles
.buttonStyle(.glassProminent)   // opaque, primary
.buttonStyle(.glass)            // translucent, secondary
```

### Container Rule

Multiple glass elements **must** be wrapped in `GlassEffectContainer` — glass cannot properly sample other glass without it.

```swift
GlassEffectContainer(spacing: 30) {
    Button("Cancel") { }.buttonStyle(.glass)
    Button("OK") { }.buttonStyle(.glassProminent)
}
```

### Accessibility Behaviour

| Setting | Liquid Glass Response |
|---|---|
| Reduce Transparency | Frostier, more opaque appearance |
| Increase Contrast | Black/white rendering with distinct borders |
| Reduce Motion | Elastic/shimmer effects disabled |

No additional developer code required — all accessibility adaptations are automatic.

### Morphing / Navigation Transitions

Glass elements can morph fluidly between states using `.glassEffectID()` and a `@Namespace` — the glass shape animates continuously rather than cross-fading.

---

## 8. Iconography & Imagery

**SF Symbols** are the exclusive icon system — over 6,000 symbols designed to optically align with SF Pro at every weight and scale. Icons adapt weight to match adjacent text (`Regular`, `Medium`, `Semibold`, `Bold`). Use `hierarchical`, `palette`, or `multicolor` rendering modes contextually.

Image crops prefer **square or portrait aspect ratios** with rounded corners matching card radius. Artwork is always displayed at native resolution — never upscaled. Album art, app icons, and avatar photos get `continuous` corner curves (squircle, not a simple radius) — the iOS app icon shape is a mathematical superellipse, not a rounded rectangle.

---

## 9. Motion & Animation

Motion is **purposeful and physics-based**, never decorative. Spring animations (`mass: 1, stiffness: 300, damping: 35`) give UI a sense of physical weight. Standard easing: `easeInOut` for contained transitions, `easeOut` for appearing elements, `easeIn` for dismissals.

- **Modal presentation:** Slide up from bottom, 0.35s spring, sheet corner radius matches origin element.
- **Navigation push:** Slide in from trailing edge, parallel title cross-dissolve.
- **Tab switch:** Cross-fade, no slide, preserving position memory.
- **Button press:** Instantaneous scale-down (0.97) + opacity change, spring release on lift.

**Duration targets:** 200ms (micro-interactions), 350ms (view transitions), 500ms (complex choreography). Never exceed 600ms for standard navigation.

---

## 10. macOS Keyboard & Interaction Patterns

> For progressive disclosure patterns (disclosure triangles, inspector panels, hover-reveal, contextual menus, sheets) see the [macos-design skill](.claude/commands/macos-design.md).


**Universal shortcuts every Mac app must support:**

| Action | Shortcut |
|---|---|
| New window/document | `⌘N` |
| Open | `⌘O` |
| Close window | `⌘W` |
| Save | `⌘S` |
| Undo | `⌘Z` |
| Redo | `⌘⇧Z` |
| Cut / Copy / Paste | `⌘X` / `⌘C` / `⌘V` |
| Select All | `⌘A` |
| Find | `⌘F` |
| Quit | `⌘Q` |
| Hide | `⌘H` |
| Minimise | `⌘M` |
| Preferences/Settings | `⌘,` |
| Help | `⌘?` |
| Quick Look preview | `Space` (on selected item) |

**List / grid navigation:**
- `↑` / `↓` — move selection
- `←` / `→` — collapse/expand disclosure or navigate columns
- `⌘↑` / `⌘↓` — jump to top / bottom
- `Delete` — delete selection (with `⌘Z` undo)
- `Return` — open / confirm
- `Escape` — cancel / dismiss

**Pointer interactions:**
- **Single click** — select
- **Double click** — open / edit inline
- **Right-click / Control-click** — contextual menu
- **Click + drag** — reorder (when supported)
- **Hover** — reveal secondary controls (delete buttons, handles) — never require hover to discover primary actions

---

## 11. Stitch Prompting Quick Reference

When using this design system as context for AI screen generation, anchor prompts with these core descriptors:

**General Apple:**
> *"Apple Human Interface Guidelines aesthetic — clean, flat surfaces in `#FFFFFF` and `#F2F2F7`, Signature Apple Blue (`#007AFF`) as the single accent, SF Pro typography starting at 17pt body, 44pt minimum touch targets, 16pt horizontal margins, pill-shaped primary buttons, no decorative shadows, generous whitespace, squircle-rounded image crops."*

**macOS Tahoe (Liquid Glass era):**
> *"Native macOS Tahoe app — Liquid Glass sidebar and toolbar (225–400pt wide sidebar, ~52pt unified title bar), traffic lights 12pt diameter spaced 8pt apart, SF Pro 13pt body, 22pt control heights, three-pane layout (sidebar + content + optional inspector), system accent `#007AFF`, backgrounds `#FFFFFF` light / `#1C1C1E` dark, no decorative shadows on content, glass materials only on navigation chrome, 20pt window corner margins, 8pt horizontal control spacing, 6pt vertical control spacing, complete menu bar required."*
