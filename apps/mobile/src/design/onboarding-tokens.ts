/**
 * Onboarding visual tokens — the always-dark palette, radii, and brand typeface
 * for the pre-chat onboarding sub-system (Get Started → Identity → Consent Primer
 * → funnel → Sibling Invitation → Free Trial). See apps/mobile/docs/adr/0021-*.
 *
 * WHY this lives outside `theme.ts`: onboarding is a self-contained, *always-dark*
 * cinematic surface (full-bleed imagery + a dark sheet), not a light/dark surface
 * that follows the system scheme. Forcing an always-dark palette into the
 * scheme-reactive `theme.ts` would corrupt the chat theme; scattering hard-coded
 * literals across the screens (the pre-polish state) is the drift this replaces.
 * Values are DESIGN.md-aligned (warm near-black `#141316`, no pure black; sage
 * accent lightened for dark) so onboarding reads as the same brand as chat.
 *
 * The brand typeface (Manrope) is onboarding-scoped; chat stays SF Pro (Apple
 * HIG). `fontFamily(weight)` resolves a weight to the exact loaded family name —
 * React Native selects custom fonts by family name, not by `fontWeight`.
 */

/** Manrope weight → the family name registered by `useFonts` in `app/_layout.tsx`. */
export const onboardingFonts = {
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  extrabold: "Manrope_800ExtraBold",
} as const;

export type OnboardingFontWeight = 400 | 500 | 600 | 700 | 800;

/**
 * Resolve a numeric weight to its Manrope family name. Use this instead of
 * `fontWeight` on onboarding `Text` — a custom font renders its true weight only
 * when addressed by the family the glyphs were loaded under.
 */
export function fontFamily(weight: OnboardingFontWeight): string {
  switch (weight) {
    case 400:
      return onboardingFonts.regular;
    case 500:
      return onboardingFonts.medium;
    case 600:
      return onboardingFonts.semibold;
    case 700:
      return onboardingFonts.bold;
    case 800:
      return onboardingFonts.extrabold;
  }
}

/**
 * The always-dark onboarding palette. Warm near-black, warm off-white ink, one
 * sage accent — never pure black, never a scheme flip. AA-verified for body and
 * muted ink over `canvas`.
 */
export const onboardingColors = {
  /** Full-screen canvas behind the imagery scrims and the bottom sheet. */
  canvas: "#141316",
  /** The dark sheet / Free Trial panel — matches the canvas for a seamless base. */
  sheet: "#141316",
  /** Field, choice, permission, and info surfaces — one tonal step above canvas. */
  surface: "#232128",
  /** Selected choice / active surface — warm near-white. */
  surfaceSelected: "#EDEAE4",
  /** Hairline borders on surfaces. */
  border: "rgba(238, 235, 230, 0.10)",
  /** Stronger border for unselected choice pills / controls. */
  borderStrong: "rgba(238, 235, 230, 0.22)",
  /** Titles and primary ink. */
  ink: "#F1EEE9",
  /** Body copy. AA ≥ 4.5:1 on `canvas` / `surface`. */
  inkMuted: "#B8B4AE",
  /** Fine print and secondary metadata. AA ≥ 4.5:1 on `canvas`. */
  inkSubtle: "#918D87",
  /** Ink on a selected (near-white) surface. */
  inkInverse: "#141316",
  /** Muted ink on a selected surface. */
  inkInverseMuted: "rgba(20, 19, 22, 0.60)",
  /** Muted monochrome brand glyph, unselected. */
  glyph: "#C9C5BF",
  /** Brand glyph on a selected surface. */
  glyphSelected: "#141316",
  /** Sage brand accent (dark-appearance value; onboarding is always dark). */
  accent: "#6B9E8A",
  /** Ink on the sage accent CTA — dark ink per DESIGN.md button rule. */
  accentInk: "#0F1A16",
  /** Placeholder text in inputs. */
  placeholder: "#8B8781",
  /** Image scrims that seat the sheet against the backdrop. */
  scrimSoft: "rgba(0, 0, 0, 0.18)",
  scrimStrong: "rgba(0, 0, 0, 0.42)",
  /** Translucent chrome control (back button) over imagery. */
  control: "rgba(0, 0, 0, 0.34)",
  /** Progress dot, inactive. */
  dotIdle: "rgba(255, 255, 255, 0.42)",
  /** Fade over the scrollable choice list. */
  listFade: "rgba(20, 19, 22, 0.90)",
} as const;

/** Radii — DESIGN.md-aligned (16/20 cards, pill only where an affordance wants it). */
export const onboardingRadii = {
  field: 16,
  card: 20,
  sheet: 28,
  pill: 999,
} as const;
