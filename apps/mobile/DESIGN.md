---
version: alpha
name: Intentive Mobile Client
description: Visual design system for the Intentive Expo companion chat app — calm, continuous, native on iOS, with light and dark appearance.
colors:
  primary: "#1C1B1F"
  secondary: "#5C5A62"
  tertiary: "#3D6B5E"
  neutral: "#F5F3F0"
  surface: "#FFFFFF"
  on-surface: "#1C1B1F"
  surface-elevated: "#FAF9F7"
  surface-muted: "#EEEBE6"
  user-bubble: "#E8E6E1"
  assistant-bubble: "#FFFFFF"
  accent: "#3D6B5E"
  accent-muted: "#5A8A7A"
  thinking: "#7A7568"
  follow-up: "#6B5C4A"
  paused: "#8A8580"
  error: "#B8422E"
  border: "#D8D4CC"
  border-subtle: "#E8E4DC"
  dark-neutral: "#141316"
  dark-surface: "#1F1E22"
  dark-on-surface: "#EEEBE6"
  dark-surface-elevated: "#28262C"
  dark-surface-muted: "#1A191D"
  dark-primary: "#EEEBE6"
  dark-secondary: "#9C989F"
  dark-tertiary: "#6B9E8A"
  dark-user-bubble: "#2A282E"
  dark-assistant-bubble: "#1F1E22"
  dark-accent: "#6B9E8A"
  dark-accent-muted: "#5A8A7A"
  dark-thinking: "#A8A39A"
  dark-follow-up: "#C4A882"
  dark-paused: "#8A8580"
  dark-error: "#E86A52"
  dark-border: "#3A383F"
  dark-border-subtle: "#2A282E"
typography:
  headline-lg:
    fontFamily: System
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.02em
  headline-md:
    fontFamily: System
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.01em
  body-lg:
    fontFamily: System
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.45
  body-md:
    fontFamily: System
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: System
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.45
  label-md:
    fontFamily: System
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0.01em
  label-sm:
    fontFamily: System
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0.02em
  caption:
    fontFamily: System
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: 0.01em
  composer:
    fontFamily: System
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.35
  agent-state:
    fontFamily: System
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0.02em
rounded:
  none: 0px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  bubble: 18px
  composer: 22px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  bubble-gap: 6px
  thread-padding: 16px
  composer-padding: 12px
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: 12px
  button-secondary:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 12px
  message-user:
    backgroundColor: "{colors.user-bubble}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.bubble}"
    padding: 12px
  message-assistant:
    backgroundColor: "{colors.assistant-bubble}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.bubble}"
    padding: 12px
  composer-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.composer}"
    rounded: "{rounded.composer}"
    padding: 12px
  agent-state-chip:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.thinking}"
    typography: "{typography.agent-state}"
    rounded: "{rounded.full}"
    padding: 6px
  continuity-event:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.secondary}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: 8px
  button-primary-dark:
    backgroundColor: "{colors.dark-accent}"
    textColor: "#141316"
    rounded: "{rounded.md}"
    padding: 12px
  button-secondary-dark:
    backgroundColor: "{colors.dark-surface-muted}"
    textColor: "{colors.dark-primary}"
    rounded: "{rounded.md}"
    padding: 12px
  message-user-dark:
    backgroundColor: "{colors.dark-user-bubble}"
    textColor: "{colors.dark-on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.bubble}"
    padding: 12px
  message-assistant-dark:
    backgroundColor: "{colors.dark-assistant-bubble}"
    textColor: "{colors.dark-on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.bubble}"
    padding: 12px
  composer-field-dark:
    backgroundColor: "{colors.dark-surface-elevated}"
    textColor: "{colors.dark-on-surface}"
    typography: "{typography.composer}"
    rounded: "{rounded.composer}"
    padding: 12px
  agent-state-chip-dark:
    backgroundColor: "{colors.dark-surface-muted}"
    textColor: "{colors.dark-thinking}"
    typography: "{typography.agent-state}"
    rounded: "{rounded.full}"
    padding: 6px
  continuity-event-dark:
    backgroundColor: "{colors.dark-surface-muted}"
    textColor: "{colors.dark-secondary}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: 8px
---

# Intentive Mobile Client

## Overview

Intentive is a **chat-first companion surface**, not a productivity dashboard. The visual language should feel **quiet, warm, and present** — easy to open, emotionally low-friction, and trustworthy over time. Users return for **continuity** and gentle **follow-through**, not task management chrome.

**Brand personality:** Calm confidence. The companion is attentive without being loud; the UI stays out of the way of the relationship.

**Target feel (Apple HIG alignment):**

