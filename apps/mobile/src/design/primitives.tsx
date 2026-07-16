import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { brandIdentity } from "./brand";
import { mobileTheme as theme } from "./theme";

export function PrimaryButton({
  label,
  onPress,
  testID,
  disabled = false,
  style,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string;
  readonly disabled?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && !disabled && styles.primaryButtonPressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={styles.primaryButtonLabel}>{label}</Text>
    </Pressable>
  );
}

export function CircleButton({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
  testID,
  tone = "muted",
}: {
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly onPress?: () => void;
  readonly disabled?: boolean;
  readonly testID?: string;
  readonly tone?: "muted" | "dark";
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.circleButton,
        tone === "dark" && styles.circleButtonDark,
        pressed && !disabled && styles.circleButtonPressed,
      ]}
    >
      <Text style={[styles.circleButtonLabel, tone === "dark" && { color: theme.color.actionInk }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function IdentityControl({
  accessibilityLabel,
  initials,
  onPress,
  testID = "identity-control",
}: {
  readonly accessibilityLabel: string;
  readonly initials: string;
  readonly onPress: () => void;
  readonly testID?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.identityControl, pressed && styles.identityControlPressed]}
    >
      <View style={styles.identityBadge}>
        <Text style={styles.identityText}>{initials || brandIdentity.initialsFallback}</Text>
      </View>
      <Text style={styles.ellipsis}>⋮</Text>
    </Pressable>
  );
}

export function OrbitalMark({ compact = false }: { readonly compact?: boolean }) {
  const size = compact ? 46 : 96;
  const dot = compact ? 8 : 18;
  return (
    <View
      accessibilityLabel={brandIdentity.mark}
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      {[
        [theme.color.gold, 0.5, 0.05],
        [theme.color.blue, 0.1, 0.36],
        [theme.color.coral, 0.75, 0.38],
        [theme.color.teal, 0.28, 0.76],
        [theme.color.ink, 0.64, 0.76],
      ].map(([color, left, top], index) => (
        <View
          key={String(index)}
          style={{
            position: "absolute",
            left: Number(left) * (size - dot),
            top: Number(top) * (size - dot),
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: String(color),
          }}
        />
      ))}
    </View>
  );
}

export function MediaSlot({
  label,
  children,
}: {
  readonly label: string;
  readonly children?: ReactNode;
}) {
  return (
    <View accessibilityLabel={label} style={styles.mediaSlot}>
      {children ?? (
        <>
          <View style={styles.mediaLineWide} />
          <View style={styles.mediaLine} />
          <View style={styles.mediaTileRow}>
            <View style={[styles.mediaTile, { backgroundColor: theme.color.mediaLavender }]} />
            <View style={[styles.mediaTile, { backgroundColor: theme.color.mediaCoral }]} />
            <View style={[styles.mediaTile, { backgroundColor: theme.color.mediaTeal }]} />
          </View>
        </>
      )}
    </View>
  );
}

export function SceneTransition({
  sceneKey,
  children,
}: {
  readonly sceneKey: string;
  readonly children: ReactNode;
}) {
  return (
    <Animated.View
      key={sceneKey}
      entering={FadeIn.duration(theme.motion.standard)}
      exiting={FadeOut.duration(theme.motion.quick)}
      style={styles.scene}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scene: { flex: 1, backgroundColor: theme.color.canvas },
  primaryButton: {
    minHeight: theme.component.primaryButton.minHeight,
    borderRadius: theme.radius.pill,
    borderCurve: "continuous",
    backgroundColor: theme.color.action,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.space.lg,
  },
  primaryButtonPressed: {
    transform: [{ scale: theme.component.primaryButton.pressedScale }],
    opacity: theme.component.primaryButton.pressedOpacity,
  },
  primaryButtonLabel: { ...theme.type.label, color: theme.color.actionInk },
  disabled: { opacity: theme.component.primaryButton.disabledOpacity },
  circleButton: {
    width: theme.component.circleButton.size,
    height: theme.component.circleButton.size,
    borderRadius: theme.component.circleButton.size / 2,
    backgroundColor: theme.color.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  circleButtonDark: { backgroundColor: theme.color.action },
  circleButtonPressed: { opacity: theme.component.interaction.standardPressedOpacity },
  circleButtonLabel: {
    fontSize: theme.component.circleButton.labelSize,
    lineHeight: theme.component.circleButton.labelLineHeight,
    color: theme.color.secondaryInk,
    textAlign: "center",
  },
  identityControl: {
    minHeight: theme.component.identity.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.component.identity.gap,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.floatingSurface,
    padding: theme.component.identity.padding,
    paddingRight: theme.component.identity.trailingPadding,
    boxShadow: theme.shadow.identity,
  },
  identityControlPressed: { opacity: theme.component.interaction.standardPressedOpacity },
  identityBadge: {
    width: theme.component.identity.badgeSize,
    height: theme.component.identity.badgeSize,
    borderRadius: theme.component.identity.badgeSize / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.color.surfaceStrong,
  },
  identityText: { fontSize: theme.component.identity.textSize, color: theme.color.ink },
  ellipsis: {
    fontSize: theme.component.identity.ellipsisSize,
    lineHeight: theme.component.identity.ellipsisLineHeight,
    color: theme.color.secondaryInk,
  },
  mediaSlot: {
    width: "100%",
    minHeight: theme.component.media.minHeight,
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    backgroundColor: theme.color.surface,
    padding: theme.space.lg,
    justifyContent: "center",
    gap: theme.space.md,
  },
  mediaLineWide: {
    width: "72%",
    height: theme.component.media.wideLineHeight,
    borderRadius: theme.component.media.wideLineHeight / 2,
    backgroundColor: theme.color.mediaLine,
  },
  mediaLine: {
    width: "48%",
    height: theme.component.media.lineHeight,
    borderRadius: theme.component.media.lineHeight / 2,
    backgroundColor: theme.color.mediaLineMuted,
  },
  mediaTileRow: { flexDirection: "row", gap: theme.space.sm, paddingTop: theme.space.sm },
  mediaTile: {
    flex: 1,
    aspectRatio: theme.component.media.tileAspectRatio,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
  },
});
