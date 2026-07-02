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
 *
 * TODO(polish): the body below is omi's copy verbatim, used as a scaffold
 * placeholder ONLY. It makes false data claims for Intentive (audio recordings,
 * Deepgram transcription, OpenAI analysis) and MUST be replaced with Intentive's
 * true data flow — and the `#` policy links wired to real docs — before this
 * ships to a real build. See apps/mobile/docs/adr/0020-*.
 */
import { useMemo } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useMobileTheme, type MobileThemeColors } from "../../../design/theme";
import { useLaunchState } from "../../../providers/launch-state";

const CONSENT_BODY =
  "By continuing, your conversations, recordings, and personal information will be " +
  "securely stored on our servers. Your audio recordings and transcripts are processed " +
  "by third-party AI services — Deepgram for transcription and OpenAI for analysis — to " +
  "provide you with AI-powered insights and enable all app features.";

export function ConsentPrimer(): React.JSX.Element {
  const { setConsent } = useLaunchState();
  const theme = useMobileTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme]);
  const insets = useSafeAreaInsets();

  // TODO(polish): wire to the real Privacy Policy / Terms of Service documents.
  const openPolicy = () => void Linking.openURL("#").catch(() => {});

  return (
    <View style={styles.screen}>
      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 24, paddingTop: insets.top + 24 },
        ]}
      >
        <View style={styles.body}>
          <Text style={styles.title}>Data &amp; Privacy</Text>
          <Text style={styles.message}>{CONSENT_BODY}</Text>
          <Text style={styles.fineprint}>
            Your data is protected and governed by our{" "}
            <Text accessibilityRole="link" style={styles.link} onPress={openPolicy}>
              Privacy Policy
            </Text>{" "}
            and{" "}
            <Text accessibilityRole="link" style={styles.link} onPress={openPolicy}>
              Terms of Service
            </Text>
            .
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          style={styles.button}
          onPress={() => setConsent("completed")}
        >
          <Text style={styles.buttonText}>Agree &amp; Continue</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: MobileThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.canvas },
    content: { flexGrow: 1, justifyContent: "flex-end", gap: 24, paddingHorizontal: 24 },
    body: { gap: 16 },
    title: { color: colors.ink, fontSize: 28, fontWeight: "700" },
    message: { color: colors.ink, fontSize: 15, lineHeight: 22 },
    fineprint: { color: colors.inkMuted, fontSize: 13, lineHeight: 18 },
    link: { color: colors.action, textDecorationLine: "underline" },
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