- **Clarity:** Conversation and agent state are legible at a glance; decorative UI is minimal.
- **Deference:** Content (messages, continuity cues) leads; chrome recedes.
- **Depth:** Hierarchy comes from tonal layers and native navigation, not heavy shadows or dense furniture.

**Platform stance:** iOS-first native patterns via Expo Router (native stack, system typography, SF Symbols, safe areas, haptics). **Light and dark** follow system appearance by default. Android inherits the same token pairs with Material-appropriate elevation where needed.

**Product guardrails (from CONTEXT.md):**

- V1 opens to **Companion Chat** — no dashboard, task grid, streaks, or multi-tab productivity shell.
- **Agent State** is visible but subtle: Available, Thinking, Following up, Paused.
- Structure (follow-ups, boundaries, memory) appears as **lightweight conversational affordances** or sheets — never primary navigation.

## Colors

The palette is **warm neutral** with a single **sage accent** — organic and restful, not clinical or gamified.

| Role | Token | Hex | Usage |
|------|-------|-----|--------|
| Ink | `primary` | #1C1B1F | Headlines, primary text, navigation titles |
| Slate | `secondary` | #5C5A62 | Metadata, timestamps, secondary labels |
| Sage | `tertiary` / `accent` | #3D6B5E | Primary actions, send affordance, key highlights |
| Limestone | `neutral` | #F5F3F0 | App background, thread canvas |
| Paper | `surface` | #FFFFFF | Assistant bubbles, composer, sheets |
| Warm gray | `user-bubble` | #E8E6E1 | User message bubbles |
| Muted | `surface-muted` | #EEEBE6 | Agent state chips, continuity events |
| Ember | `error` | #B8422E | Errors and destructive confirmations only |

**Semantic agent colors** (use sparingly, never as full-screen fills):

- `thinking` — companion is processing
- `follow-up` — proactive loop re-entry
- `paused` — boundary or user pause

Prefer **tonal layers** over tinted chrome — in both appearances.

### Dark appearance

Dark mode is **warm near-black**, not pure OLED black. Surfaces step up in lightness; text is warm off-white. The sage accent **lightens** (`dark-accent`) so it stays legible on dark canvas.

| Role | Token | Hex | Light analogue |
|------|-------|-----|----------------|
| Canvas | `dark-neutral` | #141316 | `neutral` |
| Ink | `dark-primary` | #EEEBE6 | `primary` |
| Slate | `dark-secondary` | #9C989F | `secondary` |
| Sage | `dark-accent` | #6B9E8A | `accent` |
| Paper | `dark-surface` | #1F1E22 | `surface` |
| Elevated | `dark-surface-elevated` | #28262C | `surface-elevated` |
| User bubble | `dark-user-bubble` | #2A282E | `user-bubble` |
| Assistant bubble | `dark-assistant-bubble` | #1F1E22 | `assistant-bubble` |
| Muted | `dark-surface-muted` | #1A191D | `surface-muted` |
| Ember | `dark-error` | #E86A52 | `error` |

**Semantic agent colors (dark):** `dark-thinking`, `dark-follow-up`, `dark-paused` — same roles as light; never full-screen fills.

**Contrast:** Maintain **WCAG AA** (4.5:1) for `dark-on-surface` on `dark-assistant-bubble` and `dark-user-bubble`. Primary buttons use **dark ink text** (`#141316`) on `dark-accent` for send/confirm.

**Implementation:** Resolve appearance once per tree (see Implementation Notes). Map semantic roles → `colors.*` (light) or `colors.dark-*` (dark). Component tokens: `message-user` / `message-user-dark`, etc.

## Typography

Typography follows **Apple Human Interface Guidelines**: system fonts (SF Pro on iOS), dynamic type–friendly sizes, and comfortable line lengths for long reading in chat.

| Level | Token | Role |
|-------|-------|------|
| Large title | `headline-lg` | Rare; settings or sheet titles only — prefer stack `title` |
| Title | `headline-md` | Section headers inside sheets |
| Message | `body-md` | User and assistant bubbles (default) |
| Composer | `composer` | Text input (17px matches iOS text fields) |
| Label | `label-md` / `label-sm` | Agent state, buttons, boundary controls |
| Caption | `caption` | Timestamps, continuity hints, metadata |

**Rules:**

- Use **navigation stack titles** for screen names — do not duplicate with a custom headline on the chat home route.
- Set `selectable` on message text and important data.
- Use `{ fontVariant: 'tabular-nums' }` for timestamps and numeric counters.
- Limit to **two weights per screen** (typically 400 + 600).

## Layout

**Chat-first layout model:**

