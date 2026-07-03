/**
 * Free Trial — the entitlement gate that sits just before chat. Its own gate
 * (not folded into the funnel) because entitlement re-checks on expiry: a lapsed
 * user sees it again, a subscriber never does (see apps/mobile/docs/adr/0019-*).
 * The primary action writes `trial: "completed"` into Launch State via the store's
 * `setTrial` mutator; the resolver/root layout owns the Launch Route to chat.
 *
 * Unlike every other onboarding surface, this is a **full-screen** Free Trial
 * offer, not the `OnboardingScreen` bottom sheet: no backdrop image, a milestone
 * timeline, real pricing, and store-style links (see apps/mobile/docs/adr/0021-*).
 * The dark brand language (warm near-black, sage accent, Manrope) is unchanged.
 *
 * StoreKit is still deferred (v1 has no billing): the CTA just advances the gate,
 * and "View all plans" / "Promo code" / "Restore purchases" are cosmetic no-ops
 * (TODO(polish)). A real trial state is Control-Plane-reported (packages/api-contract).
 */
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  OnboardingAction,
  OnboardingGlyphIcon,
  OnboardingProgressDots,
  OnboardingReveal,
  type OnboardingGlyph,
} from "../../../design/onboarding";
import { fontFamily, onboardingColors, onboardingRadii } from "../../../design/onboarding-tokens";
import { useLaunchState } from "../../../providers/launch-state";
import { TERMS_OF_SERVICE_URL } from "./consent-primer";

interface Milestone {
  readonly label: string;
  readonly body: string;
  readonly glyph: OnboardingGlyph;
}

// A real, typed sequence — which is what justifies the accent-colored markers
// (a decorative colored dot would not). Copy is capability-honest: no charge
// before day 7, cancel anytime.
const MILESTONES: readonly Milestone[] = [
  {
    label: "Today",
    glyph: { set: "fa6-solid", name: "lock-open" },
    body: "Full access unlocks — a companion that remembers context across iPhone and Mac.",
  },
  {
    label: "Day 5",
    glyph: { set: "fa6-solid", name: "bell" },
    body: "We remind you before your free trial ends — no surprises.",
  },
  {
    label: "Day 7",
    glyph: { set: "fa6-solid", name: "crown" },
    body: "Your trial ends. Keep everything, or cancel anytime before you are charged.",
  },
];

