import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { brandIdentity } from "../../../design/brand";
import { CircleButton, IdentityControl } from "../../../design/primitives";
import { mobileTheme as theme } from "../../../design/theme";
import { accountContent as content } from "../config/content";
import type { AccountSettingsActions } from "../types/settings";

interface AccountSettingsSnapshot {
  readonly proactiveSuggestions: boolean;
  readonly privacy: boolean;
  readonly additionalPrivacyRules: string;
}

export interface AccountSettingsRenderValue {
  readonly proactiveSuggestions: boolean;
  readonly renderSettings: (actions: AccountSettingsActions) => ReactNode;
}

const initialSettings: AccountSettingsSnapshot = {
  proactiveSuggestions: true,
  privacy: true,
  additionalPrivacyRules: "",
};

export function AccountSettingsBoundary({
  fullName,
  initials,
  children,
}: {
  readonly fullName: string;
  readonly initials: string;
  readonly children: (value: AccountSettingsRenderValue) => ReactNode;
}) {
  const [settings, setSettings] = useState(initialSettings);
  return children({
    proactiveSuggestions: settings.proactiveSuggestions,
    renderSettings: (actions) => (
      <SettingsOverlay
        actions={actions}
        fullName={fullName}
        initials={initials}
        onPrivacyRuleEdited={(value) =>
          setSettings((current) => ({ ...current, additionalPrivacyRules: value }))
        }
        onToggle={(setting) =>
          setSettings((current) => ({ ...current, [setting]: !current[setting] }))
        }
        settings={settings}
      />
    ),
  });
}

function SettingsOverlay({
  actions,
  fullName,
  initials,
  onPrivacyRuleEdited,
  onToggle,
  settings,
}: {
  readonly actions: AccountSettingsActions;
  readonly fullName: string;
  readonly initials: string;
  readonly onPrivacyRuleEdited: (value: string) => void;
  readonly onToggle: (setting: "proactiveSuggestions" | "privacy") => void;
  readonly settings: AccountSettingsSnapshot;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(theme.motion.standard)}
      exiting={FadeOut.duration(theme.motion.quick)}
      style={[StyleSheet.absoluteFill, styles.settings]}
      testID="settings-overlay"
    >
      <View style={styles.settingsHeader}>
        <IdentityControl
          accessibilityLabel={actions.openDrawerLabel}
          initials={initials}
          onPress={actions.onOpenDrawer}
          testID="settings-identity-control"
        />
        <Text selectable style={styles.settingsTitle}>
          {content.title}
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
              {initials || brandIdentity.initialsFallback}
            </Text>
            <CircleButton accessibilityLabel={content.addPhotoUnavailable} disabled label="+" />
          </View>
          <Text selectable style={styles.profileName}>
            {fullName || content.profileFallback}
          </Text>
        </View>
        <View style={styles.settingsRows}>
          <Pressable
            accessibilityRole="button"
            onPress={actions.onReplayEducation}
            style={({ pressed }) => [
              styles.settingsAction,
              pressed && styles.settingsActionPressed,
            ]}
            testID="replay-education"
          >
            <Text style={styles.settingsLabel}>{content.replay}</Text>
          </Pressable>
          <View style={styles.toggleRow}>
            <Text selectable style={styles.settingsLabel}>
              {content.proactive}
            </Text>
            <Switch
              accessibilityLabel={content.proactive}
              onValueChange={() => onToggle("proactiveSuggestions")}
              testID="proactive-suggestions-toggle"
              trackColor={{ false: theme.color.surfaceStrong, true: theme.color.action }}
              value={settings.proactiveSuggestions}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text selectable style={styles.settingsLabel}>
              {content.privacy}
            </Text>
            <Switch
              accessibilityLabel={content.privacy}
              onValueChange={() => onToggle("privacy")}
              testID="privacy-toggle"
              trackColor={{ false: theme.color.surfaceStrong, true: theme.color.action }}
              value={settings.privacy}
            />
          </View>
          <View style={styles.privacyField}>
            <TextInput
              accessibilityLabel={content.privacyHint}
              multiline
              onChangeText={onPrivacyRuleEdited}
              placeholder={content.privacyPlaceholder}
              placeholderTextColor={theme.color.mutedInk}
              style={styles.privacyInput}
              testID="privacy-rule-input"
              value={settings.additionalPrivacyRules}
            />
            <Text selectable style={styles.privacyHint}>
              {content.privacyHint}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={actions.onLogout}
            style={({ pressed }) => [
              styles.settingsAction,
              pressed && styles.settingsActionPressed,
            ]}
            testID="log-out"
          >
            <Text style={styles.settingsLabel}>{content.logout}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