```
┌─────────────────────────────┐
│  Native stack header        │  ← title, agent state (optional trailing)
├─────────────────────────────┤
│  ScrollView / FlashList     │  ← contentInsetAdjustmentBehavior="automatic"
│    continuity events        │
│    message thread           │
│    typing / thinking affordance
├─────────────────────────────┤
│  Composer (safe area bottom)│
└─────────────────────────────┘
```

**Spacing scale:** 4px base step with 8px rhythm (`xs` 4 → `xl` 32). Thread horizontal padding: `thread-padding` (16px). Bubble vertical gap: `bubble-gap` (6px).

**Responsiveness (Expo native UI):**

- Wrap scrollable content; use `contentInsetAdjustmentBehavior="automatic"` on ScrollView, FlatList, and FlashList.
- Prefer **flexbox** and `gap` over margin chains; prefer **padding** over margin inside containers.
- Use `useWindowDimensions` when breakpoints matter; avoid `Dimensions.get()`.
- Account for safe areas via stack headers, native tabs, or scroll insets — never clip the composer under the home indicator.

**Route structure:** Routes live under `app/` only. Do not co-locate components in `app/`. V1 may use a minimal stack with a single chat route at `/`; secondary flows use **modal** or **formSheet** presentation, not new primary tabs.

## Elevation & Depth

Depth is conveyed through **tonal layers**, not heavy elevation.

- **Light canvas:** `neutral` · **Dark canvas:** `dark-neutral`
- **Content:** Bubbles sit one step above canvas (`user-bubble` / `dark-user-bubble`); assistant matches or elevates from surface
- **Chrome:** Prefer `PlatformColor` (`label`, `secondaryLabel`, `systemBackground`, `separator`) where they track system dark mode; override with tokens when brand warmth must stay consistent
- **Shadows:** Light mode — minimal `boxShadow` on composer only. Dark mode — **no shadows** on bubbles; rely on tonal separation. Never legacy `shadowOffset` / `elevation` on messages

Sheets and modals may use **liquid glass** (`expo-glass-effect`, transparent `contentStyle` on form sheets) on iOS 26+; chat thread stays flat in both appearances.

## Shapes

Shape language is **soft continuous** — approachable, not sharp productivity UI.

- Message bubbles: `rounded.bubble` (18px) with `{ borderCurve: 'continuous' }`
- Composer: `rounded.composer` (22px), capsule send button `rounded.full`
- Chips (agent state, boundaries): `rounded.full`
- Cards/sheets: `rounded.lg` (16px)
- Avoid mixing sharp 0px corners with large radii on the same screen

## Components

### Companion Chat (primary surface)

The home experience is a **single continuous thread**.

- **Message list:** Virtualize with FlashList when history grows; memoize row components.
- **User bubble:** `message-user` (light) or `message-user-dark`; align trailing (end).
- **Assistant bubble:** `message-assistant` or `message-assistant-dark`; align leading; use `border-subtle` / `dark-border-subtle` stroke only if contrast audit requires.
- **Continuity event:** Centered or inset `continuity-event` — short copy (“Remembered …”) — never modal-sized.
- **Composing indicator:** Render as an assistant-side bubble with an animated ellipsis only while a real assistant message is in flight, including the first runtime-generated onboarding opening. During the protected onboarding opening, allow drafting but disable send until the opening arrives.
- **Opening recovery:** If the protected onboarding opening fails, replace the composing bubble inline with quiet error copy and one `Try again` action; keep draft text and the deferred-send state intact.

### Composer

- Multi-line text field using `composer-field` or `composer-field-dark` tokens
- Send enabled only when input non-empty; haptic on send (iOS, `expo-haptics`)
- During the protected onboarding opening, preserve editable draft text while the send affordance is temporarily unavailable.
- During opening recovery, retain the same draft and unavailable send affordance until retry succeeds or a later explicit exit path exists.
- Keep composer **fixed above safe area**; keyboard avoidance via native behavior
- Do not add attachment grids or formatting toolbars in V1

### Agent State

Visible states: **Available**, **Thinking**, **Following up**, **Paused**.

- Render as `agent-state-chip` in header trailing or subtle inline strip
- Copy is short and honest. The assistant composing bubble is separate from general state and appears only for a real in-flight response; never animate it while idle.
- Whether day-to-day companion-initiated messages allow concurrent sending is TBD; do not apply the onboarding send rule by default.
- Color hints: `thinking`, `follow-up`, `paused` — never pulse or bounce by default

### Navigation & secondary flows

Follow **Expo Router native UI** patterns:

