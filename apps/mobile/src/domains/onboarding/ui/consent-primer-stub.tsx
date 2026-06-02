/**
 * Consent Primer — DEV STUB. Replaced in #20 by the real consent screen.
 * Keep the `setConsent("completed")` call; swap the button for real consent UX.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useLaunchState } from "../../../providers/launch-state";

export function ConsentPrimerStub(): React.JSX.Element {
  const { setConsent } = useLaunchState();
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Consent Primer</Text>
      <Text style={styles.subtitle}>A short note on memory and follow-ups before chat begins.</Text>
      <Pressable accessibilityRole="button" style={styles.devButton} onPress={() => setConsent("completed")}>
        <Text style={styles.devButtonText}>Accept consent (dev)</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  title: { fontSize: 24, fontWeight: "600" },
  subtitle: { fontSize: 15, opacity: 0.6, textAlign: "center" },
  devButton: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, backgroundColor: "#1f6feb" },
  devButtonText: { color: "white", fontSize: 16, fontWeight: "600" },
});
