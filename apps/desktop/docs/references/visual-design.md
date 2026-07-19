# Visual Design Reference

## Table of Contents
1. Light & Dark Mode
2. Color System
3. Typography
4. Blur, Vibrancy & Translucency
5. Shadows & Depth
6. Iconography
7. Spacing & Sizing

---

## 1. Light & Dark Mode

**Critical rule: Do NOT directly invert colors between modes.**

Each mode is designed independently. What works in light doesn't work inverted.

### Light Mode
```css
:root {
  --bg-primary: #FFFFFF;
  --bg-secondary: #F5F5F7;
  --bg-tertiary: #EBEBED;
  --bg-elevated: #FFFFFF;
  --bg-sidebar: #F0F0F2;

  --text-primary: #1D1D1F;
  --text-secondary: #6E6E73;
  --text-tertiary: #AEAEB2;
  --text-placeholder: #C7C7CC;

  --border: rgba(0, 0, 0, 0.08);
  --border-strong: rgba(0, 0, 0, 0.15);

  --accent: #007AFF;
  --accent-hover: #0066CC;

  --surface-blur: rgba(255, 255, 255, 0.72);
  --shadow-color: rgba(0, 0, 0, 0.12);
}
```

### Dark Mode
```css
@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #1C1C1E;
    --bg-secondary: #2C2C2E;
    --bg-tertiary: #3A3A3C;
    --bg-elevated: #2C2C2E;
    --bg-sidebar: #242426;

    --text-primary: #F5F5F7;
    --text-secondary: #AEAEB2;
    --text-tertiary: #6E6E73;
    --text-placeholder: #48484A;

    --border: rgba(255, 255, 255, 0.08);
    --border-strong: rgba(255, 255, 255, 0.15);

    --accent: #0A84FF;
    --accent-hover: #409CFF;

    --surface-blur: rgba(28, 28, 30, 0.72);
    --shadow-color: rgba(0, 0, 0, 0.4);
  }
}
```

### Apple System Accent Colors

| Color  | Light     | Dark      |
|--------|-----------|-----------|
| Blue   | #007AFF   | #0A84FF   |
| Green  | #34C759   | #30D158   |
| Red    | #FF3B30   | #FF453A   |
| Orange | #FF9500   | #FF9F0A   |
| Yellow | #FFCC00   | #FFD60A   |
| Purple | #AF52DE   | #BF5AF2   |
| Pink   | #FF2D55   | #FF375F   |
| Teal   | #5AC8FA   | #64D2FF   |

---

## 2. Color System

Hierarchy through backgrounds, not borders.

```
Level 0 (base):     --bg-primary       (main window background)
Level 1 (sections): --bg-secondary     (sidebar, header)
Level 2 (cards):    --bg-tertiary      (card backgrounds, list items)
                    --bg-elevated      (floating panels, dropdowns)
Level 3 (inputs):   slightly different from container
```