- `Link` from `expo-router` with `Link.Trigger`, `Link.Menu`, `Link.Preview` where previews help (settings, follow-up detail)
- Stack titles via `<Stack.Screen options={{ title }} />` — not duplicate `Text` titles
- Boundaries, defer, pause: **context menu** or **formSheet** — not a settings maze
- Modals: `presentation: "modal"`; partial sheets: `presentation: "formSheet"` with `sheetAllowedDetents`

### Buttons & controls

- **Primary:** `button-primary` — one per screen maximum
- **Secondary:** `button-secondary` — defer, “not now,” dismiss
- **Destructive:** `error` text/background — boundary reject, forget — always confirm in sheet or alert
- Prefer native **Switch**, **SegmentedControl**, **DateTimePicker** over custom controls when applicable

### Icons

- **SF Symbols** via `expo-image` with `source="sf:symbol.name"` — not `@expo/vector-icons` for system chrome
- Symbol weight matches text weight; prefer semantic names (`pause.circle`, `arrow.clockwise`)

### Lists & settings (deferred / minimal)

When lists appear later in v1 (e.g., the Account Surface), use native row patterns: leading icon, title, optional subtitle, chevron. No dense task board. Dividers: `border-subtle`.

## Implementation Notes (Expo)

These constraints apply when implementing tokens in React Native / Expo:

| Topic | Rule |
|-------|------|
| Styling | Inline styles or reused objects; **no CSS/Tailwind** in native views |
| Colors | `useColorScheme()` (or `Appearance`) → pick `colors.*` vs `colors.dark-*`; optional `PlatformColor` for chrome |
| Dark mode | Ship both appearances from V1; respect system setting; no light-only screens |
| Theme helper | Central `theme.ts` / `use-theme.ts` exposing `{ colors, components, isDark }` from DESIGN tokens |
| Library | `expo-image`, `react-native-safe-area-context`, `expo-router/stack`, `process.env.EXPO_OS` |
| Animation | Reanimated entering/exiting on state changes; GPU-friendly props only |
| Files | kebab-case (`message-bubble.tsx`); path aliases in `tsconfig` |
| Dev workflow | **Expo Go first**; custom dev client only for native modules not in Go |

See [Expo building-native-ui skill](https://github.com/expo/skills/blob/main/plugins/expo/skills/building-native-ui/SKILL.md) for route structure, tabs, headers, blur, and form sheets.

**Theme resolution (required pattern):**

```tsx
import { useColorScheme } from "react-native";

// tokens from DESIGN.md frontmatter → theme/colors.ts
const light = { canvas: "#F5F3F0", onSurface: "#1C1B1F", userBubble: "#E8E6E1", /* ... */ };
const dark = { canvas: "#141316", onSurface: "#EEEBE6", userBubble: "#2A282E", /* ... */ };

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  return { colors: isDark ? dark : light, isDark };
}
```

Set `userInterfaceStyle: "automatic"` in `app.json` so the native shell follows the system. Stack headers can use `headerTitleStyle: { color: PlatformColor("label") }` when you want Apple-managed label colors alongside tokenized chat content.

## Do's and Don'ts

**Do**

- Open the app directly into **Companion Chat**
- Use native stack headers and system typography
- Keep the thread calm: generous whitespace, readable 16–17px body
- Show **agent state** honestly and lightly
- Use haptics sparingly on meaningful actions (send, confirm boundary)
- Present follow-ups and boundaries as **conversation-adjacent** sheets or inline cues
- Maintain **WCAG AA** contrast in **both** light and dark (4.5:1 body on bubble/surface)
- Respect **system appearance**; test chat thread in Settings → Display → Dark
- Prefer `headerSearchBarOptions` only when search is a real feature — not V1 default

**Don't**

- Build a dashboard, task grid, streak counter, or multi-tab productivity shell
- Use gamification colors, badge explosions, or notification-red urgency for follow-ups
- Block the full screen with spinners; don’t fake autonomy with animated avatars
- Duplicate stack titles with large custom headlines
- Mix legacy RN shadows/elevation with tokenized `boxShadow`
- Co-locate components under `app/`
- Use removed RN APIs (`SafeAreaView` from RN core, legacy `AsyncStorage`, `expo-av`)
- Add CSS/Tailwind to native chat views
- Use more than one **primary** button per screen
- Treat “mock agent” UI differently from production — **Runtime Adapter** boundary stays the same
- Ship light-only UI or hard-code `#FFFFFF` backgrounds — breaks dark mode
- Use pure `#000000` canvas — too harsh; use `dark-neutral`
- Keep the same accent hex in dark mode without lightening — fails contrast on dark surfaces

---

*Format: [DESIGN.md specification](https://stitch.withgoogle.com/docs/design-md/specification) · Product: [CONTEXT.md](./CONTEXT.md) · ADRs: [docs/adr/](./docs/adr/)*
