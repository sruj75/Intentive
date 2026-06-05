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
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

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
      <Text style={styles.title}>Intentive</Text>
      <Text style={styles.subtitle}>
        Sign in so your companion remembers you — your context and conversations stay with you
        across iPhone and Mac.
      </Text>

      <SignInButton
        label="Continue with Google"
        busy={busy === "google"}
        disabled={busy !== null}
        onPress={() => void signInWith("google")}
      />
      <SignInButton
        label="Continue with Apple"
        busy={busy === "apple"}
        disabled={busy !== null}
        onPress={() => void signInWith("apple")}
      />

      {__DEV__ ? (
        <SignInButton
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
    </View>
  );
}

function SignInButton({
  label,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
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

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  title: { fontSize: 28, fontWeight: "700" },
  subtitle: { fontSize: 15, opacity: 0.6, textAlign: "center", marginBottom: 12 },
  button: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "#1f6feb",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "white", fontSize: 16, fontWeight: "600" },
  notice: { marginTop: 8, fontSize: 14, color: "#b3261e", textAlign: "center" },
});
