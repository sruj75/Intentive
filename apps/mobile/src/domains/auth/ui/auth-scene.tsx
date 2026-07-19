import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { PrimaryButton } from "../../../design/primitives";
import { mobileTheme as theme } from "../../../design/theme";
import { authContent as content } from "../config/content";
import type { AuthProviderId } from "../types/auth";

/**
 * Presentation for the Identity Gate. The two sign-in options are Apple and
 * Google; each button just names the **Auth Provider** it should try. It owns
 * no capability honesty — the composed `onSignIn` (route → Auth Adapter)
 * decides whether that provider genuinely runs (a not-yet-configured provider
 * short-circuits to `not-configured`), and the entrypoint advances only on a
 * real `signed-in` outcome. See ADR 0012 / 0024.
 */
export function AuthScene({ onSignIn }: { readonly onSignIn: (provider: AuthProviderId) => void }) {
  const { height } = useWindowDimensions();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.authContent,
        {
          minHeight: Math.max(
            theme.component.auth.contentMinHeight,
            height - theme.component.auth.windowInset,
          ),
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.authHero}>
        <Text selectable style={styles.authGreeting}>
          {content.greetingLead}
          <Text style={styles.authAccent}>{content.greetingAccent}</Text>
        </Text>
      </View>
      <View style={styles.authActions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onSignIn("apple")}
          style={({ pressed }) => [styles.appleButton, pressed && styles.pressed]}
          testID="continue-with-apple"
        >
          <Text style={styles.appleMark}>●</Text>
          <Text style={styles.appleLabel}>{content.apple}</Text>
        </Pressable>
        <PrimaryButton
          label={content.google}
          onPress={() => onSignIn("google")}
          testID="continue-with-google"
        />
        <Text selectable style={styles.legal}>
          {content.legal}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: theme.component.auth.pressedOpacity },
  authContent: {
    paddingHorizontal: theme.space.xl,
    paddingTop: theme.space.xxl,
    paddingBottom: theme.space.xl,
    justifyContent: "space-between",
    gap: theme.space.xl,
  },
  authHero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: theme.component.auth.heroMinHeight,
  },
  authGreeting: {
    ...theme.component.auth.greeting,
    color: theme.color.ink,
    textAlign: "center",
  },
  authAccent: { color: theme.color.accent },
  authActions: { gap: theme.space.sm },
  appleButton: {
    minHeight: theme.component.auth.appleButtonMinHeight,
    borderWidth: theme.stroke.hairline,
    borderColor: theme.color.hairline,
    borderRadius: theme.radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space.sm,
  },
  appleMark: { color: theme.color.ink, fontSize: theme.component.auth.appleMarkSize },
  appleLabel: { ...theme.type.label, color: theme.color.ink },
  legal: {
    ...theme.type.caption,
    color: theme.color.secondaryInk,
    textAlign: "center",
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.xs,
  },
});
