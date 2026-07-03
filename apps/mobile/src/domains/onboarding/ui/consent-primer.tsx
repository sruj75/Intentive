/**
 * Consent Primer — the signed-in-but-not-consented gate: the **Data & Privacy**
 * surface. It states what data Intentive collects and how it is processed, links
 * to the Privacy Policy & Terms of Service, and its single affirmative action
 * ("Agree & Continue") is acceptance — writing `consent: "completed"` into
 * Launch State via the store's `setConsent` mutator (the seam #18 left). The
 * resolver/root layout owns the Launch Route; this gate never navigates itself.
 *
 * No consent service sits between the gate and the store: consent has no
 * external system to hide, so a wrapper would be a shallow module (ADR 0013).
 * The durable POST /consent and cross-client suppression are the Control Plane's
 * (#26). This gate requests no notification permission and imports nothing
 * notification-related — that is the separate Grant Permissions step.
 */
import { useMemo } from "react";
import { Linking, StyleSheet, Text } from "react-native";

import {
  OnboardingAction,
  OnboardingBody,
  OnboardingFinePrint,
  OnboardingScreen,
  OnboardingTitle,
} from "../../../design/onboarding";
import { useMobileTheme, type MobileThemeColors } from "../../../design/theme";
import { useLaunchState } from "../../../providers/launch-state";

export const PRIVACY_POLICY_URL = "https://heyintentive.com/privacy";
export const TERMS_OF_SERVICE_URL = "https://heyintentive.com/terms";

const CONSENT_BODY =
  "By continuing, your conversations, recordings, and personal information will be " +
  "securely stored on our servers. Your audio recordings and transcripts are processed " +
  "by third-party AI services — Deepgram for transcription and OpenAI for analysis — to " +
  "provide you with AI-powered insights and enable all app features.";

export function ConsentPrimer(): React.JSX.Element {
  const { setConsent } = useLaunchState();
  const theme = useMobileTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme]);

  const openPrivacy = () => void Linking.openURL(PRIVACY_POLICY_URL).catch(() => {});
  const openTerms = () => void Linking.openURL(TERMS_OF_SERVICE_URL).catch(() => {});

  return (
    <OnboardingScreen
      backdrop="privacy"
      backdropLabel="Intentive privacy review before companion setup"
      progress={{ current: 1, total: 6 }}
      sheetMaxHeightRatio={0.62}
    >
      <OnboardingTitle>Data &amp; Privacy</OnboardingTitle>
      <OnboardingBody>{CONSENT_BODY}</OnboardingBody>
      <OnboardingFinePrint style={styles.finePrint}>
        Your data is protected and governed by our{" "}
        <Text accessibilityRole="link" style={styles.link} onPress={openPrivacy}>
          Privacy Policy
        </Text>{" "}
        and{" "}
        <Text accessibilityRole="link" style={styles.link} onPress={openTerms}>
          Terms of Service
        </Text>
        .
      </OnboardingFinePrint>
      <OnboardingAction label="Agree & Continue" onPress={() => setConsent("completed")} />
    </OnboardingScreen>
  );
}

function createStyles(colors: MobileThemeColors) {
  return StyleSheet.create({
    finePrint: { textAlign: "left" },
    link: { color: colors.action, fontWeight: "700", textDecorationLine: "underline" },
  });
}
