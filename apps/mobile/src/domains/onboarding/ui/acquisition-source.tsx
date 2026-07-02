/**
 * Acquisition Source — the "How did you find us?" step of the Onboarding funnel
 * (name → acquisition source → grant permissions). A pure presentational step:
 * the user picks one option, and Continue calls the injected `onNext` to advance
 * locally within the funnel. It writes nothing to Launch State — only the
 * funnel's last step completes the gate (via `setOnboarding`).
 *
 * TODO(polish): send the chosen source to an acquisition-analytics sink; for the
 * scaffold the selection advances the funnel without being recorded anywhere.
 */
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useMobileTheme, type MobileThemeColors } from "../../../design/theme";

const SOURCES = [
  "App Store",
  "Friend or family",
  "Social media",
  "Web search",
  "News or article",
  "Other",
] as const;

export function AcquisitionSourceStep({ onNext }: { onNext: () => void }): React.JSX.Element {
  const theme = useMobileTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme]);
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <View style={styles.screen}>
      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <Text style={styles.title}>How did you find us?</Text>
        <View style={styles.options}>
          {SOURCES.map((source) => {
            const isSelected = selected === source;
            return (
              <Pressable
                key={source}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                style={[styles.option, isSelected ? styles.optionSelected : null]}
                onPress={() => setSelected(source)}
              >
                <Text style={[styles.optionText, isSelected ? styles.optionTextSelected : null]}>
                  {source}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: selected === null }}
          disabled={selected === null}
          style={[styles.button, selected === null ? styles.buttonDisabled : null]}
          onPress={onNext}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: MobileThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.canvas },
    content: { flexGrow: 1, justifyContent: "flex-end", gap: 24, paddingHorizontal: 24 },
    title: { color: colors.ink, fontSize: 28, fontWeight: "700" },
    options: { gap: 10 },
    option: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.line,
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    optionSelected: { backgroundColor: colors.actionMuted, borderColor: colors.action },
    optionText: { color: colors.ink, fontSize: 16, fontWeight: "500" },
    optionTextSelected: { color: colors.action, fontWeight: "600" },
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