**Rules:**
- Use borders sparingly — 0.5px, low opacity only
- Accent color only for interactive elements (buttons, links, active states)
- Never use accent color as a large background
- Semantic colors: green for success, red for destructive, yellow for warning
- No pure white (#FFFFFF) backgrounds in dark mode — use #1C1C1E minimum

---

## 3. Typography

Font stack:
```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text",
             "Helvetica Neue", Arial, sans-serif;
```

SF Pro Display is used for 20px and above. SF Pro Text for smaller sizes. The OS serves the right variant automatically via `-apple-system`.

### Type Scale

| Name        | Size | Weight  | Use case                           |
|-------------|------|---------|------------------------------------|
| Large Title | 26px | Bold    | App title, major headings          |
| Title 1     | 22px | Bold    | Section headers                    |
| Title 2     | 18px | Semibold| Card titles                        |
| Title 3     | 16px | Semibold| Sub-sections                       |
| Headline    | 14px | Semibold| List headers, emphasized labels    |
| Body        | 13px | Regular | Default body text                  |
| Callout     | 13px | Medium  | Emphasized body, metadata          |
| Subhead     | 12px | Regular | Secondary descriptions             |
| Footnote    | 11px | Regular | Captions, timestamps               |
| Caption 1   | 10px | Regular | Very small labels                  |
| Caption 2   | 10px | Medium  | Tags, badges                       |
| Mini        | 9px  | Medium  | Keyboard shortcut hints            |

**Letter spacing:**
- Headlines (Title 1+): `-0.03em` to `-0.02em`
- Body and below: `-0.01em` or `0`
- Uppercase labels: `0.06em`

**Monospace:**
```css
font-family: "SF Mono", "Menlo", "Monaco", "Cascadia Code", monospace;
```

---

## 4. Blur, Vibrancy & Translucency

The defining macOS visual feature.

```css
.vibrancy {
  background: var(--surface-blur);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
}
```

**Always include `saturate(180%)`** — without it, colors behind the blur appear washed out. The saturation boost compensates for the lightening effect of the blur.

**Use on:**
- Sidebars
- Top bars / title bars
- Floating panels and popovers
- Quick-access windows
- Toast notifications
- Floating action bars
- Menu bar items

**Do NOT use on:**
- Main content area
- Modal overlays/backdrops
- Body text containers
- Large solid background areas

**Blur intensity guide:**
- `blur(8px)` — subtle, for cards slightly elevated from background
- `blur(20px)` — standard vibrancy (sidebars, panels)
- `blur(40px)` — strong, for floating windows above heavy content

---

## 5. Shadows & Depth

Layered shadows create the sense of floating without looking heavy.

**Level 1 — Subtle (cards, buttons):**
```css
box-shadow:
  0 0 0 0.5px rgba(0,0,0,0.08),
  0 1px 3px rgba(0,0,0,0.06);
```

**Level 2 — Medium (dropdowns, popovers):**
```css
box-shadow:
  0 0 0 0.5px rgba(0,0,0,0.1),
  0 4px 12px rgba(0,0,0,0.1),
  0 2px 4px rgba(0,0,0,0.06);
```

**Level 3 — Heavy (floating windows, modals):**
```css
box-shadow:
  0 0 0 0.5px rgba(0,0,0,0.12),
  0 8px 30px rgba(0,0,0,0.15),
  0 2px 8px rgba(0,0,0,0.08);
```

**Window shadow:**
```css
box-shadow:
  0 0 0 0.5px rgba(0,0,0,0.1),
  0 2px 8px rgba(0,0,0,0.08),
  0 8px 30px rgba(0,0,0,0.12),
  0 20px 60px rgba(0,0,0,0.08);
```

**The `0 0 0 0.5px` trick**: This gives a subtle edge definition without a visible border line. Essential macOS detail. Every element benefits from it.

**Dark mode**: Increase opacity ~2x on all shadow values. Dark surfaces need stronger shadows to create depth.

---

## 6. Iconography

Follow SF Symbols design language, even when using custom icons.

**Style rules:**
- Monoline stroke, 1.5-2px weight
- Geometric, slightly rounded terminals
- Use `currentColor` so icons inherit text color
- Slight rounded corners on rectangular shapes

**Sizes:**
```
12px — inline hints, keyboard shortcut icons
16px — default UI icons (sidebar, buttons, list items)
20px — prominent actions (top bar, floating bar)
24px — large actions, empty states
32px+ — hero/feature icons only
```

**Common icons (use Unicode or SVG matching SF Symbols):**
- Search: magnifying glass
- Settings/Preferences: gear (⚙)
- Share: square with up-arrow
- Add/New: plus circle or plain +
- Close: ×
- Back: chevron left ‹
- Sidebar toggle: sidebar icon
- Grid view: 2×2 grid
- List view: three horizontal lines
- Trash/Delete: trash can

**Icon-only buttons must have tooltips.** Use `title` attribute at minimum; custom tooltip for styled appearance.

---

## 7. Spacing & Sizing

Everything on an 8px base grid.

### Common Spacings

| Context              | Value      |
|----------------------|------------|
| Window edge padding  | 16-20px    |
| Section padding      | 12-16px    |
| Card internal padding| 12-16px    |
| Card gap (grid)      | 12-16px    |
| Inline icon gap      | 6-8px      |
| Button padding       | 8px 12px   |
| List item padding    | 8px 12px   |
| Micro spacing        | 4px        |

### Interactive Element Heights

| Element              | Height     |
|----------------------|------------|
| Top bar / title bar  | 48-52px    |
| Button (standard)    | 28px       |
| Input field          | 28px       |
| List row (compact)   | 36px       |
| List row (standard)  | 44px       |
| Sidebar item         | 32px       |
| Tab bar item         | 48px       |
| Menu item            | 22px       |

### Corner Radii

| Element              | Radius     |
|----------------------|------------|
| Window               | 10px       |
| Modal / sheet        | 12px       |
| Card                 | 8px        |
| Button               | 6px        |
| Input field          | 6px        |
| Tag / badge          | 4px        |
| Toggle / pill        | 14px (full)|
| Tooltip              | 6px        |
| Context menu         | 8px        |
