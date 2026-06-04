/**
 * Consent Primer — the signed-in-but-not-consented gate (#20). A single
 * affirmative explainer of memory, follow-ups, and user control; accepting
 * writes `consent: "completed"` into Launch State via the store's `setConsent`
 * mutator (the seam #18 left), and the resolver/root layout owns the redirect —
 * this screen never navigates itself.
 *
 * No consent service sits between the screen and the store: consent has no
 * external system to hide, so a wrapper would be a shallow module (ADR 0013).
 * The durable POST /consent and cross-client suppression are the Control Plane's
 * (#26). Copy stays capability-honest — the "control" line promises no review/
 * clear button (that is the Account Surface's, #46). This screen requests no
 * notification permission and imports nothing notification-related.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useLaunchState } from "../../../providers/launch-state";

export function ConsentPrimer(): React.JSX.Element {
  const { setConsent } = useLaunchState();

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>How Intentive remembers</Text>
      <Text style={styles.subtitle}>
        Your companion works by keeping context over time. Here&apos;s what that means.
      </Text>

      <View style={styles.points}>
        <TrustPoint
          heading="Memory"
          body="It remembers your conversations so you don't start over each time."
        />
        <TrustPoint
          heading="Follow-ups"
          body="It may check in or follow up on things you're working through."
        />
        <TrustPoint heading="Your control" body="You're always in control of what it keeps." />
      </View>

      <Pressable
        accessibilityRole="button"
        style={styles.button}
        onPress={() => setConsent("completed")}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </Pressable>
    </View>
  );
}

function TrustPoint({ heading, body }: { heading: string; body: string }): React.JSX.Element {
  return (
    <View style={styles.point}>
      <Text style={styles.pointHeading}>{heading}</Text>
      <Text style={styles.pointBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  title: { fontSize: 24, fontWeight: "600", textAlign: "center" },
  subtitle: { fontSize: 15, opacity: 0.6, textAlign: "center", marginBottom: 8 },
  points: { alignSelf: "stretch", gap: 16, marginBottom: 8 },
  point: { gap: 2 },
  pointHeading: { fontSize: 16, fontWeight: "600" },
  pointBody: { fontSize: 15, opacity: 0.7 },
  button: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "#1f6feb",
  },
  buttonText: { color: "white", fontSize: 16, fontWeight: "600" },
});
