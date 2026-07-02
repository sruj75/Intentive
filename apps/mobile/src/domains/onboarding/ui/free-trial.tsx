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
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useMobileTheme, type MobileThemeColors } from "../../../design/theme";
import { useLaunchState } from "../../../providers/launch-state";

const BENEFITS = [
  "A companion that remembers your context across iPhone and Mac",
  "Check-ins and follow-ups when things matter",
  "Cancel anytime — no charge during the trial",
] as const;

export function FreeTrial(): React.JSX.Element {
  const { setTrial } = useLaunchState();
  const theme = useMobileTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme]);
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.body}>
        <Text style={styles.title}>Try Intentive free</Text>
        <View style={styles.benefits}>
          {BENEFITS.map((benefit) => (
            <Text key={benefit} style={styles.benefit}>
              {benefit}
            </Text>
          ))}
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        style={styles.button}
        onPress={() => setTrial("completed")}
      >
        <Text style={styles.buttonText}>Start free trial</Text>
      </Pressable>
    </View>
  );
}

function createStyles(colors: MobileThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.canvas,
      justifyContent: "flex-end",
      gap: 32,
      paddingHorizontal: 24,
    },
    body: { gap: 20 },
    title: { color: colors.ink, fontSize: 28, fontWeight: "700", textAlign: "center" },
    benefits: { alignSelf: "stretch", gap: 12 },
    benefit: { color: colors.inkMuted, fontSize: 15, lineHeight: 22, textAlign: "center" },
    button: {
      alignItems: "center",
      alignSelf: "stretch",
      backgroundColor: colors.action,
      borderRadius: 28,
      paddingHorizontal: 24,
      paddingVertical: 16,
    },
    buttonText: { color: "white", fontSize: 16, fontWeight: "600" },
  });
}
