/**
 * Free Trial — the entitlement gate that sits just before chat. Its own gate
 * (not folded into the funnel) because entitlement re-checks on expiry: a lapsed
 * user sees it again, a subscriber never does (see apps/mobile/docs/adr/0019-*).
 * The single action writes `trial: "completed"` into Launch State via the store's
 * `setTrial` mutator; the resolver/root layout owns the Launch Route to chat.
 *
 * TODO(polish): this is the cosmetic surface only. There is no billing yet — the
 * button just advances. StoreKit / subscription entitlements and a real
 * Control-Plane-reported trial state are deferred (packages/api-contract).
 */
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  OnboardingAction,
  OnboardingBody,
  OnboardingFinePrint,
  OnboardingScreen,
  OnboardingTitle,
} from "../../../design/onboarding";
import { useMobileTheme, type MobileThemeColors } from "../../../design/theme";
import { useLaunchState } from "../../../providers/launch-state";

const TRIAL_STEPS = [
  {
    label: "Today",
    body: "Start with a companion that remembers context across iPhone and Mac.",
  },
  {
    label: "Day 5",
    body: "We remind you before the free trial ends.",
  },
  {
    label: "Day 7",
    body: "You are only charged after the trial unless you cancel first.",
  },
] as const;

export function FreeTrial(): React.JSX.Element {
  const { setTrial } = useLaunchState();
  const theme = useMobileTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme]);

  return (
    <OnboardingScreen
      backdrop="trial"
      backdropLabel="Intentive free trial preview"
      contentStyle={styles.content}
      progress={{ current: 6, total: 6 }}
      sheetMaxHeightRatio={0.72}
    >
      <View style={styles.header}>
        <OnboardingTitle>Enjoy your first week, it&apos;s free!</OnboardingTitle>
        <OnboardingBody>
          Unlimited access for 7 days. Keep your companion after the trial or cancel anytime.
        </OnboardingBody>
      </View>

      <View style={styles.timeline}>
        {TRIAL_STEPS.map((step, index) => (
          <View key={step.label} style={styles.timelineRow}>
            <View style={styles.rail}>
              <View style={[styles.railDot, index === 0 ? styles.railDotActive : null]} />
              {index < TRIAL_STEPS.length - 1 ? <View style={styles.railLine} /> : null}
            </View>
            <View style={styles.timelineCopy}>
              <Text style={styles.timelineLabel}>{step.label}</Text>
              <Text style={styles.timelineBody}>{step.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <OnboardingAction
        variant="accent"
        label="Start free trial"
        onPress={() => setTrial("completed")}
      />
      <OnboardingFinePrint>
        StoreKit billing is not connected yet in this scaffold; this action advances the gate.
      </OnboardingFinePrint>
    </OnboardingScreen>
  );
}

function createStyles(colors: MobileThemeColors) {
  return StyleSheet.create({
    content: { gap: 16 },
    header: { gap: 10 },
    timeline: {
      backgroundColor: "#151515",
      borderColor: "rgba(255, 255, 255, 0.12)",
      borderRadius: 24,
      borderCurve: "continuous",
      borderWidth: 1,
      gap: 0,
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    timelineRow: {
      flexDirection: "row",
      gap: 12,
      minHeight: 68,
    },
    rail: {
      alignItems: "center",
      width: 18,
    },
    railDot: {
      backgroundColor: "rgba(255, 255, 255, 0.28)",
      borderRadius: 7,
      height: 14,
      marginTop: 2,
      width: 14,
    },
    railDotActive: {
      backgroundColor: colors.action,
    },
    railLine: {
      backgroundColor: "rgba(255, 255, 255, 0.18)",
      flex: 1,
      marginVertical: 4,
      width: 2,
    },
    timelineCopy: {
      flex: 1,
      gap: 4,
      paddingBottom: 14,
    },
    timelineLabel: {
      color: "white",
      fontSize: 14,
      fontWeight: "800",
    },
    timelineBody: {
      color: "rgba(255, 255, 255, 0.66)",
      fontSize: 12,
      lineHeight: 16,
    },
  });
}
