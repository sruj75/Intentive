/**
 * Identity Gate — the signed-out entry surface (#19). It calls the Auth Adapter
 * and, on success, flips Launch State via `markSignedIn` (the #18 seam); the
 * resolver/root layout owns the Launch Route transition, so this gate never navigates
 * itself. Copy explains continuity, not features (ADR 0006).
 *
 * Outcome handling is capability-honest: `cancelled` is silent, `not-configured`
 * and `error` surface a recoverable notice — never a fake success. The dev
 * sign-in button renders only under `__DEV__` and never ships (ADR 0012).
 */
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useMobileTheme, type MobileThemeColors } from "../../../design/theme";
import { useLaunchState } from "../../../providers/launch-state";
import type { AuthProviderId } from "../types/auth";
import { useAuthAdapter } from "./auth-context";

/** Shown for any recoverable failure — an `error` outcome or a thrown attempt. */
const RETRY_NOTICE = "Couldn't sign you in. Please try again.";

export function IdentityGate(): React.JSX.Element {
  const adapter = useAuthAdapter();
  const { markSignedIn } = useLaunchState();
  const [busy, setBusy] = useState<AuthProviderId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const theme = useMobileTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme]);
  const insets = useSafeAreaInsets();

  async function signInWith(provider: AuthProviderId): Promise<void> {
    setBusy(provider);
    setNotice(null);
    try {
      const outcome = await adapter.signIn(provider);
      switch (outcome.status) {
        case "signed-in":
          markSignedIn();
          return;
        case "cancelled":
          return; // user backed out — say nothing
        case "not-configured":
          setNotice("That sign-in option isn't available yet.");
          return;
        case "error":
          setNotice(RETRY_NOTICE);
          return;
      }
    } catch {
      // The adapter should map failures to an `error` outcome, but a thrown SDK
      // or network error must never escape as an unhandled rejection — surface
      // the same recoverable notice instead.
      setNotice(RETRY_NOTICE);
    } finally {
      setBusy((current) => (current === provider ? null : current));
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40, paddingTop: insets.top + 72 },
        ]}
        contentInsetAdjustmentBehavior="automatic"
      >
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={styles.title}>
          Intentive
        </Text>
        <Text style={styles.subtitle}>
          Sign in so your companion remembers you — your context and conversations stay with you
          across iPhone and Mac.
        </Text>

        <SignInButton
          styles={styles}
          label="Continue with Google"
          busy={busy === "google"}
          disabled={busy !== null}
          onPress={() => void signInWith("google")}
        />
        <SignInButton
          styles={styles}
          label="Continue with Apple"
          busy={busy === "apple"}
          disabled={busy !== null}
          onPress={() => void signInWith("apple")}
        />

        {__DEV__ ? (
          <SignInButton
            styles={styles}
            label="Continue as dev"
            busy={busy === "dev"}
            disabled={busy !== null}
            onPress={() => void signInWith("dev")}
          />
        ) : null}

        {notice ? (
          <Text testID="auth-notice" style={styles.notice}>
            {notice}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function SignInButton({
  label,
  busy,
  disabled,
  onPress,
  styles,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      style={[styles.button, disabled ? styles.buttonDisabled : null]}
      onPress={onPress}
    >
      {busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

function createStyles(colors: MobileThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.canvas,
    },
    content: {
      alignItems: "center",
      flexGrow: 1,
      gap: 12,
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    title: {
      color: colors.ink,
      fontSize: 28,
      fontWeight: "700",
      maxWidth: "100%",
    },
    subtitle: {
      color: colors.inkMuted,
      fontSize: 15,
      marginBottom: 12,
      textAlign: "center",
    },
    button: {
      alignSelf: "stretch",
      alignItems: "center",
      backgroundColor: colors.action,
      borderRadius: 12,
      paddingHorizontal: 24,
      paddingVertical: 14,
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: "white", fontSize: 16, fontWeight: "600" },
    notice: { color: colors.danger, fontSize: 14, marginTop: 8, textAlign: "center" },
  });
}
