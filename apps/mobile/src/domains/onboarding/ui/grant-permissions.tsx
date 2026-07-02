/**
 * Grant Permissions — the last step of the Onboarding funnel (name → acquisition
 * source → grant permissions). omi-style and deliberately simple: it explains why
 * notifications help, and Continue fires the notification permission ask and then
 * advances — always, whatever the user answers in the OS prompt.
 *
 * The permission ask is INJECTED as `requestNotificationPermission`, not imported
 * from the `notifications` domain: onboarding importing notifications would be a
 * cross-domain import (architecture lint forbids it). The `(onboarding)` route —
 * a composition point, not layer-linted — wires the real `expo-notifications`
 * port; tests inject a fake. This step requests notifications only (no location).
 */
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useMobileTheme, type MobileThemeColors } from "../../../design/theme";

/** Minimal shape of the injected ask — declared locally to avoid a cross-domain
 * import of the notifications port. The outcome is ignored: Continue always advances. */
export type RequestNotificationPermission = () => Promise<unknown>;

export function GrantPermissionsStep({
  requestNotificationPermission,
  onNext,
}: {
  requestNotificationPermission: RequestNotificationPermission;
  onNext: () => void;
}): React.JSX.Element {
  const theme = useMobileTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme]);
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  async function onContinue(): Promise<void> {
    setBusy(true);
    try {
      // Fire the OS ask; the answer never blocks onboarding.
      await requestNotificationPermission();
    } catch {
      // A thrown ask must not strand the funnel — advance regardless.
    } finally {
      onNext();
    }
  }

  return (
    <View
      style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.body}>
        <Text style={styles.title}>Stay in the loop</Text>
        <Text style={styles.subtitle}>
          Turn on notifications so your companion can reach you with check-ins and follow-ups when
          something matters.
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        style={[styles.button, busy ? styles.buttonDisabled : null]}
        onPress={() => void onContinue()}
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
    body: { gap: 12 },
    title: { color: colors.ink, fontSize: 28, fontWeight: "700", textAlign: "center" },
    subtitle: { color: colors.inkMuted, fontSize: 15, lineHeight: 22, textAlign: "center" },
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
