import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn, FadeOut, SlideInLeft, SlideOutLeft } from "react-native-reanimated";

import { brandIdentity } from "../../../design/brand";
import { mobileTheme as theme } from "../../../design/theme";
import { chatContent as content } from "../config/content";

export function DrawerOverlay({
  firstName,
  initials,
  onClose,
  onOpenSettings,
}: {
  readonly firstName: string;
  readonly initials: string;
  readonly onClose: () => void;
  readonly onOpenSettings: () => void;
}) {
  const { width } = useWindowDimensions();
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .withTestId("drawer-pan")
        .runOnJS(true)
        .activeOffsetX([-15, 15])
        .onEnd((event) => {
          if (event.translationX < -55) onClose();
        }),
    [onClose],
  );

  return (
    <View style={StyleSheet.absoluteFill} testID="drawer-overlay">
      <Animated.View
        entering={FadeIn}
        exiting={FadeOut}
        style={[StyleSheet.absoluteFill, styles.scrim]}
      >
        <Pressable
          accessibilityLabel={content.drawer.closeMenu}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
          testID="drawer-scrim"
        />
      </Animated.View>
      <GestureDetector gesture={gesture}>
        <Animated.View
          entering={SlideInLeft.duration(theme.motion.standard)}
          exiting={SlideOutLeft.duration(theme.motion.quick)}
          style={[
            styles.drawer,
            {
              width: Math.min(
                theme.component.drawer.maxWidth,
                width * theme.component.drawer.widthRatio,
              ),
            },
          ]}
          testID="drawer-panel"
        >
          <Pressable
            accessibilityLabel={content.drawer.openSettings}
            accessibilityRole="button"
            onPress={onOpenSettings}
            style={styles.drawerProfile}
            testID="open-settings"
          >
            <View style={styles.profileBadge}>
              <Text style={styles.profileBadgeText}>
                {initials || brandIdentity.initialsFallback}
              </Text>
            </View>
            <Text selectable style={styles.drawerName}>
              {firstName || brandIdentity.name}
            </Text>
          </Pressable>
          <View style={styles.drawerRows}>
            {content.drawer.rows.map((row) => (
              <Pressable
                key={row.id}
                accessibilityRole="button"
                accessibilityState={{ disabled: true }}
                disabled
                style={styles.drawerRow}
              >
                <Text style={styles.drawerIcon}>{row.icon}</Text>
                <Text style={styles.drawerRowText}>{row.label}</Text>
              </Pressable>
            ))}
            <Text selectable style={styles.recentLabel}>
              {content.drawer.recent}
            </Text>
            <Text selectable style={styles.emptyLabel}>
              {content.drawer.empty}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.drawerHome, pressed && styles.drawerHomePressed]}
          >
            <Text style={styles.drawerHomeIcon}>●</Text>
            <Text style={styles.drawerHomeText}>{content.drawer.home}</Text>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: theme.color.scrim },
  drawer: {
    height: "100%",
    backgroundColor: theme.color.canvas,
    borderTopRightRadius: theme.radius.xl,
    borderBottomRightRadius: theme.radius.xl,
    borderCurve: "continuous",
    paddingHorizontal: theme.space.xl,
    paddingTop: theme.space.lg,
    paddingBottom: theme.space.lg,
    boxShadow: theme.shadow.drawer,
  },
  drawerProfile: { flexDirection: "row", alignItems: "center", gap: theme.space.sm },
  profileBadge: {
    width: theme.component.drawer.profileBadgeSize,
    height: theme.component.drawer.profileBadgeSize,
    borderRadius: theme.component.drawer.profileBadgeSize / 2,
    backgroundColor: theme.color.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  profileBadgeText: { fontSize: theme.component.drawer.profileTextSize, color: theme.color.ink },
  drawerName: { ...theme.type.body, color: theme.color.secondaryInk },
  drawerRows: { paddingTop: theme.space.xxl, gap: theme.space.lg },
  drawerRow: { flexDirection: "row", alignItems: "center", gap: theme.space.md },
  drawerIcon: {
    width: theme.component.drawer.iconWidth,
    color: theme.color.ink,
    fontSize: theme.component.drawer.iconSize,
    textAlign: "center",
  },
  drawerRowText: { ...theme.type.bodyLarge, color: theme.color.ink },
  recentLabel: { ...theme.type.label, color: theme.color.mutedInk, paddingTop: theme.space.md },
  emptyLabel: { ...theme.type.body, color: theme.color.mutedInk },
  drawerHome: {
    marginTop: "auto",
    alignSelf: "center",
    minHeight: theme.component.drawer.homeMinHeight,
    borderRadius: theme.radius.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    backgroundColor: theme.color.canvas,
    boxShadow: theme.shadow.floating,
  },
  drawerHomePressed: { opacity: theme.component.interaction.standardPressedOpacity },
  drawerHomeIcon: { fontSize: theme.component.drawer.homeIconSize, color: theme.color.ink },
  drawerHomeText: { ...theme.type.label, color: theme.color.ink },
});
