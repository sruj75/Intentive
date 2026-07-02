/**
 * Name — the first step of the Onboarding funnel (name → acquisition source →
 * grant permissions), the one collapsed gate for the one-time personalization
 * sequence (see apps/mobile/docs/adr/0019-*). A pure presentational step: it
 * collects a display name and calls the injected `onNext` to advance locally
 * within the funnel. It writes nothing to Launch State — only the funnel's last
 * step completes the gate (via `setOnboarding`). The name value is intentionally
 * not modeled in Launch State.
 *
 * TODO(polish): persist the entered name to the Control Plane (packages/api-contract);
 * for the scaffold it advances the funnel without being stored anywhere.
 */
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useMobileTheme, type MobileThemeColors } from "../../../design/theme";

export function NameStep({ onNext }: { onNext: () => void }): React.JSX.Element {
  const theme = useMobileTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme]);
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const canContinue = name.trim().length > 0;

  return (
    <View
      style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.body}>
        <Text style={styles.title}>What&apos;s your name?</Text>
        <TextInput
          accessibilityLabel="Your name"
          value={name}
          onChangeText={setName}
          placeholder="Enter your name"
          placeholderTextColor={theme.colors.inkSubtle}
          style={styles.input}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={() => canContinue && onNext()}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !canContinue }}
        disabled={!canContinue}
        style={[styles.button, canContinue ? null : styles.buttonDisabled]}
        onPress={onNext}
      >
        <Text style={styles.buttonText}>Continue</Text>
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
    input: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.line,
      borderRadius: 16,
      borderWidth: 1,
      color: colors.ink,
      fontSize: 18,
      paddingHorizontal: 24,
      paddingVertical: 18,
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
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: "white", fontSize: 16, fontWeight: "600" },
  });
}
