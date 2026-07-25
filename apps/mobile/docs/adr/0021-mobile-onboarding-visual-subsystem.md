# Onboarding is an always-dark visual sub-system with its own typeface, glyphs, and paywall

Status: superseded by ADR 0022 and [ADR 0023](0023-mobile-two-zone-layered-frontend.md); retained as historical presentation rationale

The pre-chat onboarding funnel ([ADR 0018](0018-mobile-pre-chat-funnel-minimum.md)/[0019](0019-mobile-onboarding-funnel-collapses-to-one-gate.md)) shipped as an omi-modeled shell (full-bleed imagery + a dark bottom sheet). A production-polish pass found it looked unfinished and, worse, silently contradicted the then-current DESIGN.md: pure `#050505` canvas (the guide forbade pure black), 40px radii, scattered hard-coded color literals, a mix of full-color brand PNGs and SF Symbols, no brand typeface, and a Free Trial screen that reused the generic sheet instead of reading like a real paywall.

This ADR historically sanctioned onboarding as a deliberate visual sub-system rather than drift. Its retired DESIGN.md authority is superseded by ADR 0023's domain-owned configuration and architecture contract.

## Context and constraint

Onboarding is a self-contained, cinematic, **always-dark** surface shown once before the relationship begins. Chat is the opposite: a calm, Apple-HIG-native surface that follows the system light/dark scheme. Forcing onboarding's always-dark palette into the scheme-reactive `src/design/theme.ts` would corrupt the chat theme; leaving the literals scattered across the screens is the drift we are removing. So onboarding needs its own centralized token surface, kept visually coherent with the chat brand (same warm near-black, same sage accent).

## Decisions

### 1. Brand typeface: Manrope, onboarding-scoped

Onboarding uses **Manrope** (a warm humanist sans) at weights 400/500/600/700/800, loaded once in `app/_layout.tsx` via `@expo-google-fonts/manrope` + `expo-font` and gated behind first render. **Chat stays SF Pro** (Apple HIG native) — this is not an app-wide font change. Emphasis is by weight and accent color, never a serif; Manrope ships no italic face, so italic is not used. React Native addresses custom fonts by family name, so `onboarding-tokens.ts` exposes `fontFamily(weight)` mapping a numeric weight to the loaded family (`Manrope_600SemiBold`, …).

- _Considered:_ keep system SF Pro everywhere (rejected: onboarding wanted a cohesive, ownable brand feel that the platform font can't carry); a display serif for emphasis (rejected: off-brand for a calm companion).

### 2. Icon language: FontAwesome6 monochrome glyphs

One uniform, muted, **monochrome** glyph set via `@expo/vector-icons` FontAwesome6 — `fa6-brand` for platform logos (TikTok, YouTube, Instagram, X, Reddit, LinkedIn, Apple, Google), `fa6-solid` for generic marks. A single tint: muted near-white unselected → near-black on the selected (near-white) surface. This replaces the mixed set of full-color brand PNGs (`iconTintColor: null`) and SF Symbols that made the list look inconsistent. The color-PNG `ONBOARDING_ICONS` set and `assets/onboarding/icons/*` are retired.

SF Symbols remained the icon language for system chrome elsewhere in that presentation; FA6 brand glyphs were scoped to onboarding brand marks, where SF Symbols had no equivalent.

- _Considered:_ curated monochrome PNGs (rejected: an asset-pipeline burden for what a glyph font gives free); tinting the existing color PNGs (rejected: logos don't read as single-color silhouettes).

### 3. Free Trial is a full-screen paywall, not the bottom-sheet shell

Every other onboarding screen uses the shared `OnboardingScreen` bottom-sheet shell. **Free Trial deliberately does not**: it is a full-screen dark paywall with no backdrop image — a milestone timeline (Today / Day 5 / Day 7 with accent-badged FA6 glyphs), real pricing copy, a primary "Start free trial" CTA, and store-style secondary affordances ("View all plans", "Promo code", "Restore purchases", "Terms of Service"). The colored timeline markers are justified because the timeline is a real typed sequence, not decoration.

Billing is still deferred (v1 has no StoreKit): the CTA writes `trial: "completed"` and advances the gate; the secondary affordances are cosmetic `TODO(polish)` no-ops. The "billing not wired" note moved out of the visible UI into a code comment and a `__DEV__`-only caption.

- _Considered:_ keep the sheet with paywall copy (rejected: a paywall needs full-screen presence and store conventions the sheet can't give); ship real StoreKit now (rejected: v1 has no billing — out of scope).

### 4. Warm near-black canvas + centralized tokens

`src/design/onboarding-tokens.ts` centralized the always-dark palette (warm near-black `#141316`, never pure black), surfaces, borders, muted ink, sage accent, radii, and Manrope family map. This path and presentation are retired; ADR 0023 places current tokens in the global design layer and copy in domain config.

## Consequences

- New dependencies: `expo-font`, `@expo/vector-icons`, `@expo-google-fonts/manrope` (all Expo-ecosystem).
- `app/_layout.tsx` gates first render on font load; a load error is non-fatal (text degrades to the platform font rather than trapping the app).
- `OnboardingChoice` / `OnboardingAction` / `OnboardingInfoRow` take a glyph descriptor (`{ set, name }`) instead of an image source; `OnboardingScreen`'s `trial` backdrop and `assets/onboarding/trial.png` are removed (the paywall has no backdrop).
- The retired DESIGN.md once carried an onboarding visual-subsystem section. ADR 0023 is now authoritative for the mounted frontend's ownership and configuration boundaries.
- Real StoreKit entitlements, persisting the entered name/acquisition source, and publishing the legal pages remain pre-ship dependencies ([`docs/BACKLOGS.md`](../BACKLOGS.md)).
