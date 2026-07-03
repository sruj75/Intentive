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
import { StyleSheet, Text } from "react-native";

import {
  OnboardingAction,
  OnboardingFinePrint,
  OnboardingScreen,
  OnboardingTitle,
} from "../../../design/onboarding";
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
    <OnboardingScreen
      backdrop="welcome"
      backdropLabel="Intentive companion setup with phone and desktop context"
      contentStyle={styles.content}
      sheetMaxHeightRatio={0.52}
    >
      <OnboardingTitle style={styles.title}>Speak. Transcribe. Summarize.</OnboardingTitle>

      <OnboardingAction
        label="Sign in with Apple"
        leadingGlyph={{ set: "fa6-brand", name: "apple" }}
        busy={busy === "apple"}
        disabled={busy !== null}
        onPress={() => void signInWith("apple")}
      />
      <OnboardingAction
        label="Sign in with Google"
        leadingGlyph={{ set: "fa6-brand", name: "google" }}
        busy={busy === "google"}
        disabled={busy !== null}
        onPress={() => void signInWith("google")}
      />

      {__DEV__ ? (
        <OnboardingAction
          variant="secondary"
          label="Continue as dev"
          busy={busy === "dev"}
          disabled={busy !== null}
          onPress={() => void signInWith("dev")}
        />
      ) : null}

      <OnboardingFinePrint>
        By continuing, you agree to use Intentive as a companion that can remember context across
        your signed-in devices.
      </OnboardingFinePrint>

      {notice ? (
        <Text testID="auth-notice" style={styles.notice}>
          {notice}
        </Text>
      ) : null}
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  // Warm ember error, legible on the always-dark onboarding surface (matches the
  // dark-appearance `error` token in DESIGN.md).
  notice: { color: "#E86A52", fontSize: 14, marginTop: 4, textAlign: "center" },
  title: {
    fontSize: 32,
    lineHeight: 38,
    textAlign: "center",
  },
});
