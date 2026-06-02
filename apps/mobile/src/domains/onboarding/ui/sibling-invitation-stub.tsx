/**
 * Sibling Client Invitation (macOS Setup) — DEV STUB. Replaced in #21.
 * Skippable: TWO buttons prove `completed` and `skipped` both advance to chat.
 * Keep the `setSiblingInvitation(...)` calls; swap the buttons for real UX.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useLaunchState } from "../../../providers/launch-state";

export function SiblingInvitationStub(): React.JSX.Element {
  const { setSiblingInvitation } = useLaunchState();
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Sibling Client Invitation</Text>
      <Text style={styles.subtitle}>Set up the Mac for desktop context — or skip for now.</Text>
      <Pressable
        accessibilityRole="button"
        style={styles.devButton}
        onPress={() => setSiblingInvitation("completed")}
      >
        <Text style={styles.devButtonText}>Complete setup (dev)</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={styles.devButtonSecondary}
        onPress={() => setSiblingInvitation("skipped")}
      >
        <Text style={styles.devButtonSecondaryText}>Skip for now (dev)</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  title: { fontSize: 24, fontWeight: "600" },
  subtitle: { fontSize: 15, opacity: 0.6, textAlign: "center" },
  devButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "#1f6feb",
  },
  devButtonText: { color: "white", fontSize: 16, fontWeight: "600" },
  devButtonSecondary: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f6feb",
  },
  devButtonSecondaryText: { color: "#1f6feb", fontSize: 16, fontWeight: "600" },
});
