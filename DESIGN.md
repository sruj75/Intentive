# Design System: Apple Human Interface Guidelines

**Source:** [designsystems.surf/design-systems/apple](https://designsystems.surf/design-systems/apple)  
**Reference:** Apple Human Interface Guidelines — iOS 18 / macOS 15 Sequoia  
**Platforms:** iOS · iPadOS · macOS · visionOS

---

## 1. Visual Theme & Atmosphere

Apple's design language is **precise, airy, and deferential** — the interface exists to serve the content, never to assert itself. Surfaces feel physically real: glass-like layers stack with depth conveyed through blur and translucency rather than heavy drop shadows. Whitespace is used aggressively, giving every element room to breathe. The aesthetic sits at the intersection of **Swiss grid discipline** and **Californian warmth** — mathematical in its spacing, approachable in its curves.

The overall mood: **Clean confidence.** Nothing decorative that isn't also functional. Color is used sparingly but meaningfully — a single vibrant accent on an otherwise neutral canvas creates hierarchy without noise. Dark mode is a first-class citizen, not an afterthought — materials invert naturally and maintain perceived depth.

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

**Navigation Bar:**  
Translucent material background (blur + tint). Large title collapses to inline title on scroll. Back button uses SF Symbol `chevron.left` + destination label text in Signature Apple Blue. Height: 44pt (compact) expanding to ~96pt with large title.

**Tab Bar:**  
49pt height (plus home indicator inset). Selected tab icon + label in Signature Apple Blue, unselected in Graphite (`#8E8E93`). Background: ultra-thin material.

**Sidebar (macOS/iPadOS):**  
Ultra-thin material, icons use SF Symbols at 16pt. Selected item: Signature Apple Blue at 15% opacity pill-shaped highlight. Width: 200–320pt.

---

## 5. Layout Principles

### Spacing Grid

Apple does not impose a strict 8pt grid universally but uses a **4pt base unit** with multiples of 4 as the primary spacing vocabulary:

| Value | Usage |
|---|---|
| 4pt | Micro-gaps between icon and label, badge offsets |
| 8pt | Tight internal component padding (chips, badges) |
| 12pt | Standard vertical padding within cells |
| 16pt | **Standard content margin** — primary horizontal inset (iPhone) |
| 20pt | iPad standard horizontal inset |
| 24pt | Generous section spacing, hero padding |
| 32pt+ | Hero section vertical breathing room |

### Safe Area & Insets

All content respects dynamic safe areas: top (status bar + navigation bar), bottom (home indicator + tab bar), and leading/trailing. Content never bleeds into safe areas except for full-bleed backgrounds and materials.

**Minimum touch target:** 44×44pt — even when visual appearance is smaller, the tappable area expands.

### Grid & Column System

- **iPhone (390pt width):** Single column, 16pt margins, full-width content.
- **iPad (768pt+):** Two-column split view, sidebar + detail pane, 20pt insets.
- **macOS:** Three-pane layouts (sidebar + content + inspector), fluid-width columns.

### Whitespace Philosophy

**Less is more, always.** Apple leaves generous vertical space between section groups (32–48pt between grouped table sections). Icons breathe — never crowd a glyph. Navigation titles stand alone — never compete with content. The empty space signals intent: this interface is for the task, not for decoration.

### Elevation & Depth

Depth is communicated through **materials (blur + translucency)**, not shadows:
- **Layer 0 (base):** System background colors.
- **Layer 1 (cards/cells):** White surface atop gray base, no shadow.
- **Layer 2 (sheets/alerts):** Thick material (frosted blur) lifted above content.
- **Layer 3 (menus/popovers):** Regular material, appears floating, whisper-soft 1-stop shadow.

Explicit box shadows appear only on menus and popovers — extremely diffused, very low opacity (~10–15%), large spread radius (8–20pt). Never on cards or buttons.

---

## 6. Iconography & Imagery

**SF Symbols** are the exclusive icon system — over 6,000 symbols designed to optically align with SF Pro at every weight and scale. Icons adapt weight to match adjacent text (`Regular`, `Medium`, `Semibold`, `Bold`). Use `hierarchical`, `palette`, or `multicolor` rendering modes contextually.

Image crops prefer **square or portrait aspect ratios** with rounded corners matching card radius. Artwork is always displayed at native resolution — never upscaled. Album art, app icons, and avatar photos get `continuous` corner curves (squircle, not a simple radius) — the iOS app icon shape is a mathematical superellipse, not a rounded rectangle.

---

## 7. Motion & Animation

Motion is **purposeful and physics-based**, never decorative. Spring animations (`mass: 1, stiffness: 300, damping: 35`) give UI a sense of physical weight. Standard easing: `easeInOut` for contained transitions, `easeOut` for appearing elements, `easeIn` for dismissals.

- **Modal presentation:** Slide up from bottom, 0.35s spring, sheet corner radius matches origin element.
- **Navigation push:** Slide in from trailing edge, parallel title cross-dissolve.
- **Tab switch:** Cross-fade, no slide, preserving position memory.
- **Button press:** Instantaneous scale-down (0.97) + opacity change, spring release on lift.

**Duration targets:** 200ms (micro-interactions), 350ms (view transitions), 500ms (complex choreography). Never exceed 600ms for standard navigation.

---

## Stitch Prompting Quick Reference

When using this design system as context for AI screen generation, anchor prompts with these core descriptors:

> *"Apple Human Interface Guidelines aesthetic — clean, flat surfaces in `#FFFFFF` and `#F2F2F7`, Signature Apple Blue (`#007AFF`) as the single accent, SF Pro typography starting at 17pt body, 44pt minimum touch targets, 16pt horizontal margins, pill-shaped primary buttons, frosted-glass modal sheets, no decorative shadows, generous whitespace, squircle-rounded image crops."*
