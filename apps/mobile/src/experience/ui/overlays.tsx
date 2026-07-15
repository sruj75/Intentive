import { useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn, FadeOut, SlideInLeft, SlideOutLeft } from "react-native-reanimated";

import { experienceContent as content } from "../content";
import { experienceTheme as theme } from "../theme";
import { useExperience } from "./experience-provider";
import { CircleButton, IdentityControl } from "./primitives";

function DrawerOverlay() {
  const { snapshot, dispatch } = useExperience();
  const { width } = useWindowDimensions();
  const close = () => dispatch({ type: "overlay_closed" });
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .withTestId("drawer-pan")
        .runOnJS(true)
        .activeOffsetX([-15, 15])
        .onEnd((event) => {
          if (event.translationX < -55) close();
        }),
    [dispatch],
  );

  return (
    <View style={StyleSheet.absoluteFill} testID="drawer-overlay">
      <Animated.View
        entering={FadeIn}
        exiting={FadeOut}
        style={[StyleSheet.absoluteFill, styles.scrim]}
      >
        <Pressable
          accessibilityLabel={content.identity.closeMenu}
          onPress={close}
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
            accessibilityLabel={content.settings.open}
            accessibilityRole="button"
            onPress={() => dispatch({ type: "overlay_opened", overlay: "settings" })}
            style={styles.drawerProfile}
            testID="open-settings"
          >
            <View style={styles.profileBadge}>
              <Text style={styles.profileBadgeText}>
                {snapshot.initials || content.identity.initialsFallback}
              </Text>
            </View>
            <Text selectable style={styles.drawerName}>
              {snapshot.firstName || content.identity.nameFallback}
            </Text>
          </Pressable>
          <View style={styles.drawerRows}>
            {content.drawer.rows.map((row, index) => (
              <Pressable
                key={row}
                accessibilityRole="button"
                accessibilityState={{ disabled: true }}
                disabled
                style={styles.drawerRow}
              >
                <Text style={styles.drawerIcon}>{["▰", "◒", "✣"][index]}</Text>
                <Text style={styles.drawerRowText}>{row}</Text>
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
            onPress={close}
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

function SettingsOverlay() {
  const { snapshot, dispatch } = useExperience();
  return (
    <Animated.View
      entering={FadeIn.duration(theme.motion.standard)}
      exiting={FadeOut.duration(theme.motion.quick)}
      style={[StyleSheet.absoluteFill, styles.settings]}
      testID="settings-overlay"
    >
      <View style={styles.settingsHeader}>
        <IdentityControl
          initials={snapshot.initials}
          onPress={() => dispatch({ type: "overlay_opened", overlay: "drawer" })}
          testID="settings-identity-control"
        />
        <Text selectable style={styles.settingsTitle}>
          {content.settings.title}
        </Text>
        <View style={styles.settingsHeaderBalance} />
      </View>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.settingsContent}
        keyboardDismissMode="interactive"
      >
        <View style={styles.profileBlock}>
          <View style={styles.largeProfileBadge}>
            <Text style={styles.largeProfileText}>
              {snapshot.initials || content.identity.initialsFallback}
            </Text>
            <CircleButton
              accessibilityLabel={content.settings.addPhotoUnavailable}
              disabled
              label="+"
            />
          </View>
          <Text selectable style={styles.profileName}>
            {snapshot.fullName || content.settings.profileFallback}
          </Text>
        </View>
        <View style={styles.settingsRows}>
          <Pressable
            accessibilityRole="button"
            onPress={() => dispatch({ type: "education_replayed" })}
            style={({ pressed }) => [
              styles.settingsAction,
              pressed && styles.settingsActionPressed,
            ]}
            testID="replay-education"
          >
            <Text style={styles.settingsLabel}>{content.settings.replay}</Text>
          </Pressable>
          <View style={styles.toggleRow}>
            <Text selectable style={styles.settingsLabel}>
              {content.settings.proactive}
            </Text>
            <Switch
              accessibilityLabel={content.settings.proactive}
              onValueChange={() =>
                dispatch({ type: "setting_toggled", setting: "proactiveSuggestions" })
              }
              testID="proactive-suggestions-toggle"
              trackColor={{ false: theme.color.surfaceStrong, true: theme.color.action }}
              value={snapshot.settings.proactiveSuggestions}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text selectable style={styles.settingsLabel}>
              {content.settings.privacy}
            </Text>
            <Switch
              accessibilityLabel={content.settings.privacy}
              onValueChange={() => dispatch({ type: "setting_toggled", setting: "privacy" })}
              testID="privacy-toggle"
              trackColor={{ false: theme.color.surfaceStrong, true: theme.color.action }}
              value={snapshot.settings.privacy}
            />
          </View>
          <View style={styles.privacyField}>
            <TextInput
              accessibilityLabel={content.settings.privacyHint}
              multiline
              onChangeText={(value) => dispatch({ type: "privacy_rule_edited", value })}
              placeholder={content.settings.privacyPlaceholder}
              placeholderTextColor={theme.color.mutedInk}
              style={styles.privacyInput}
              testID="privacy-rule-input"
              value={snapshot.settings.additionalPrivacyRules}
            />
            <Text selectable style={styles.privacyHint}>
              {content.settings.privacyHint}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => dispatch({ type: "logged_out" })}
            style={({ pressed }) => [
              styles.settingsAction,
              pressed && styles.settingsActionPressed,
            ]}
            testID="log-out"
          >
            <Text style={styles.settingsLabel}>{content.settings.logout}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Animated.View>
  );
}

export function ExperienceOverlays() {
  const { snapshot } = useExperience();
  if (snapshot.overlay === "drawer") return <DrawerOverlay />;
  if (snapshot.overlay === "settings") return <SettingsOverlay />;
  return null;
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
  settings: { backgroundColor: theme.color.canvas },
  settingsHeader: {
    minHeight: theme.component.settings.headerMinHeight,
    paddingHorizontal: theme.space.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingsHeaderBalance: { width: theme.component.settings.headerBalanceWidth },
  settingsTitle: { ...theme.type.label, color: theme.color.ink },
  settingsContent: { flexGrow: 1, padding: theme.space.lg, gap: theme.space.xxl },
  profileBlock: { alignItems: "center", gap: theme.space.md, paddingTop: theme.space.xl },
  largeProfileBadge: {
    width: theme.component.settings.profileBadgeSize,
    height: theme.component.settings.profileBadgeSize,
    borderRadius: theme.component.settings.profileBadgeSize / 2,
    backgroundColor: theme.color.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  largeProfileText: { fontSize: theme.component.settings.profileTextSize, color: theme.color.ink },
  profileName: { ...theme.type.title, color: theme.color.ink },
  settingsRows: { gap: theme.space.xl },
  settingsAction: { minHeight: theme.component.settings.actionMinHeight, justifyContent: "center" },
  settingsActionPressed: { opacity: theme.component.interaction.softPressedOpacity },
  toggleRow: {
    minHeight: theme.component.settings.rowMinHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingsLabel: { ...theme.type.body, color: theme.color.secondaryInk },
  privacyField: {
    borderBottomWidth: theme.stroke.hairline,
    borderBottomColor: theme.color.hairline,
    gap: theme.space.xs,
  },
  privacyInput: {
    ...theme.type.body,
    color: theme.color.ink,
    minHeight: theme.component.settings.privacyFieldMinHeight,
    paddingVertical: theme.space.xs,
  },
  privacyHint: {
    ...theme.type.caption,
    color: theme.color.secondaryInk,
    paddingBottom: theme.space.sm,
  },
});