export function FreeTrial(): React.JSX.Element {
  const { setTrial } = useLaunchState();
  const insets = useSafeAreaInsets();

  const openTerms = () => void Linking.openURL(TERMS_OF_SERVICE_URL).catch(() => {});

  return (
    <View style={styles.screen} testID="free-trial-paywall">
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <OnboardingProgressDots progress={{ current: 6, total: 6 }} />
      </View>

      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 12 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <OnboardingReveal index={0}>
          <Text style={styles.headline}>
            Enjoy your first week, <Text style={styles.headlineAccent}>it&apos;s free!</Text>
          </Text>
        </OnboardingReveal>

        <OnboardingReveal index={1} style={styles.timeline}>
          {MILESTONES.map((milestone, index) => {
            const isLast = index === MILESTONES.length - 1;
            return (
              <View key={milestone.label} style={styles.timelineRow}>
                <View style={styles.rail}>
                  <View style={styles.railBadge}>
                    <OnboardingGlyphIcon
                      glyph={milestone.glyph}
                      size={15}
                      color={onboardingColors.accent}
                    />
                  </View>
                  {isLast ? null : <View style={styles.railLine} />}
                </View>
                <View style={[styles.timelineCopy, isLast ? styles.timelineCopyLast : null]}>
                  <Text style={styles.timelineLabel}>{milestone.label}</Text>
                  <Text style={styles.timelineBody}>{milestone.body}</Text>
                </View>
              </View>
            );
          })}
        </OnboardingReveal>

        <OnboardingReveal index={2} style={styles.offer}>
          <Text style={styles.pricing}>
            Unlimited access for 7 days, then $39.99/yr
            <Text style={styles.pricingMuted}> · $3.25/mo</Text>
          </Text>

          <OnboardingAction
            variant="accent"
            label="Start free trial"
            onPress={() => setTrial("completed")}
          />

          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            style={styles.planLink}
            onPress={() => {
              // TODO(polish): open the full plan comparison once billing lands.
            }}
          >
            <Text style={styles.planLinkText}>View all plans</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            style={styles.promo}
            onPress={() => {
              // TODO(polish): reveal a promo-code field once billing lands.
            }}
          >
            <OnboardingGlyphIcon
              glyph={{ set: "fa6-solid", name: "tag" }}
              size={12}
              color={onboardingColors.inkSubtle}
            />
            <Text style={styles.promoText}>Have a promo code?</Text>
          </Pressable>
        </OnboardingReveal>

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              // TODO(polish): StoreKit `restorePurchases()` once billing lands.
            }}
          >
            <Text style={styles.footerLink}>Restore purchases</Text>
          </Pressable>
          <Text style={styles.footerDot}> · </Text>
          <Text accessibilityRole="link" style={styles.footerLink} onPress={openTerms}>
            Terms of Service
          </Text>
        </View>

        {__DEV__ ? (
          <Text style={styles.devCaption}>
            Dev: StoreKit billing is not wired yet — this action only advances the gate.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: onboardingColors.canvas,
    flex: 1,
  },
  topBar: {
    alignItems: "center",
    paddingBottom: 8,
    paddingHorizontal: 24,
  },
  scrollContent: {
    flexGrow: 1,
    gap: 22,
    paddingHorizontal: 28,
    paddingTop: 12,
  },
  headline: {
    color: onboardingColors.ink,
    fontFamily: fontFamily(800),
    fontSize: 30,
    letterSpacing: -0.4,
    lineHeight: 37,
  },
  headlineAccent: {
    color: onboardingColors.accent,
    fontFamily: fontFamily(800),
  },
  timeline: {
    backgroundColor: onboardingColors.surface,
    borderColor: onboardingColors.border,
    borderRadius: onboardingRadii.card,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  timelineRow: {
    flexDirection: "row",
    gap: 14,
  },
  rail: {
    alignItems: "center",
    width: 34,
  },
  railBadge: {
    alignItems: "center",
    backgroundColor: "rgba(107, 158, 138, 0.16)",
    borderRadius: 17,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  railLine: {
    backgroundColor: onboardingColors.borderStrong,
    flex: 1,
    marginVertical: 4,
    width: 2,
  },
  timelineCopy: {
    flex: 1,
    gap: 3,
    paddingBottom: 20,
    paddingTop: 4,
  },
  timelineCopyLast: {
    paddingBottom: 0,
  },
  timelineLabel: {
    color: onboardingColors.ink,
    fontFamily: fontFamily(700),
    fontSize: 15,
  },
  timelineBody: {
    color: onboardingColors.inkMuted,
    fontFamily: fontFamily(400),
    fontSize: 13,
    lineHeight: 19,
  },
  offer: {
    gap: 14,
  },
  pricing: {
    color: onboardingColors.ink,
    fontFamily: fontFamily(600),
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  pricingMuted: {
    color: onboardingColors.inkSubtle,
    fontFamily: fontFamily(500),
  },
  planLink: {
    alignItems: "center",
    paddingVertical: 2,
  },
  planLinkText: {
    color: onboardingColors.ink,
    fontFamily: fontFamily(600),
    fontSize: 14,
  },
  promo: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    paddingVertical: 2,
  },
  promoText: {
    color: onboardingColors.inkSubtle,
    fontFamily: fontFamily(500),
    fontSize: 13,
  },
  footer: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    paddingTop: 2,
  },
  footerLink: {
    color: onboardingColors.inkSubtle,
    fontFamily: fontFamily(500),
    fontSize: 12,
  },
  footerDot: {
    color: onboardingColors.inkSubtle,
    fontFamily: fontFamily(500),
    fontSize: 12,
  },
  devCaption: {
    color: onboardingColors.inkSubtle,
    fontFamily: fontFamily(400),
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center",
  },
});
