import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { PrimaryButton } from "../../../design/primitives";
import { mobileTheme as theme } from "../../../design/theme";
import { authContent as content } from "../config/content";

export function AuthScene({ onAuthenticated }: { readonly onAuthenticated: () => void }) {
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
          onPress={onAuthenticated}
          style={({ pressed }) => [styles.appleButton, pressed && styles.pressed]}
          testID="continue-with-apple"
        >
          <Text style={styles.appleMark}>●</Text>
          <Text style={styles.appleLabel}>{content.apple}</Text>
        </Pressable>
        <PrimaryButton
          label={content.phone}
          onPress={onAuthenticated}
          testID="continue-with-phone"
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
