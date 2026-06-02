/**
 * Identity Gate — DEV STUB. Replaced in #19 by the real Google OAuth screen.
 * Keep the `markSignedIn()` call; swap the button for real sign-in UX.
 *
 * Lives in `auth/` because the Identity Gate's logic is sign-in/session — see
 * apps/mobile/docs/adr/0010-*.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useLaunchState } from "../../../providers/launch-state";

export function IdentityGateStub(): React.JSX.Element {
  const { markSignedIn } = useLaunchState();
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Identity Gate</Text>
      <Text style={styles.subtitle}>Sign in to begin your companion relationship.</Text>
      <Pressable accessibilityRole="button" style={styles.devButton} onPress={markSignedIn}>
        <Text style={styles.devButtonText}>Sign in (dev)</Text>
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
