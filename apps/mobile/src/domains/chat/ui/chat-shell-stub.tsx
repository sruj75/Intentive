/**
 * Companion Chat — DEV STUB. Replaced by the Liquid Glass chat shell (#45) and
 * wired to the Protocol client (#33). Placeholder only: proves the resolver
 * lands a fully-onboarded user here.
 */
import { StyleSheet, Text, View } from "react-native";

export function ChatShellStub(): React.JSX.Element {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Companion Chat</Text>
      <Text style={styles.subtitle}>You&apos;ve reached the chat home (dev placeholder).</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  title: { fontSize: 24, fontWeight: "600" },
  subtitle: { fontSize: 15, opacity: 0.6, textAlign: "center" },
});
