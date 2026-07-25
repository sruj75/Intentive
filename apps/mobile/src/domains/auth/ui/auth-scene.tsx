import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { PrimaryButton } from "../../../design/primitives";
import { mobileTheme as theme } from "../../../design/theme";
import { authContent as content } from "../config/content";

/**
 * Presentation for the Identity Gate — a single Google button plus an
 * intentionally stable action area. It owns no auth logic: `onPress` runs the
 * entrypoint's sign-in flow, while `pending` projects the in-flight outcome.
 * `disabled` (Google not a working capability) plus `pending` drive the
 * button's disabled state so a build without the public client IDs shows the
 * button disabled rather than opening a dead OAuth flow. No outcome renders a
 * notice — the action area never reflows, and failure detail reaches Sentry
 * through the Auth Adapter. See ADR 0012 / 0024 / 0030 (amended 2026-07-26).
 */
export function AuthScene({
  disabled,
  pending,
  onPress,
}: {
  readonly disabled: boolean;
  readonly pending: boolean;
  readonly onPress: () => void;
}) {
  const { height } = useWindowDimensions();
  const buttonDisabled = disabled || pending;
  const label = pending ? content.googlePending : content.google;

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
        <PrimaryButton
          disabled={buttonDisabled}
          label={label}
          onPress={onPress}
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
  legal: {
    ...theme.type.caption,
    color: theme.color.secondaryInk,
    textAlign: "center",
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.xs,
  },
});
