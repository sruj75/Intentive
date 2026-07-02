/**
 * Get Started — the pre-auth landing, the first thing a cold, signed-out user
 * sees. It is NOT a gate (there is no signed-in truth to project yet): it renders
 * as the first view of the signed-out `/(gates)/identity` zone and steps forward
 * LOCALLY to the sign-in options via the injected `onContinue`. It writes nothing
 * to Launch State and never navigates across a gate boundary.
 *
 * TODO(polish): the hero is a blank themed panel — real Intentive hero art is
 * deferred (never omi's pendant photos). Copy explains continuity, not features.
 */
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useMobileTheme, type MobileThemeColors } from "../../../design/theme";

export function GetStarted({ onContinue }: { onContinue: () => void }): React.JSX.Element {
  const theme = useMobileTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme]);
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.screen, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}
    >
      {/* TODO(polish): replace the blank hero panel with real Intentive art. */}
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel="Intentive"
        style={styles.hero}
      />

      <View style={styles.footer}>
        <Text style={styles.title}>Intentive</Text>
        <Text style={styles.subtitle}>
          A proactive companion that remembers your context and stays with you across iPhone and
          Mac.
        </Text>
        <Pressable accessibilityRole="button" style={styles.button} onPress={onContinue}>
          <Text style={styles.buttonText}>Get Started</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: MobileThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 24 },
    hero: {
      flex: 1,
      alignSelf: "stretch",
      backgroundColor: colors.surfaceMuted,
      borderRadius: 24,
      marginBottom: 32,
    },
    footer: { gap: 12 },
    title: { color: colors.ink, fontSize: 32, fontWeight: "700", textAlign: "center" },
    subtitle: {
      color: colors.inkMuted,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 12,
      textAlign: "center",
    },
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
